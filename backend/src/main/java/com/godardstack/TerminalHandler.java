package com.godardstack;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class TerminalHandler extends TextWebSocketHandler {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);

    private static final Pattern TAB_QUERY = Pattern.compile("tab=(\\d{1,18})");

    private final Map<String, WebSocket> agents = new ConcurrentHashMap<>();
    private final Map<String, TranscriptRecorder> recorders = new ConcurrentHashMap<>();
    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final UserRepository userRepository;
    private final TerminalTranscriptRepository transcriptRepository;
    private final TerminalTabRepository tabRepository;
    private final ActivityLogRepository activityLogRepository;
    private final ServiceFolderRepository serviceFolderRepository;
    private final URI agentUrl;
    private final String agentToken;

    public TerminalHandler(UserRepository userRepository,
                           TerminalTranscriptRepository transcriptRepository,
                           TerminalTabRepository tabRepository,
                           ActivityLogRepository activityLogRepository,
                           ServiceFolderRepository serviceFolderRepository,
                           @Value("${agent.url}") String agentUrl,
                           @Value("${agent.token}") String agentToken) {
        this.userRepository = userRepository;
        this.transcriptRepository = transcriptRepository;
        this.tabRepository = tabRepository;
        this.activityLogRepository = activityLogRepository;
        this.serviceFolderRepository = serviceFolderRepository;
        this.agentUrl = URI.create(agentUrl);
        this.agentToken = agentToken;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws IOException {
        Matcher tab = TAB_QUERY.matcher(String.valueOf(session.getUri().getQuery()));
        if (userRepository.findName().isEmpty() || !tab.matches()) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        long tabId = Long.parseLong(tab.group(1));
        if (tabRepository.find(tabId).isEmpty()) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        TranscriptRecorder recorder = new TranscriptRecorder(transcriptRepository, tabRepository, tabId);
        String directory = tabRepository.findCwd(tabId).orElse("");
        String serviceFolder = serviceFolderRepository.find().orElse("");
        recorders.put(session.getId(), recorder);
        try {
            WebSocket agent = httpClient.newWebSocketBuilder()
                    .connectTimeout(CONNECT_TIMEOUT)
                    .header("X-Agent-Token", agentToken)
                    .header("X-Terminal-Tab", String.valueOf(tabId))
                    .header("X-Terminal-Cwd", URLEncoder.encode(directory, StandardCharsets.UTF_8))
                    .header("X-Folder-Path", URLEncoder.encode(serviceFolder, StandardCharsets.UTF_8))
                    .buildAsync(agentUrl, new AgentListener(session, recorder,
                            () -> activityLogRepository.create("console", "muted", "Sessão de console encerrada")))
                    .join();
            agents.put(session.getId(), agent);
        } catch (CompletionException e) {
            session.sendMessage(new TextMessage("\r\n[agente indisponível]\r\n"));
            session.close(CloseStatus.SERVER_ERROR);
        }
    }

    void discardTranscript(long tabId) {
        recorders.values().stream()
                .filter(recorder -> recorder.tabId() == tabId)
                .forEach(TranscriptRecorder::discard);
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
        TranscriptRecorder recorder = recorders.remove(session.getId());
        if (recorder != null) {
            recorder.detach();
        }
        WebSocket agent = agents.remove(session.getId());
        if (agent != null) {
            agent.sendClose(WebSocket.NORMAL_CLOSURE, "");
        }
    }
}
