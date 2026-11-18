package com.godardstack.agent;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

final class DockerCommands {

    private static final Pattern CONTAINER_ID = Pattern.compile("[a-f0-9]{12,64}");
    private static final Set<String> ACTIONS = Set.of("start", "stop", "restart", "remove");
    private static final String REMOVE = "remove";
    private static final String SHELL_SCRIPT =
            "if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi";
    private static final String OK = "ok\n";
    private static final String FAILED = "failed\n";
    private static final String SHELL_MARKER_VARIABLE = "GODARD_STACK_SHELL";
    private static final String END_SHELL_SCRIPT = "for process in /proc/[0-9]*; do "
            + "if tr '\\0' '\\n' < \"$process/environ\" 2>/dev/null | grep -qx \"" + SHELL_MARKER_VARIABLE + "=$1\"; then "
            + "kill -KILL \"${process##*/}\"; fi; done";
    private static final long LIST_TIMEOUT_SECONDS = 5;
    private static final long END_SHELL_RETRY_MS = 2000;
    private static final long ACTION_TIMEOUT_SECONDS = 60;
    private static final String LOG_TAIL_LINES = "500";
    private static final int MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
    private static final String OUTPUT_LIMIT_REACHED = "saída excedeu o limite permitido";

    private DockerCommands() {
    }

    static String containers() {
        return run(List.of("docker", "ps", "--all", "--no-trunc", "--format", "{{json .}}"), LIST_TIMEOUT_SECONDS);
    }

    static String action(String action, String container) {
        if (!ACTIONS.contains(action) || !isContainerId(container)) {
            return FAILED + "pedido inválido";
        }
        List<String> command = REMOVE.equals(action)
                ? List.of("docker", "rm", "--force", container)
                : List.of("docker", action, container);
        return run(command, ACTION_TIMEOUT_SECONDS);
    }

    static String stats(String container) {
        if (!isContainerId(container)) {
            return FAILED + "pedido inválido";
        }
        return run(List.of("docker", "stats", "--no-stream", "--no-trunc",
                "--format", "{{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}", container), LIST_TIMEOUT_SECONDS);
    }

    static boolean isContainerId(String container) {
        return CONTAINER_ID.matcher(container).matches();
    }

    static String[] shellCommand(String container, String marker) {
        return new String[] {
            "docker", "exec", "--interactive", "--tty", "--env", "TERM=xterm-256color",
            "--env", SHELL_MARKER_VARIABLE + "=" + marker, container,
            "sh", "-c", SHELL_SCRIPT
        };
    }

    static void endShell(String container, String marker) {
        List<String> command = List.of("docker", "exec", container, "sh", "-c", END_SHELL_SCRIPT, "sh", marker);
        run(command, LIST_TIMEOUT_SECONDS);
        try {
            Thread.sleep(END_SHELL_RETRY_MS);
            run(command, LIST_TIMEOUT_SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    static Process followLogs(String container) throws IOException {
        return new ProcessBuilder("docker", "logs", "--follow", "--tail", LOG_TAIL_LINES, container)
                .redirectErrorStream(true)
                .start();
    }

    static String run(List<String> command, long timeoutSeconds) {
        try {
            Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
            process.getOutputStream().close();
            process.onExit()
                    .orTimeout(timeoutSeconds, TimeUnit.SECONDS)
                    .exceptionally(timeout -> process.destroyForcibly());
            String output = readLimited(process.getInputStream(), process);
            if (output == null) {
                return FAILED + OUTPUT_LIMIT_REACHED;
            }
            return (process.waitFor() == 0 ? OK : FAILED) + output;
        } catch (IOException e) {
            return FAILED + e.getMessage();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return FAILED + "interrompido";
        }
    }

    private static String readLimited(InputStream input, Process process) throws IOException {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read = input.read(buffer);
            while (read >= 0) {
                if (output.size() + read > MAX_COMMAND_OUTPUT_BYTES) {
                    process.destroyForcibly();
                    return null;
                }
                output.write(buffer, 0, read);
                read = input.read(buffer);
            }
            return output.toString(StandardCharsets.UTF_8).strip();
        }
    }
}
