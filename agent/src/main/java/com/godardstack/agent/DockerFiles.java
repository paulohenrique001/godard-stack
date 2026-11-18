package com.godardstack.agent;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.regex.Pattern;
import java.util.stream.Stream;

final class DockerFiles {

    private static final Pattern PROJECT_NAME = Pattern.compile("[a-z0-9][a-z0-9_-]{0,62}");
    private static final String OK_LINE = "ok\n";
    private static final String OK = "ok";
    private static final String FAILED = "failed\n";
    private static final String MISSING = "missing";
    private static final String INVALID = FAILED + "pedido inválido";
    private static final String ENV_FILE = ".env";
    private static final String COMPOSE_FILE = "docker-compose.yml";
    private static final String CONTAINERS_FOLDER = "containers";
    private static final String LABEL_SEPARATOR = ",";
    private static final String INSPECT_FORMAT = "{{index .Config.Labels \"com.docker.compose.project\"}}\n"
            + "{{index .Config.Labels \"com.docker.compose.project.config_files\"}}";
    private static final long VALIDATE_TIMEOUT_SECONDS = 20;
    private static final long UP_TIMEOUT_SECONDS = 300;
    private static final int OUTPUT_BUFFER_CHARS = 4096;
    private static final long MAX_FILE_BYTES = 2L * 1024 * 1024;
    private static final Set<Path> UPDATING_PROJECTS = ConcurrentHashMap.newKeySet();

    private record ComposeProject(String name, List<Path> files) {

        Path mainFile() {
            return files.getFirst();
        }

        Path envFile() {
            return mainFile().resolveSibling(ENV_FILE);
        }
    }

    private DockerFiles() {
    }

    static String read(String container) {
        try {
            Optional<ComposeProject> project = project(container);
            if (project.isEmpty()) {
                return MISSING;
            }
            Path compose = project.get().mainFile();
            Path env = project.get().envFile();
            return String.join("\n", OK, compose.toString(), env.toString(), encoded(contentOf(compose)), encoded(contentOf(env)));
        } catch (IOException | RuntimeException e) {
            return FAILED + e.getMessage();
        }
    }

    static String save(String container, String body) {
        try {
            Optional<ComposeProject> found = project(container);
            String[] parts = body.split("\n", -1);
            if (found.isEmpty() || parts.length != 2) {
                return INVALID;
            }
            ComposeProject project = found.get();
            String previousCompose = contentOf(project.mainFile());
            boolean envExisted = Files.isRegularFile(project.envFile());
            String previousEnv = contentOf(project.envFile());
            String env = decoded(parts[1]);
            writeAtomically(project.mainFile(), decoded(parts[0]));
            if (envExisted || !env.isEmpty()) {
                writeAtomically(project.envFile(), env);
            }
            String validation = compose(project, VALIDATE_TIMEOUT_SECONDS, "config", "--quiet");
            if (validation.startsWith(FAILED)) {
                writeAtomically(project.mainFile(), previousCompose);
                restoreEnv(project, envExisted, previousEnv);
                return validation;
            }
            return OK_LINE;
        } catch (IOException | RuntimeException e) {
            return FAILED + e.getMessage();
        }
    }

    static boolean update(String container, Consumer<String> output) {
        Optional<ComposeProject> found = project(container);
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
            if (!streamCompose(project, output, "pull", "--ignore-buildable")) {
                return false;
            }
            if (!isRunning(project)) {
                output.accept("Imagem baixada. O container está parado e continua parado.\n");
                return true;
            }
            return streamCompose(project, output, "up", "--detach", "--remove-orphans");
        } finally {
            UPDATING_PROJECTS.remove(key);
        }
    }

    static String create(String name, String serviceFolder, String body) {
        String[] parts = body.split("\n", -1);
        if (!PROJECT_NAME.matcher(name).matches() || serviceFolder.isEmpty() || parts.length != 2) {
            return INVALID;
        }
        Path folder = Path.of(serviceFolder, CONTAINERS_FOLDER, name);
        if (Files.exists(folder)) {
            return FAILED + "Já existe um container com esse nome.";
        }
        ComposeProject project = new ComposeProject(name, List.of(folder.resolve(COMPOSE_FILE)));
        try {
            Files.createDirectories(folder);
            writeAtomically(project.mainFile(), decoded(parts[0]));
            writeAtomically(project.envFile(), decoded(parts[1]));
            String validation = compose(project, VALIDATE_TIMEOUT_SECONDS, "config", "--quiet");
            if (validation.startsWith(FAILED)) {
                deleteFolder(folder);
                return validation;
            }
            String result = compose(project, UP_TIMEOUT_SECONDS, "up", "--detach");
            if (result.startsWith(FAILED)) {
                compose(project, VALIDATE_TIMEOUT_SECONDS, "down");
                deleteFolder(folder);
            }
            return result;
        } catch (IOException | RuntimeException e) {
            return FAILED + e.getMessage();
        }
    }

    private static Optional<ComposeProject> project(String container) {
        if (!DockerCommands.isContainerId(container)) {
            return Optional.empty();
        }
        String report = DockerCommands.run(
                List.of("docker", "inspect", "--format", INSPECT_FORMAT, container), VALIDATE_TIMEOUT_SECONDS);
        String[] lines = report.split("\n", -1);
        if (lines.length != 3 || !OK.equals(lines[0]) || lines[1].isEmpty() || lines[2].isEmpty()) {
            return Optional.empty();
        }
        List<Path> files = Stream.of(lines[2].split(LABEL_SEPARATOR)).map(Path::of).toList();
        return Files.isRegularFile(files.getFirst())
                ? Optional.of(new ComposeProject(lines[1], files))
                : Optional.empty();
    }

    private static String compose(ComposeProject project, long timeoutSeconds, String... arguments) {
        return DockerCommands.run(composeCommand(project, arguments), timeoutSeconds);
    }

    private static List<String> composeCommand(ComposeProject project, String... arguments) {
        List<String> command = new ArrayList<>(List.of("docker", "compose", "--project-name", project.name()));
        project.files().forEach(file -> command.addAll(List.of("--file", file.toString())));
        command.addAll(List.of(arguments));
        return command;
    }

    private static boolean isRunning(ComposeProject project) {
        String filter = "label=com.docker.compose.project=" + project.name();
        String report = DockerCommands.run(
                List.of("docker", "ps", "--quiet", "--filter", filter), VALIDATE_TIMEOUT_SECONDS);
        return report.startsWith(OK_LINE) && report.length() > OK_LINE.length();
    }

    private static boolean streamCompose(ComposeProject project, Consumer<String> output, String... arguments) {
        List<String> command = composeCommand(project, arguments);
        command.addAll(2, List.of("--progress", "plain"));
        try {
            Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
            process.getOutputStream().close();
            process.onExit()
                    .orTimeout(UP_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .exceptionally(timeout -> process.destroyForcibly());
            try (Reader reader = new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8)) {
                char[] buffer = new char[OUTPUT_BUFFER_CHARS];
                int read = reader.read(buffer);
                while (read >= 0) {
                    output.accept(new String(buffer, 0, read));
                    read = reader.read(buffer);
                }
            }
            return process.waitFor() == 0;
        } catch (IOException e) {
            output.accept(e.getMessage() + "\n");
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private static void restoreEnv(ComposeProject project, boolean existed, String content) throws IOException {
        if (existed) {
            writeAtomically(project.envFile(), content);
        } else {
            Files.deleteIfExists(project.envFile());
        }
    }

    private static void deleteFolder(Path folder) throws IOException {
        try (Stream<Path> entries = Files.walk(folder)) {
            for (Path entry : entries.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(entry);
            }
        }
    }

    private static String contentOf(Path file) throws IOException {
        if (!Files.isRegularFile(file)) {
            return "";
        }
        if (Files.size(file) > MAX_FILE_BYTES) {
            throw new IOException("arquivo excede o limite de 2 MiB");
        }
        return Files.readString(file);
    }

    private static String encoded(String text) {
        return Base64.getEncoder().encodeToString(text.getBytes(StandardCharsets.UTF_8));
    }

    private static String decoded(String text) {
        return new String(Base64.getDecoder().decode(text), StandardCharsets.UTF_8);
    }

    private static void writeAtomically(Path file, String content) throws IOException {
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_FILE_BYTES) {
            throw new IOException("arquivo excede o limite de 2 MiB");
        }
        Path temporary = Files.createTempFile(file.toAbsolutePath().getParent(), ".godard-stack-", ".tmp");
        try {
            Files.write(temporary, bytes);
            try {
                Files.move(temporary, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException ignored) {
                Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } finally {
            Files.deleteIfExists(temporary);
        }
    }
}
