package com.katomus.godard.docker;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
class DockerServiceFolderService {

  private static final String FOLDER_NAME = ".godard-stack";
  private static final String CONTAINERS_FOLDER = "containers";
  private static final int MAX_PATH_LENGTH = 1_024;
  private static final int MAX_LISTED_FOLDERS = 500;

  private final DockerServiceFolderRepository repository;
  private final Path homeDirectory;

  @Autowired
  DockerServiceFolderService(DockerServiceFolderRepository repository) {
    this(repository, Path.of(System.getProperty("user.home", ".")));
  }

  DockerServiceFolderService(DockerServiceFolderRepository repository, Path homeDirectory) {
    this.repository = repository;
    this.homeDirectory = homeDirectory.toAbsolutePath().normalize();
  }

  DockerServiceFolder current() {
    return new DockerServiceFolder(repository.find().orElse(null));
  }

  DockerFolderListing folders(String requestedPath) {
    Path folder =
        requestedPath == null || requestedPath.isBlank() ? homeDirectory : absolute(requestedPath);
    if (!Files.isDirectory(folder)) {
      throw new DockerException(
          HttpStatus.UNPROCESSABLE_CONTENT, "A pasta selecionada não está disponível.");
    }
    try (var entries = Files.list(folder)) {
      List<String> folders =
          entries
              .filter(DockerServiceFolderService::listedDirectory)
              .limit(MAX_LISTED_FOLDERS)
              .map(path -> path.toAbsolutePath().normalize().toString())
              .sorted(Comparator.comparing(String::toLowerCase))
              .toList();
      Path parent = folder.getParent();
      return new DockerFolderListing(
          folder.toString(),
          parent == null ? "" : parent.toString(),
          folder.resolve(FOLDER_NAME).toString(),
          folders);
    } catch (IOException exception) {
      throw new DockerException(
          HttpStatus.UNPROCESSABLE_CONTENT, "Não foi possível abrir a pasta selecionada.");
    }
  }

  void configure(String parentPath) {
    Path parent = absolute(parentPath);
    if (!Files.isDirectory(parent)) {
      throw new DockerException(
          HttpStatus.UNPROCESSABLE_CONTENT, "A pasta selecionada não está disponível.");
    }
    Path folder = parent.resolve(FOLDER_NAME).normalize();
    if (!folder.getParent().equals(parent)) {
      throw new DockerException(HttpStatus.BAD_REQUEST, "Pasta de serviço inválida.");
    }
    try {
      Files.createDirectories(folder.resolve(CONTAINERS_FOLDER));
      if (!Files.isWritable(folder)) {
        throw new IOException("sem permissão de escrita");
      }
      repository.save(folder.toString());
    } catch (IOException exception) {
      throw new DockerException(
          HttpStatus.UNPROCESSABLE_CONTENT, "Não foi possível preparar a pasta de serviço.");
    }
  }

  Path requirePath() {
    String saved =
        repository
            .find()
            .orElseThrow(
                () ->
                    new DockerException(
                        HttpStatus.UNPROCESSABLE_CONTENT,
                        "Escolha uma pasta de serviço antes de criar um container."));
    Path folder = absolute(saved);
    if (!Files.isDirectory(folder) || !Files.isWritable(folder)) {
      throw new DockerException(
          HttpStatus.UNPROCESSABLE_CONTENT, "A pasta de serviço não está disponível para escrita.");
    }
    return folder;
  }

  private static Path absolute(String path) {
    if (path == null
        || path.isBlank()
        || path.length() > MAX_PATH_LENGTH
        || path.codePoints().anyMatch(Character::isISOControl)) {
      throw new DockerException(HttpStatus.BAD_REQUEST, "Caminho de pasta inválido.");
    }
    Path value;
    try {
      value = Path.of(path).toAbsolutePath().normalize();
    } catch (RuntimeException exception) {
      throw new DockerException(HttpStatus.BAD_REQUEST, "Caminho de pasta inválido.");
    }
    if (!value.isAbsolute()) {
      throw new DockerException(HttpStatus.BAD_REQUEST, "Caminho de pasta inválido.");
    }
    return value;
  }

  private static boolean listedDirectory(Path entry) {
    Path name = entry.getFileName();
    return name != null
        && !name.toString().startsWith(".")
        && name.toString().codePoints().noneMatch(Character::isISOControl)
        && Files.isDirectory(entry);
  }
}
