package com.katomus.godard.docker;

import com.katomus.godard.persistence.ActivityRepository;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
class DockerComposeService {

  private static final Pattern PROJECT_NAME = Pattern.compile("[a-z0-9][a-z0-9_-]{0,62}");
  private static final int MAX_FILE_BYTES = 2 * 1024 * 1024;
  private static final int MAX_STREAM_CHARS = 4 * 1024 * 1024;
  private static final int MAX_FAILURE_LENGTH = 500;
  private static final long UPDATE_TIMEOUT_SECONDS = 300;
  private static final String ENV_FILE = ".env";
  private static final String COMPOSE_FILE = "docker-compose.yml";
  private static final Set<Path> UPDATING_PROJECTS = ConcurrentHashMap.newKeySet();

  private record ComposeProject(String name, List<Path> files) {

    Path mainFile() {
      return files.getFirst();
    }

    Path envFile() {
      return mainFile().resolveSibling(ENV_FILE);
    }
  }

  private final DockerComposeClient client;
  private final DockerServiceFolderService serviceFolderService;
  private final DockerService dockerService;
  private final Consumer<String> activityRecorder;

  @Autowired
  DockerComposeService(
      DockerComposeClient client,
      DockerServiceFolderService serviceFolderService,
      DockerService dockerService,
      ActivityRepository activityRepository) {
    this(
        client,
        serviceFolderService,
        dockerService,
        message -> activityRepository.create("container", "muted", message));
  }

  DockerComposeService(
      DockerComposeClient client,
      DockerServiceFolderService serviceFolderService,
      DockerService dockerService,
      Consumer<String> activityRecorder) {
    this.client = client;
    this.serviceFolderService = serviceFolderService;
    this.dockerService = dockerService;
    this.activityRecorder = activityRecorder;
  }

  DockerComposeFiles files(String containerId) {
    ComposeProject project = project(containerId).orElseThrow(this::missingConfiguration);
    try {
      return new DockerComposeFiles(
          project.mainFile().toString(),
          project.envFile().toString(),
          contentOf(project.mainFile()),
          contentOf(project.envFile()));
    } catch (IOException exception) {
      throw new DockerException(
          HttpStatus.UNPROCESSABLE_CONTENT,
          "Não foi possível ler os arquivos de configuração do container.");
    }
  }

  void save(String containerId, DockerComposeFilesRequest request) {
    requireFiles(request);
    if (dockerService.isProtected(containerId)) {
      throw new DockerException(HttpStatus.FORBIDDEN, "Este é o container da própria aplicação.");
    }
    ComposeProject project = project(containerId).orElseThrow(this::missingConfiguration);
    Path compose = project.mainFile();
    Path env = project.envFile();
    try {
      String previousCompose = contentOf(compose);
      boolean envExisted = Files.isRegularFile(env);
      String previousEnv = contentOf(env);
      try {
        writeAtomically(compose, request.compose());
        if (envExisted || !request.env().isEmpty()) {
          writeAtomically(env, request.env());
        }
        DockerCommandResult validation = client.validateCompose(project.name(), project.files());
        if (!validation.successful()) {
          throw commandFailure(validation, "A configuração Compose não é válida.");
        }
      } catch (IOException | DockerException exception) {
        restoreFiles(compose, previousCompose, env, envExisted, previousEnv);
        if (exception instanceof DockerException dockerException) {
          throw dockerException;
        }
        throw new DockerException(
            HttpStatus.UNPROCESSABLE_CONTENT,
            "Não foi possível salvar os arquivos de configuração do container.");
      }
      activityRecorder.accept("Arquivos do container atualizados");
    } catch (IOException exception) {
      throw new DockerException(
          HttpStatus.UNPROCESSABLE_CONTENT,
          "Não foi possível salvar os arquivos de configuração do container.");
    }
  }

  void create(String name, DockerComposeFilesRequest request) {
    requireProjectName(name);
    requireFiles(request);
    Path serviceFolder = serviceFolderService.requirePath();
    Path containersFolder = serviceFolder.resolve("containers").normalize();
    Path folder = containersFolder.resolve(name).normalize();
    if (!folder.startsWith(containersFolder)) {
      throw new DockerException(HttpStatus.BAD_REQUEST, "Nome de container inválido.");
    }
    if (Files.exists(folder)) {
      throw new DockerException(HttpStatus.CONFLICT, "Já existe um container com esse nome.");
    }
    List<Path> files = List.of(folder.resolve(COMPOSE_FILE));
    try {
      Files.createDirectories(folder);
      writeAtomically(files.getFirst(), request.compose());
      writeAtomically(folder.resolve(ENV_FILE), request.env());
      DockerCommandResult validation = client.validateCompose(name, files);
      if (!validation.successful()) {
        deleteFolder(folder);
        throw commandFailure(validation, "A configuração Compose não é válida.");
      }
      DockerCommandResult started = client.startCompose(name, files);
      if (!started.successful()) {
        client.stopCompose(name, files);
        deleteFolder(folder);
        throw commandFailure(started, "Não foi possível criar o container.");
      }
      activityRecorder.accept("Container " + name + " criado");
    } catch (IOException exception) {
      deleteAfterFailure(folder);
      throw new DockerException(
          HttpStatus.UNPROCESSABLE_CONTENT, "Não foi possível criar o container.");
    }
  }

  void requireUpdatable(String containerId) {
    if (dockerService.isProtected(containerId)) {
      throw new DockerException(HttpStatus.FORBIDDEN, "Este é o container da própria aplicação.");
    }
    project(containerId).orElseThrow(this::missingConfiguration);
  }

  boolean update(String containerId, Consumer<String> output, BooleanSupplier active) {
    if (dockerService.isProtected(containerId)) {
      output.accept("Este é o container da própria aplicação.\n");
      return false;
    }
    Optional<ComposeProject> found = project(containerId);
    if (found.isEmpty()) {
      output.accept("Este container não tem arquivo de configuração.\n");
      return false;
    }
    ComposeProject project = found.get();
    Path key = project.mainFile().toAbsolutePath().normalize();
    if (!UPDATING_PROJECTS.add(key)) {
      output.accept("Já existe uma atualização em andamento para este projeto.\n");
      return false;
    }
    try {
      if (!stream(client.pullCompose(project.name(), project.files()), output, active)) {
        return false;
      }
      DockerCommandResult running = client.projectContainers(project.name());
      if (!running.successful()) {
        output.accept("Não foi possível verificar o estado do projeto.\n");
        return false;
      }
      if (running.output().isBlank()) {
        output.accept("Imagem baixada. O container está parado e continua parado.\n");
        activityRecorder.accept("Imagem do container atualizada");
        return true;
      }
      boolean updated =
          stream(client.recreateCompose(project.name(), project.files()), output, active);
      if (updated) {
        activityRecorder.accept("Container atualizado");
      }
      return updated;
    } catch (IOException exception) {
      output.accept("Não foi possível iniciar a atualização do container.\n");
      return false;
    } finally {
      UPDATING_PROJECTS.remove(key);
    }
  }

  private Optional<ComposeProject> project(String containerId) {
    DockerService.requireContainerId(containerId);
    DockerCommandResult inspected = client.inspectComposeProject(containerId);
    if (!inspected.successful()) {
      throw commandFailure(inspected, "Não foi possível localizar a configuração do container.");
    }
    String[] lines = inspected.output().split("\\R", -1);
    if (lines.length < 2
        || lines[0].isBlank()
        || lines[1].isBlank()
        || !PROJECT_NAME.matcher(lines[0]).matches()) {
      return Optional.empty();
    }
    try {
      List<Path> files =
          List.of(lines[1].split(",")).stream()
              .map(String::strip)
              .filter(path -> !path.isEmpty())
              .map(Path::of)
              .map(path -> path.toAbsolutePath().normalize())
              .toList();
      if (files.isEmpty() || !Files.isRegularFile(files.getFirst())) {
        return Optional.empty();
      }
      return Optional.of(new ComposeProject(lines[0], files));
    } catch (RuntimeException exception) {
      return Optional.empty();
    }
  }

  private static boolean stream(Process process, Consumer<String> output, BooleanSupplier active) {
    int written = 0;
    AtomicBoolean timedOut = new AtomicBoolean();
    process
        .onExit()
        .orTimeout(UPDATE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .exceptionally(
            exception -> {
              timedOut.set(true);
              process.destroyForcibly();
              return null;
            });
    try (Reader reader = new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8)) {
      char[] buffer = new char[8_192];
      int read = reader.read(buffer);
      while (read >= 0) {
        if (!active.getAsBoolean()) {
          process.destroyForcibly();
          return false;
        }
        if (written + read > MAX_STREAM_CHARS) {
          output.accept("\n[saída da atualização excedeu o limite da sessão]\n");
          process.destroyForcibly();
          return false;
        }
        output.accept(new String(buffer, 0, read));
        written += read;
        read = reader.read(buffer);
      }
      int exitCode = process.waitFor();
      if (timedOut.get()) {
        output.accept("A atualização excedeu o tempo limite de 5 minutos.\n");
        return false;
      }
      return exitCode == 0;
    } catch (IOException exception) {
      output.accept("Não foi possível ler a saída da atualização.\n");
      return false;
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      process.destroyForcibly();
      return false;
    } finally {
      process.destroyForcibly();
    }
  }

  private static void requireFiles(DockerComposeFilesRequest request) {
    if (request == null
        || request.compose() == null
        || request.env() == null
        || request.compose().getBytes(StandardCharsets.UTF_8).length > MAX_FILE_BYTES
        || request.env().getBytes(StandardCharsets.UTF_8).length > MAX_FILE_BYTES) {
      throw new DockerException(HttpStatus.BAD_REQUEST, "Arquivos de configuração inválidos.");
    }
  }

  private static void requireProjectName(String name) {
    if (name == null || !PROJECT_NAME.matcher(name).matches()) {
      throw new DockerException(
          HttpStatus.BAD_REQUEST, "Use letras minúsculas, números, hífen ou sublinhado no nome.");
    }
  }

  private static String contentOf(Path file) throws IOException {
    if (!Files.isRegularFile(file)) {
      return "";
    }
    if (Files.size(file) > MAX_FILE_BYTES) {
      throw new IOException("arquivo excede o limite");
    }
    return Files.readString(file);
  }

  private static void writeAtomically(Path file, String content) throws IOException {
    byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
    if (bytes.length > MAX_FILE_BYTES) {
      throw new IOException("arquivo excede o limite");
    }
    Path parent = file.toAbsolutePath().normalize().getParent();
    if (parent == null) {
      throw new IOException("sem pasta para o arquivo");
    }
    Path temporary = Files.createTempFile(parent, ".godard-stack-", ".tmp");
    try {
      Files.write(temporary, bytes);
      try {
        Files.move(
            temporary, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
      } catch (AtomicMoveNotSupportedException exception) {
        Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING);
      }
    } finally {
      Files.deleteIfExists(temporary);
    }
  }

  private static void restoreEnv(Path env, boolean existed, String content) throws IOException {
    if (existed) {
      writeAtomically(env, content);
    } else {
      Files.deleteIfExists(env);
    }
  }

  private static void restoreFiles(
      Path compose, String previousCompose, Path env, boolean envExisted, String previousEnv) {
    try {
      writeAtomically(compose, previousCompose);
      restoreEnv(env, envExisted, previousEnv);
    } catch (IOException ignored) {
    }
  }

  private static void deleteFolder(Path folder) throws IOException {
    if (!Files.exists(folder)) {
      return;
    }
    try (Stream<Path> entries = Files.walk(folder)) {
      for (Path entry : entries.sorted(Comparator.reverseOrder()).toList()) {
        Files.delete(entry);
      }
    }
  }

  private static void deleteAfterFailure(Path folder) {
    try {
      deleteFolder(folder);
    } catch (IOException ignored) {
    }
  }

  private DockerException missingConfiguration() {
    return new DockerException(
        HttpStatus.NOT_FOUND, "Este container não tem arquivo de configuração.");
  }

  private static DockerException commandFailure(DockerCommandResult result, String fallback) {
    if (result.timedOut()) {
      return new DockerException(
          HttpStatus.GATEWAY_TIMEOUT, "O Docker não respondeu no tempo esperado.");
    }
    if (result.outputLimitReached()) {
      return new DockerException(
          HttpStatus.UNPROCESSABLE_CONTENT, "A saída do Docker excedeu o limite seguro.");
    }
    String detail =
        result.output() == null ? "" : result.output().replaceAll("[\\r\\n]+", " ").strip();
    return new DockerException(
        HttpStatus.UNPROCESSABLE_CONTENT,
        detail.isEmpty()
            ? fallback
            : fallback + " " + detail.substring(0, Math.min(detail.length(), MAX_FAILURE_LENGTH)));
  }
}
