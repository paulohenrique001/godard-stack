package com.godardstack.agent;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

final class ServiceFolder {

    private static final String FOLDER_NAME = ".godard-stack";
    private static final String SYSTEM_FILE = "system.txt";
    private static final String LOG_FILE = "service.log";
    private static final String OK = "ok";
    private static final String FAILED = "failed";
    private static final String MISSING = "missing";
    private static final String INCOMPLETE = "incomplete";
    private static final String DENIED = "denied";
    private static final int MAX_LISTED_FOLDERS = 500;
    private static final long MAX_LOG_BYTES = 1024L * 1024;
    private static final int LOG_BACKUPS = 3;
    private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private ServiceFolder() {
    }

    static String browse(String requested) {
        try {
            Path folder = requested.isEmpty() ? Path.of(System.getProperty("user.home")) : absolute(requested);
            List<String> lines = new ArrayList<>(List.of(
                    OK,
                    folder.toString(),
                    folder.getParent() == null ? "" : folder.getParent().toString(),
                    folder.resolve(FOLDER_NAME).toString()));
            try (Stream<Path> entries = Files.list(folder)) {
                entries.filter(ServiceFolder::isListed)
                        .limit(MAX_LISTED_FOLDERS)
                        .map(Path::toString)
                        .sorted(String.CASE_INSENSITIVE_ORDER)
                        .forEach(lines::add);
            }
            return String.join("\n", lines);
        } catch (IOException | RuntimeException e) {
            System.err.println("Falha ao listar a pasta: " + e);
            return FAILED;
        }
    }

    static String create(String path) {
        try {
            Path folder = absolute(path);
            Files.createDirectories(folder);
            writeSystemFile(folder);
            appendLog(folder, "Pasta de serviço pronta");
            return OK;
        } catch (IOException | RuntimeException e) {
            System.err.println("Falha ao criar a pasta de serviço: " + e);
            return FAILED;
        }
    }

    static String check(String path) {
        try {
            Path folder = absolute(path);
            if (!Files.isDirectory(folder)) {
                return MISSING;
            }
            if (!Files.isRegularFile(folder.resolve(SYSTEM_FILE)) || !Files.isRegularFile(folder.resolve(LOG_FILE))) {
                return INCOMPLETE;
            }
            writeSystemFile(folder);
            appendLog(folder, "Verificação concluída");
            return OK;
        } catch (IOException | RuntimeException e) {
            System.err.println("Falha ao verificar a pasta de serviço: " + e);
            return DENIED;
        }
    }

    static void log(String path, String message) {
        if (path.isEmpty()) {
            return;
        }
        try {
            appendLog(absolute(path), message);
        } catch (IOException | RuntimeException e) {
            System.err.println("Falha ao gravar o log: " + e);
        }
    }

    private static Path absolute(String path) {
        Path folder = Path.of(path).normalize();
        if (!folder.isAbsolute()) {
            throw new IllegalArgumentException("caminho relativo");
        }
        return folder;
    }

    private static boolean isListed(Path entry) {
        String name = entry.getFileName().toString();
        return !name.startsWith(".")
                && name.codePoints().noneMatch(Character::isISOControl)
                && Files.isDirectory(entry);
    }

    private static void writeSystemFile(Path folder) throws IOException {
        Files.writeString(folder.resolve(SYSTEM_FILE), MachineInfo.summary(folder, now()), StandardCharsets.UTF_8);
    }

    private static synchronized void appendLog(Path folder, String message) throws IOException {
        Path log = folder.resolve(LOG_FILE);
        rotateLog(log);
        Files.writeString(log, now() + " " + message + System.lineSeparator(),
                StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
    }

    private static void rotateLog(Path log) throws IOException {
        if (!Files.isRegularFile(log) || Files.size(log) < MAX_LOG_BYTES) {
            return;
        }
        for (int index = LOG_BACKUPS; index >= 1; index--) {
            Path source = index == 1 ? log : log.resolveSibling(LOG_FILE + "." + (index - 1));
            Path target = log.resolveSibling(LOG_FILE + "." + index);
            if (Files.exists(source)) {
                Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
            }
        }
    }

    private static String now() {
        return LocalDateTime.now().format(TIMESTAMP);
    }
}
