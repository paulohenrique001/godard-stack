package com.godardstack;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

abstract class DockerStreamHandler extends TextWebSocketHandler {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final int MAX_BUFFER_CHARS = 4 * 1024 * 1024;
    private static final Pattern CONTAINER_QUERY = Pattern.compile("container=([a-f0-9]{12,64})");

    private final Map<String, WebSocket> agents = new ConcurrentHashMap<>();
    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final URI streamUrl;
    private final String agentToken;

    DockerStreamHandler(String agentUrl, String agentToken, String path) {
        this.streamUrl = URI.create(agentUrl).resolve(path);
        this.agentToken = agentToken;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws IOException {
        Matcher container = CONTAINER_QUERY.matcher(String.valueOf(session.getUri().getQuery()));
        if (!container.matches() || !isAllowed(container.group(1))) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        try {
            WebSocket agent = httpClient.newWebSocketBuilder()
                    .connectTimeout(CONNECT_TIMEOUT)
                    .header("X-Agent-Token", agentToken)
                    .header("X-Docker-Container", container.group(1))
                    .buildAsync(streamUrl, new StreamListener(session))
                    .join();
            agents.put(session.getId(), agent);
        } catch (CompletionException e) {
            session.close(CloseStatus.SERVER_ERROR);
        }
    }

    boolean isAllowed(String container) {
        return true;
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        WebSocket agent = agents.get(session.getId());
        if (agent != null) {
            agent.sendText(message.getPayload(), true).join();
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        WebSocket agent = agents.remove(session.getId());
        if (agent != null) {
            agent.abort();
        }
    }

    private static final class StreamListener implements WebSocket.Listener {

        private final WebSocketSession session;
        private final StringBuilder buffer = new StringBuilder();

        private StreamListener(WebSocketSession session) {
            this.session = session;
        }

        @Override
        public CompletionStage<?> onText(WebSocket agent, CharSequence data, boolean last) {
            if (buffer.length() + data.length() > MAX_BUFFER_CHARS) {
                agent.abort();
                closeSession(new CloseStatus(1009, "saída do agente excedeu o limite"));
                return null;
            }
            buffer.append(data);
            if (last) {
                try {
                    session.sendMessage(new TextMessage(buffer.toString()));
                } catch (IOException | IllegalStateException e) {
                    agent.abort();
                }
                buffer.setLength(0);
            }
            agent.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(WebSocket agent, int statusCode, String reason) {
            closeSession(CloseStatus.NORMAL);
            return null;
        }

        @Override
        public void onError(WebSocket agent, Throwable error) {
            closeSession(CloseStatus.SERVER_ERROR);
        }

        private void closeSession(CloseStatus status) {
            try {
                session.close(status);
            } catch (IOException ignored) {
            }
        }
    }
}
