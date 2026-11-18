package com.katomus.godard.docker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.ObjectMapper;

class DockerComposeServiceTest {

  private static final String CONTAINER_ID = "a".repeat(64);

  @Test
  void restoresBothFilesWhenComposeValidationFails(@TempDir Path directory) throws IOException {
    Path compose = directory.resolve("docker-compose.yml");
    Path env = directory.resolve(".env");
    Files.writeString(compose, "services:\n  app:\n    image: before\n");
    Files.writeString(env, "VERSION=before\n");
    FakeComposeClient client = new FakeComposeClient(compose);
    DockerComposeService service =
        new DockerComposeService(client, null, dockerService(), ignored -> {});

    DockerException exception =
        assertThrows(
            DockerException.class,
            () ->
                service.save(
                    CONTAINER_ID,
                    new DockerComposeFilesRequest(
                        "services:\n  app:\n    image: after\n", "VERSION=after\n")));

    assertEquals(HttpStatus.UNPROCESSABLE_CONTENT, exception.status());
    assertEquals("services:\n  app:\n    image: before\n", Files.readString(compose));
    assertEquals("VERSION=before\n", Files.readString(env));
  }

  private static DockerService dockerService() {
    return new DockerService(new NoopDockerClient(), new ObjectMapper(), ignored -> {}, "");
  }

  private static final class FakeComposeClient implements DockerComposeClient {

    private final Path compose;

    private FakeComposeClient(Path compose) {
      this.compose = compose;
    }

    @Override
    public DockerCommandResult inspectComposeProject(String containerId) {
      return new DockerCommandResult(0, false, false, "app\n" + compose);
    }

    @Override
    public DockerCommandResult validateCompose(String projectName, List<Path> files) {
      return DockerCommandResult.failed("configuração inválida");
    }

    @Override
    public DockerCommandResult startCompose(String projectName, List<Path> files) {
      throw new UnsupportedOperationException();
    }

    @Override
    public DockerCommandResult stopCompose(String projectName, List<Path> files) {
      throw new UnsupportedOperationException();
    }

    @Override
    public DockerCommandResult projectContainers(String projectName) {
      throw new UnsupportedOperationException();
    }

    @Override
    public Process pullCompose(String projectName, List<Path> files) throws IOException {
      throw new IOException("not used");
    }

    @Override
    public Process recreateCompose(String projectName, List<Path> files) throws IOException {
      throw new IOException("not used");
    }
  }

  private static final class NoopDockerClient implements DockerClient {

    @Override
    public DockerCommandResult containers() {
      throw new UnsupportedOperationException();
    }

    @Override
    public DockerCommandResult metrics(String containerId) {
      throw new UnsupportedOperationException();
    }

    @Override
    public DockerCommandResult action(DockerAction action, String containerId) {
      throw new UnsupportedOperationException();
    }

    @Override
    public Process followLogs(String containerId) throws IOException {
      throw new IOException("not used");
    }
  }
}
