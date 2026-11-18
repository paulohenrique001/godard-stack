package com.godardstack.agent;

import java.io.IOException;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

record AgentConfig(String token, String bind, int port, int maxSessions, boolean allowNetwork) {

    private static final String DEFAULT_PORT = "9374";
    private static final String DEFAULT_MAX_SESSIONS = "16";

    static AgentConfig load(Path file) throws IOException {
        Map<String, String> values = new HashMap<>();
        for (String line : Files.readAllLines(file)) {
            int separator = line.indexOf('=');
            if (separator > 0) {
                values.put(line.substring(0, separator).trim(), line.substring(separator + 1).trim());
            }
        }
        int port = Integer.parseInt(values.getOrDefault("AGENT_PORT", DEFAULT_PORT));
        int maxSessions = Integer.parseInt(values.getOrDefault("AGENT_MAX_SESSIONS", DEFAULT_MAX_SESSIONS));
        if (port < 1 || port > 65535 || maxSessions < 1 || maxSessions > 64) {
            throw new IllegalArgumentException("Configuração de porta ou sessões inválida");
        }
        return new AgentConfig(values.getOrDefault("AGENT_TOKEN", ""),
                values.getOrDefault("AGENT_BIND", "127.0.0.1"),
                port, maxSessions, Boolean.parseBoolean(values.getOrDefault("AGENT_ALLOW_NETWORK", "false")));
    }

    void validateBind() throws IOException {
        InetAddress address = InetAddress.getByName(bind);
        if (allowNetwork) {
            return;
        }
        if (address.isAnyLocalAddress()) {
            throw new IllegalArgumentException("AGENT_BIND não pode escutar em todas as interfaces");
        }
        if (address.isLoopbackAddress()) {
            return;
        }
        NetworkInterface network = NetworkInterface.getByInetAddress(address);
        String name = network == null ? "" : network.getName();
        boolean localBridge = network != null && (network.isVirtual() || name.equals("docker0")
                || name.startsWith("br-") || name.startsWith("podman"));
        if (!localBridge) {
            throw new IllegalArgumentException("AGENT_BIND deve ser loopback ou uma bridge local do Docker");
        }
    }
}
