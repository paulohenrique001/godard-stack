package com.godardstack.agent;

import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import com.pty4j.PtyProcess;
import com.pty4j.PtyProcessBuilder;
import com.pty4j.WinSize;
import com.pty4j.unix.UnixPtyProcess;
import org.java_websocket.WebSocket;
import org.java_websocket.exceptions.WebsocketNotConnectedException;
import org.java_websocket.framing.CloseFrame;

final class TerminalSession {

    private static final int INITIAL_COLUMNS = 80;
    private static final int INITIAL_ROWS = 24;
    private static final int READ_BUFFER_CHARS = 8192;
    private static final int MAX_DETACHED_CHARS = 256 * 1024;
    private static final int MAX_COLUMNS = 1000;
    private static final int MAX_ROWS = 1000;
    private static final long CLOSE_GRACE_SECONDS = 2;
    private static final String REPORT_DIRECTORY = "printf '\\033]7;%s\\007' \"$PWD\"";
    private static final Set<String> PRIVILEGED_USERS = Set.of("root", "SYSTEM");

    private final PtyProcess process;
    private final Writer input;
    private final Runnable onEnded;
    private final StringBuilder detachedOutput = new StringBuilder();
    private final AtomicBoolean closing = new AtomicBoolean();
    private WebSocket connection;
    private long attachmentVersion;

    static String healthReport() {
        Path shell = Path.of(shellCommand()[0]);
        boolean shellAvailable = !shell.isAbsolute() || Files.isExecutable(shell);
        boolean privileged = PRIVILEGED_USERS.contains(System.getProperty("user.name"));
        return "shell=" + shellAvailable + ";privileged=" + privileged;
    }

    TerminalSession(String directory, Runnable onEnded) throws IOException {
        this(shellCommand(), directory, onEnded);
    }

    TerminalSession(String[] command, String directory, Runnable onEnded) throws IOException {
        this.onEnded = onEnded;
        this.process = new PtyProcessBuilder(command)
                .setEnvironment(shellEnvironment())
                .setDirectory(startDirectory(directory))
                .setInitialColumns(INITIAL_COLUMNS)
                .setInitialRows(INITIAL_ROWS)
                .setUseWinConPty(true)
                .start();
        this.input = new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8);
        Thread.ofPlatform().daemon().start(this::pumpOutput);
    }

    synchronized void attach(WebSocket next, String control) {
        attachmentVersion++;
        WebSocket previous = connection;
        connection = next;
        next.send(control);
        if (!detachedOutput.isEmpty()) {
            next.send(detachedOutput.toString());
            detachedOutput.setLength(0);
        }
        if (previous != null && previous.isOpen()) {
            previous.close(CloseFrame.NORMAL);
        }
    }

    synchronized boolean detach(WebSocket closed) {
        if (connection == closed) {
            connection = null;
        }
        return connection == null;
    }

    void expireAfter(ScheduledExecutorService executor, long delaySeconds) {
        long version;
        synchronized (this) {
            version = attachmentVersion;
        }
        executor.schedule(() -> closeIfStillDetached(version), delaySeconds, TimeUnit.SECONDS);
    }

    void write(String data) throws IOException {
        input.write(data);
        input.flush();
    }

    void resize(String size) {
        String[] dimensions = size.split(",");
        if (dimensions.length != 2) {
            throw new IllegalArgumentException("tamanho de terminal inválido");
        }
        int columns = Integer.parseInt(dimensions[0]);
        int rows = Integer.parseInt(dimensions[1]);
        if (columns < 1 || columns > MAX_COLUMNS || rows < 1 || rows > MAX_ROWS) {
            throw new IllegalArgumentException("tamanho de terminal fora do limite");
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
                deliver(new String(buffer, 0, count));
            }
        } catch (IOException e) {
            System.err.println("Saída do shell encerrada: " + e.getMessage());
        } catch (InterruptedException e) {
            close();
        }
        finishSession();
    }

    private void deliver(String text) throws InterruptedException {
        WebSocket target;
        synchronized (this) {
            target = connection;
            if (target == null || !target.isOpen()) {
                keepWhileDetached(text);
                return;
            }
            try {
                target.send(text);
            } catch (WebsocketNotConnectedException e) {
                keepWhileDetached(text);
                return;
            }
        }
        while (target.isOpen() && target.hasBufferedData()) {
            Thread.sleep(1);
        }
    }

    private void keepWhileDetached(String text) {
        detachedOutput.append(text);
        int excess = detachedOutput.length() - MAX_DETACHED_CHARS;
        if (excess > 0) {
            detachedOutput.delete(0, excess);
        }
    }

    private void finishSession() {
        try {
            process.waitFor();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        onEnded.run();
        synchronized (this) {
            if (connection != null && connection.isOpen()) {
                connection.close(CloseFrame.NORMAL);
            }
        }
    }

    private void closeIfStillDetached(long version) {
        synchronized (this) {
            if (connection != null || attachmentVersion != version) {
                return;
            }
        }
        close();
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
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static String startDirectory(String directory) {
        if (directory != null && !directory.isBlank() && new File(directory).isDirectory()) {
            return directory;
        }
        return System.getProperty("user.home");
    }

    static String[] shellCommand() {
        if (System.getProperty("os.name").startsWith("Windows")) {
            return new String[] {"powershell.exe"};
        }
        return new String[] {System.getenv().getOrDefault("SHELL", "/bin/bash")};
    }

    private static Map<String, String> shellEnvironment() {
        Map<String, String> environment = new HashMap<>(System.getenv());
        environment.put("TERM", "xterm-256color");
        String promptCommand = environment.get("PROMPT_COMMAND");
        environment.put("PROMPT_COMMAND",
                promptCommand == null || promptCommand.isBlank()
                        ? REPORT_DIRECTORY
                        : REPORT_DIRECTORY + ";" + promptCommand);
        return environment;
    }
}
