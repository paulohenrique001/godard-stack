package com.godardstack.agent;

import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import com.sun.management.OperatingSystemMXBean;

final class MachineInfo {

    private static final Path MEMINFO = Path.of("/proc/meminfo");
    private static final String AVAILABLE_PREFIX = "MemAvailable:";
    private static final long BYTES_PER_KIB = 1024;
    private static final double BYTES_PER_GIB = 1024.0 * 1024 * 1024;
    private static final Locale BRAZIL = Locale.of("pt", "BR");

    private MachineInfo() {
    }

    static String report() {
        return collect().entrySet().stream()
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .collect(Collectors.joining("\n"));
    }

    static String summary(Path serviceFolder, String generatedAt) {
        Map<String, Object> info = collect();
        return String.join(System.lineSeparator(),
                "Godard Stack",
                "Gerado em: " + generatedAt,
                "",
                "Máquina: " + info.get("hostname"),
                "Usuário: " + info.get("user"),
                "Pasta pessoal: " + info.get("home"),
                "Pasta de serviço: " + serviceFolder,
                "Sistema: " + info.get("os"),
                "Arquitetura: " + System.getProperty("os.arch"),
                "Shell: " + info.get("shell"),
                "Java do agente: " + System.getProperty("java.version"),
                "Processadores: " + info.get("cpus"),
                "Memória total: " + gibibytes(info.get("memoryTotal")),
                "Disco total: " + gibibytes(info.get("diskTotal")),
                "Disco livre: " + gibibytes(info.get("diskAvailable")),
                "");
    }

    private static String gibibytes(Object bytes) {
        return bytes instanceof Long value
                ? String.format(BRAZIL, "%.1f GB", value / BYTES_PER_GIB)
                : "desconhecido";
    }

    private static Map<String, Object> collect() {
        OperatingSystemMXBean system = ManagementFactory.getPlatformMXBean(OperatingSystemMXBean.class);
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("hostname", hostname());
        info.put("user", System.getProperty("user.name"));
        info.put("home", System.getProperty("user.home"));
        info.put("os", System.getProperty("os.name") + " " + System.getProperty("os.version"));
        info.put("shell", TerminalSession.shellCommand()[0]);
        info.put("cpus", Runtime.getRuntime().availableProcessors());
        info.put("memoryTotal", system.getTotalMemorySize());
        info.put("memoryAvailable", availableMemory(system));
        addDisk(info);
        return info;
    }

    private static String hostname() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (UnknownHostException e) {
            return "desconhecido";
        }
    }

    private static long availableMemory(OperatingSystemMXBean system) {
        try {
            List<String> lines = Files.readAllLines(MEMINFO);
            return lines.stream()
                    .filter(line -> line.startsWith(AVAILABLE_PREFIX))
                    .map(line -> line.replaceAll("\\D", ""))
                    .map(Long::parseLong)
                    .map(kib -> kib * BYTES_PER_KIB)
                    .findFirst()
                    .orElse(system.getFreeMemorySize());
        } catch (IOException e) {
            return system.getFreeMemorySize();
        }
    }

    private static void addDisk(Map<String, Object> info) {
        try {
            FileStore store = Files.getFileStore(Path.of(System.getProperty("user.home")));
            info.put("diskTotal", store.getTotalSpace());
            info.put("diskAvailable", store.getUsableSpace());
        } catch (IOException e) {
            System.err.println("Falha ao consultar o disco: " + e);
        }
    }
}
