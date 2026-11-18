package com.godardstack;

import java.io.IOException;
import java.net.http.WebSocket;
import java.util.concurrent.CompletionStage;

import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

final class AgentListener implements WebSocket.Listener {

    private static final String CONTROL_PREFIX = "\u0001";
    private static final String NEW_SESSION = CONTROL_PREFIX + "new";
    private static final String PERSISTENCE_ERROR = CONTROL_PREFIX + "persistence-error";
    private static final int SESSION_LIMIT_CODE = 4001;
    private static final int MAX_BUFFER_CHARS = 4 * 1024 * 1024;

    private final WebSocketSession session;
    private final TranscriptRecorder recorder;
    private final Runnable onSessionEnded;
    private final StringBuilder buffer = new StringBuilder();

    AgentListener(WebSocketSession session, TranscriptRecorder recorder, Runnable onSessionEnded) {
        this.session = session;
        this.recorder = recorder;
        this.onSessionEnded = onSessionEnded;
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
            String output = buffer.toString();
            buffer.setLength(0);
            if (output.startsWith(CONTROL_PREFIX)) {
                if (NEW_SESSION.equals(output)) {
                    recorder.startNewSession();
                }
                forwardPersistenceError(agent);
                forward(agent, output);
            } else {
                recorder.record(output);
                forwardPersistenceError(agent);
                forward(agent, output);
            }
        }
        agent.request(1);
        return null;
    }

    @Override
    public CompletionStage<?> onClose(WebSocket agent, int statusCode, String reason) {
        recorder.endSession();
        onSessionEnded.run();
        closeSession(statusCode == SESSION_LIMIT_CODE ? new CloseStatus(SESSION_LIMIT_CODE) : CloseStatus.NORMAL);
        return null;
    }

    @Override
    public void onError(WebSocket agent, Throwable error) {
        closeSession(CloseStatus.SERVER_ERROR);
    }

    private void forward(WebSocket agent, String text) {
        try {
            session.sendMessage(new TextMessage(text));
        } catch (IOException | IllegalStateException e) {
            agent.abort();
        }
    }

    private void forwardPersistenceError(WebSocket agent) {
        if (recorder.consumePersistenceError()) {
            forward(agent, PERSISTENCE_ERROR);
        }
    }

    private void closeSession(CloseStatus status) {
        try {
            session.close(status);
        } catch (IOException ignored) {
        }
    }
}
