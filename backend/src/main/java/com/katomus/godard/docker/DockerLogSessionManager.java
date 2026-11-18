package com.katomus.godard.docker;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

@Component
class DockerLogSessionManager {

  private static final int MAX_LOG_CHARS = 4 * 1024 * 1024;
  private static final String LOG_LIMIT_MESSAGE =
      "\r\n[saída de logs excedeu o limite da sessão]\r\n";

  private record LogSession(Process process, WebSocketSession socket) {}

  private final DockerService dockerService;
  private final Map<String, LogSession> sessions = new ConcurrentHashMap<>();

  DockerLogSessionManager(DockerService dockerService) {
    this.dockerService = dockerService;
  }

  void attach(String containerId, WebSocketSession socket) throws IOException {
    LogSession logSession = new LogSession(dockerService.followLogs(containerId), socket);
    sessions.put(socket.getId(), logSession);
    Thread.startVirtualThread(() -> stream(logSession));
  }

  void detach(WebSocketSession socket) {
    LogSession session = sessions.remove(socket.getId());
    if (session != null) {
      session.process().destroyForcibly();
    }
  }

  private void stream(LogSession logSession) {
    int written = 0;
    try (Reader reader =
        new InputStreamReader(logSession.process().getInputStream(), StandardCharsets.UTF_8)) {
      char[] buffer = new char[8192];
      int read = reader.read(buffer);
      while (read >= 0 && logSession.socket().isOpen()) {
        if (written + read > MAX_LOG_CHARS) {
          logSession.socket().sendMessage(new TextMessage(LOG_LIMIT_MESSAGE));
          return;
        }
        logSession.socket().sendMessage(new TextMessage(new String(buffer, 0, read)));
        written += read;
        read = reader.read(buffer);
      }
    } catch (IOException ignored) {
    } finally {
      sessions.remove(logSession.socket().getId(), logSession);
      logSession.process().destroyForcibly();
      close(logSession.socket());
    }
  }

  private static void close(WebSocketSession session) {
    try {
      if (session.isOpen()) {
        session.close(CloseStatus.NORMAL);
      }
    } catch (IOException ignored) {
    }
  }
}
