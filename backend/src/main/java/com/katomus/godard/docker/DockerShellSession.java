package com.katomus.godard.docker;

import com.pty4j.PtyProcess;
import com.pty4j.PtyProcessBuilder;
import com.pty4j.WinSize;
import com.pty4j.unix.UnixPtyProcess;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

final class DockerShellSession {

  private static final int INITIAL_COLUMNS = 80;
  private static final int INITIAL_ROWS = 24;
  private static final int MAX_COLUMNS = 1_000;
  private static final int MAX_ROWS = 1_000;
  private static final long CLOSE_GRACE_SECONDS = 2;
  private static final String SHELL_SCRIPT =
      "if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi";
  private static final String MARKER_VARIABLE = "GODARD_STACK_SHELL";
  private static final String END_SHELL_SCRIPT =
      "for process in /proc/[0-9]*; do "
          + "if tr '\\0' '\\n' < \"$process/environ\" 2>/dev/null | grep -qx \""
          + MARKER_VARIABLE
          + "=$1\"; then kill -KILL \"${process##*/}\"; fi; done";

  private final String containerId;
  private final String marker = UUID.randomUUID().toString();
  private final PtyProcess process;
  private final Writer input;
  private final Consumer<String> onOutput;
  private final Runnable onEnded;
  private final AtomicBoolean started = new AtomicBoolean();
  private final AtomicBoolean closing = new AtomicBoolean();
  private final AtomicBoolean ended = new AtomicBoolean();

  DockerShellSession(String containerId, Consumer<String> onOutput, Runnable onEnded)
      throws IOException {
    this.containerId = containerId;
    this.onOutput = onOutput;
    this.onEnded = onEnded;
    this.process =
        new PtyProcessBuilder(command(containerId, marker))
            .setEnvironment(environment())
            .setInitialColumns(INITIAL_COLUMNS)
            .setInitialRows(INITIAL_ROWS)
            .setUseWinConPty(true)
            .start();
    this.input = new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8);
  }

  void start() {
    if (started.compareAndSet(false, true)) {
      Thread.ofPlatform().daemon().start(this::pumpOutput);
    }
  }

  void write(String data) throws IOException {
    input.write(data);
    input.flush();
  }

  void resize(String size) {
    String[] dimensions = size.split(",");
    if (dimensions.length != 2) {
      throw new IllegalArgumentException("Tamanho de terminal inválido.");
    }
    int columns = Integer.parseInt(dimensions[0]);
    int rows = Integer.parseInt(dimensions[1]);
    if (columns < 1 || columns > MAX_COLUMNS || rows < 1 || rows > MAX_ROWS) {
      throw new IllegalArgumentException("Tamanho de terminal fora do limite.");
    }
    process.setWinSize(new WinSize(columns, rows));
  }

  void close() {
    if (!process.isAlive() || !closing.compareAndSet(false, true)) {
      return;
    }
    List<ProcessHandle> descendants = process.toHandle().descendants().toList();
    if (process instanceof UnixPtyProcess unixProcess) {
      unixProcess.hangup();
    } else {
      process.destroy();
    }
    Thread.ofVirtual().start(() -> finishProcess(descendants));
  }

  private void pumpOutput() {
    try (Reader output = new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8)) {
      char[] buffer = new char[8_192];
      int count;
      while ((count = output.read(buffer)) != -1) {
        onOutput.accept(new String(buffer, 0, count));
      }
    } catch (IOException ignored) {
    } finally {
      finishSession();
    }
  }

  private void finishSession() {
    if (!ended.compareAndSet(false, true)) {
      return;
    }
    try {
      process.waitFor();
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
    }
    endShell();
    onEnded.run();
  }

  private void finishProcess(List<ProcessHandle> descendants) {
    try {
      if (process.waitFor(CLOSE_GRACE_SECONDS, TimeUnit.SECONDS)) {
        return;
      }
      descendants.forEach(ProcessHandle::destroy);
      process.destroy();
      if (process.waitFor(CLOSE_GRACE_SECONDS, TimeUnit.SECONDS)) {
        return;
      }
      descendants.forEach(ProcessHandle::destroyForcibly);
      process.destroyForcibly();
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
    }
  }

  private void endShell() {
    try {
      Process cleanup =
          new ProcessBuilder(
                  "docker", "exec", containerId, "sh", "-c", END_SHELL_SCRIPT, "sh", marker)
              .redirectErrorStream(true)
              .start();
      cleanup.getOutputStream().close();
      cleanup.waitFor(5, TimeUnit.SECONDS);
      cleanup.destroyForcibly();
    } catch (IOException | InterruptedException exception) {
      if (exception instanceof InterruptedException) {
        Thread.currentThread().interrupt();
      }
    }
  }

  private static String[] command(String containerId, String marker) {
    return new String[] {
      "docker",
      "exec",
      "--interactive",
      "--tty",
      "--env",
      "TERM=xterm-256color",
      "--env",
      MARKER_VARIABLE + "=" + marker,
      containerId,
      "sh",
      "-c",
      SHELL_SCRIPT
    };
  }

  private static Map<String, String> environment() {
    Map<String, String> environment = new HashMap<>(System.getenv());
    environment.put("TERM", "xterm-256color");
    return environment;
  }
}
