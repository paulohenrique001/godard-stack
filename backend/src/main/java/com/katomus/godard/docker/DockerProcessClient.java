package com.katomus.godard.docker;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.stereotype.Component;

@Component
class DockerProcessClient implements DockerClient, DockerComposeClient {

  private static final Duration LIST_TIMEOUT = Duration.ofSeconds(5);
  private static final Duration METRICS_TIMEOUT = Duration.ofSeconds(5);
  private static final Duration ACTION_TIMEOUT = Duration.ofSeconds(60);
  private static final Duration COMPOSE_TIMEOUT = Duration.ofSeconds(300);
  private static final int MAX_OUTPUT_BYTES = 1024 * 1024;
  private static final int LOG_TAIL_LINES = 500;
  private static final String COMPOSE_INSPECT_FORMAT =
      "{{index .Config.Labels \"com.docker.compose.project\"}}\n"
          + "{{index .Config.Labels \"com.docker.compose.project.config_files\"}}";

  @Override
  public DockerCommandResult containers() {
    return execute(
        List.of("docker", "ps", "--all", "--no-trunc", "--format", "{{json .}}"), LIST_TIMEOUT);
  }

  @Override
  public DockerCommandResult metrics(String containerId) {
    return execute(
        List.of(
            "docker",
            "stats",
            "--no-stream",
            "--no-trunc",
            "--format",
            "{{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}",
            containerId),
        METRICS_TIMEOUT);
  }

  @Override
  public DockerCommandResult action(DockerAction action, String containerId) {
    List<String> command =
        action == DockerAction.REMOVE
            ? List.of("docker", "rm", "--force", containerId)
            : List.of("docker", action.command(), containerId);
    return execute(command, ACTION_TIMEOUT);
  }

  @Override
  public Process followLogs(String containerId) throws IOException {
    Process process =
        new ProcessBuilder(
                "docker", "logs", "--follow", "--tail", String.valueOf(LOG_TAIL_LINES), containerId)
            .redirectErrorStream(true)
            .start();
    process.getOutputStream().close();
    return process;
  }

  @Override
  public DockerCommandResult inspectComposeProject(String containerId) {
    return execute(
        List.of("docker", "inspect", "--format", COMPOSE_INSPECT_FORMAT, containerId),
        LIST_TIMEOUT);
  }

  @Override
  public DockerCommandResult validateCompose(String projectName, List<Path> files) {
    return execute(composeCommand(projectName, files, false, "config", "--quiet"), COMPOSE_TIMEOUT);
  }

  @Override
  public DockerCommandResult startCompose(String projectName, List<Path> files) {
    return execute(composeCommand(projectName, files, false, "up", "--detach"), COMPOSE_TIMEOUT);
  }

  @Override
  public DockerCommandResult stopCompose(String projectName, List<Path> files) {
    return execute(composeCommand(projectName, files, false, "down"), COMPOSE_TIMEOUT);
  }

  @Override
  public DockerCommandResult projectContainers(String projectName) {
    return execute(
        List.of(
            "docker",
            "ps",
            "--quiet",
            "--filter",
            "label=com.docker.compose.project=" + projectName),
        LIST_TIMEOUT);
  }

  @Override
  public Process pullCompose(String projectName, List<Path> files) throws IOException {
    return start(composeCommand(projectName, files, true, "pull", "--ignore-buildable"));
  }

  @Override
  public Process recreateCompose(String projectName, List<Path> files) throws IOException {
    return start(composeCommand(projectName, files, true, "up", "--detach", "--remove-orphans"));
  }

  private DockerCommandResult execute(List<String> command, Duration timeout) {
    try {
      Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
      process.getOutputStream().close();
      try (ExecutorService reader = Executors.newVirtualThreadPerTaskExecutor()) {
        Future<ReadResult> output = reader.submit(() -> read(process));
        boolean completed = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
        if (!completed) {
          process.destroyForcibly();
          process.waitFor(2, TimeUnit.SECONDS);
        }
        ReadResult result = output.get(5, TimeUnit.SECONDS);
        int exitCode = process.isAlive() ? -1 : process.exitValue();
        return new DockerCommandResult(
            exitCode, !completed, result.limitReached(), result.output());
      }
    } catch (IOException exception) {
      return DockerCommandResult.failed(
          "Não foi possível iniciar o Docker: " + exception.getMessage());
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      return DockerCommandResult.failed("A operação do Docker foi interrompida.");
    } catch (ExecutionException | TimeoutException exception) {
      return DockerCommandResult.failed("Não foi possível ler a resposta do Docker.");
    }
  }

  private static Process start(List<String> command) throws IOException {
    Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
    process.getOutputStream().close();
    return process;
  }

  private static List<String> composeCommand(
      String projectName, List<Path> files, boolean showProgress, String... arguments) {
    List<String> command = new ArrayList<>(List.of("docker", "compose"));
    if (showProgress) {
      command.addAll(List.of("--progress", "plain"));
    }
    command.addAll(List.of("--project-name", projectName));
    files.forEach(file -> command.addAll(List.of("--file", file.toString())));
    command.addAll(List.of(arguments));
    return List.copyOf(command);
  }

  private static ReadResult read(Process process) throws IOException {
    try (InputStream input = process.getInputStream();
        ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192];
      int read = input.read(buffer);
      while (read >= 0) {
        if (output.size() + read > MAX_OUTPUT_BYTES) {
          process.destroyForcibly();
          return new ReadResult(output.toString(StandardCharsets.UTF_8), true);
        }
        output.write(buffer, 0, read);
        read = input.read(buffer);
      }
      return new ReadResult(output.toString(StandardCharsets.UTF_8), false);
    }
  }

  private record ReadResult(String output, boolean limitReached) {}
}
