package com.godardstack;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.net.http.WebSocketHandshakeException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class AgentHealthClient {

    private static final Duration TIMEOUT = Duration.ofSeconds(2);
    private static final Duration DOCKER_LIST_TIMEOUT = Duration.ofSeconds(8);
    private static final Duration DOCKER_ACTION_TIMEOUT = Duration.ofSeconds(65);
    private static final Duration DOCKER_APPLY_TIMEOUT = Duration.ofSeconds(330);
    private static final Duration SGBD_EXECUTE_TIMEOUT = Duration.ofSeconds(65);
    private static final int MAX_REPORT_CHARS = 4 * 1024 * 1024;

    enum Connection {
        ONLINE, OFFLINE, UNAUTHORIZED
    }

    record AgentHealth(Connection connection, boolean shellAvailable, boolean privileged) {
    }

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final URI agentUrl;
    private final String agentToken;

    public AgentHealthClient(@Value("${agent.url}") String agentUrl,
                             @Value("${agent.token}") String agentToken) {
        this.agentUrl = URI.create(agentUrl);
        this.agentToken = agentToken;
    }

    Set<Long> activeSessions() {
        try {
            String tabs = fetchReport("/sessions", Map.of());
            return Arrays.stream(tabs.split(","))
                    .filter(tab -> !tab.isBlank())
                    .map(Long::valueOf)
                    .collect(Collectors.toSet());
        } catch (CompletionException | NumberFormatException e) {
            return Set.of();
        }
    }

    void closeSession(long tabId) {
        try {
            fetchReport("/close", Map.of("X-Terminal-Tab", String.valueOf(tabId)));
        } catch (CompletionException e) {
            System.err.println("Sessão da aba " + tabId + " não encerrada: " + e.getMessage());
        }
    }

    Optional<String> machineInfo() {
        try {
            return Optional.of(fetchReport("/info", Map.of()));
        } catch (CompletionException e) {
            return Optional.empty();
        }
    }

    Optional<String> dockerContainers() {
        try {
            return Optional.of(fetchReport("/docker/containers", Map.of(), DOCKER_LIST_TIMEOUT));
        } catch (CompletionException e) {
            return Optional.empty();
        }
    }

    Optional<String> dockerAction(String action, String container) {
        try {
            Map<String, String> headers = Map.of("X-Docker-Action", action, "X-Docker-Container", container);
            return Optional.of(fetchReport("/docker/action", headers, DOCKER_ACTION_TIMEOUT));
        } catch (CompletionException e) {
            return Optional.empty();
        }
    }

    Optional<String> dockerStats(String container) {
        try {
            return Optional.of(fetchReport("/docker/stats", Map.of("X-Docker-Container", container), DOCKER_LIST_TIMEOUT));
        } catch (CompletionException e) {
            return Optional.empty();
        }
    }

    Optional<String> dockerFiles(String container) {
        try {
            return Optional.of(fetchReport("/docker/files", Map.of("X-Docker-Container", container), DOCKER_LIST_TIMEOUT));
        } catch (CompletionException e) {
            return Optional.empty();
        }
    }

    Optional<String> saveDockerFiles(String container, String body) {
        return sendBody("/docker/files/save", Map.of("X-Docker-Container", container), body);
    }

    Optional<String> createDockerContainer(String name, String serviceFolder, String body) {
        String folder = URLEncoder.encode(serviceFolder, StandardCharsets.UTF_8);
        return sendBody("/docker/create", Map.of("X-Docker-Name", name, "X-Folder-Path", folder), body);
    }

    private Optional<String> sendBody(String path, Map<String, String> headers, String body) {
        try {
            return Optional.of(fetchReport(path, headers, DOCKER_APPLY_TIMEOUT, body));
        } catch (CompletionException e) {
            return Optional.empty();
        }
    }

    Optional<String> testSgbdConnection(String body) {
        return sgbdReport("/sgbd/test", body);
    }

    Optional<String> sgbdSchemas(String body) {
        return sgbdReport("/sgbd/schemas", body);
    }

    Optional<String> createSgbdSchema(String name, String body) {
        return sgbdSchemaAction("/sgbd/schema/create", name, body);
    }

    Optional<String> dropSgbdSchema(String name, String body) {
        return sgbdSchemaAction("/sgbd/schema/drop", name, body);
    }

    private Optional<String> sgbdSchemaAction(String path, String name, String body) {
        try {
            Map<String, String> headers = Map.of("X-Sgbd-Schema", name);
            return Optional.of(fetchReport(path, headers, DOCKER_LIST_TIMEOUT.multipliedBy(2), body));
        } catch (CompletionException e) {
            return Optional.empty();
        }
    }

    Optional<String> executeSgbdStatements(String requestId, String body) {
        try {
            return Optional.of(fetchReport("/sgbd/execute", Map.of("X-Sgbd-Request", requestId), SGBD_EXECUTE_TIMEOUT, body));
        } catch (CompletionException e) {
            return Optional.empty();
        }
    }

    Optional<String> cancelSgbdStatements(String requestId) {
        try {
            return Optional.of(fetchReport("/sgbd/execute/cancel", Map.of("X-Sgbd-Request", requestId), TIMEOUT));
        } catch (CompletionException e) {
            return Optional.empty();
        }
    }

    Optional<String> sgbdStructure(String body) {
        return sgbdReport("/sgbd/structure", body);
    }

    private Optional<String> sgbdReport(String path, String body) {
        try {
            return Optional.of(fetchReport(path, Map.of(), DOCKER_LIST_TIMEOUT.multipliedBy(2), body));
        } catch (CompletionException e) {
            return Optional.empty();
        }
    }

    Optional<String> installedTools() {
        try {
            return Optional.of(fetchReport("/tools", Map.of()));
        } catch (CompletionException e) {
            return Optional.empty();
        }
    }

    Optional<String> listFolders(String path) {
        return folderReport("/folders", path);
    }

    Optional<String> createServiceFolder(String path) {
        return folderReport("/service/create", path);
    }

    Optional<String> checkServiceFolder(String path) {
        return folderReport("/service/check", path);
    }

    private Optional<String> folderReport(String report, String path) {
        try {
            String encoded = URLEncoder.encode(path, StandardCharsets.UTF_8);
            return Optional.of(fetchReport(report, Map.of("X-Folder-Path", encoded)));
        } catch (CompletionException e) {
            return Optional.empty();
        }
    }

    AgentHealth check() {
        try {
            String text = fetchReport("/health", Map.of());
            return new AgentHealth(Connection.ONLINE,
                    text.contains("shell=true"),
                    text.contains("privileged=true"));
        } catch (CompletionException e) {
            Connection connection = e.getCause() instanceof WebSocketHandshakeException
                    ? Connection.UNAUTHORIZED
                    : Connection.OFFLINE;
            return new AgentHealth(connection, false, false);
        }
    }

    private String fetchReport(String path, Map<String, String> headers) {
        return fetchReport(path, headers, TIMEOUT);
    }

    private String fetchReport(String path, Map<String, String> headers, Duration timeout) {
        return fetchReport(path, headers, timeout, null);
    }

    private String fetchReport(String path, Map<String, String> headers, Duration timeout, String body) {
        CompletableFuture<String> report = new CompletableFuture<>();
        WebSocket.Builder builder = httpClient.newWebSocketBuilder()
                .connectTimeout(TIMEOUT)
                .header("X-Agent-Token", agentToken);
        headers.forEach(builder::header);
        WebSocket agent = builder.buildAsync(agentUrl.resolve(path), new ReportListener(report)).join();
        if (body != null) {
            agent.sendText(body, true).join();
        }
        String text = report.orTimeout(timeout.toMillis(), TimeUnit.MILLISECONDS).join();
        agent.abort();
        return text;
    }

    private static final class ReportListener implements WebSocket.Listener {

        private final CompletableFuture<String> report;
        private final StringBuilder buffer = new StringBuilder();

        private ReportListener(CompletableFuture<String> report) {
            this.report = report;
        }

        @Override
        public CompletionStage<?> onText(WebSocket agent, CharSequence data, boolean last) {
            if (buffer.length() + data.length() > MAX_REPORT_CHARS) {
                agent.abort();
                report.completeExceptionally(new IllegalStateException("Resposta do agente excedeu o limite"));
                return null;
            }
            buffer.append(data);
            if (last) {
                report.complete(buffer.toString());
            }
            agent.request(1);
            return null;
        }

        @Override
        public void onError(WebSocket agent, Throwable error) {
            report.completeExceptionally(error);
        }
    }
}
