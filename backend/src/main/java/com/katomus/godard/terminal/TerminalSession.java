package com.katomus.godard.terminal;

import com.pty4j.PtyProcess;
import com.pty4j.PtyProcessBuilder;
import com.pty4j.WinSize;
import com.pty4j.unix.UnixPtyProcess;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

final class TerminalSession {

  private static final int INITIAL_COLUMNS = 80;
  private static final int INITIAL_ROWS = 24;
  private static final int READ_BUFFER_CHARS = 8_192;
  private static final int MAX_COLUMNS = 1_000;
  private static final int MAX_ROWS = 1_000;
  private static final long CLOSE_GRACE_SECONDS = 2;
  private static final String REPORT_DIRECTORY = "printf '\\033]7;%s\\007' \"$PWD\"";

  private final PtyProcess process;
  private final Writer input;
  private final Consumer<String> onOutput;
  private final Runnable onEnded;
  private final AtomicBoolean started = new AtomicBoolean();
  private final AtomicBoolean closing = new AtomicBoolean();
  private final AtomicBoolean ended = new AtomicBoolean();

  TerminalSession(String shell, String directory, Consumer<String> onOutput, Runnable onEnded)
      throws IOException {
    this.onOutput = onOutput;
    this.onEnded = onEnded;
    this.process =
        new PtyProcessBuilder(new String[] {shell})
            .setEnvironment(shellEnvironment())
            .setDirectory(startDirectory(directory))
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

  boolean isAlive() {
    return process.isAlive();
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
      char[] buffer = new char[READ_BUFFER_CHARS];
      int count;
      while ((count = output.read(buffer)) != -1) {
        onOutput.accept(new String(buffer, 0, count));
      }
    } catch (IOException exception) {
      finishSession();
      return;
    }
    finishSession();
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

  private static String startDirectory(String directory) {
    if (directory != null && !directory.isBlank() && new File(directory).isDirectory()) {
      return directory;
    }
    return System.getProperty("user.home");
  }

  private static Map<String, String> shellEnvironment() {
    Map<String, String> environment = new HashMap<>(System.getenv());
    environment.put("TERM", "xterm-256color");
    String promptCommand = environment.get("PROMPT_COMMAND");
    environment.put(
        "PROMPT_COMMAND",
        promptCommand == null || promptCommand.isBlank()
            ? REPORT_DIRECTORY
            : REPORT_DIRECTORY + ";" + promptCommand);
    return environment;
  }
}
