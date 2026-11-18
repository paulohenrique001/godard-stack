package com.katomus.godard.docker;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

@Component
class DockerUpdateSessionManager {

  static final String UPDATED_CONTROL = "\u0001updated";
  static final String FAILED_CONTROL = "\u0001failed";

  private static final class UpdateSession {

    private final String containerId;
    private final WebSocketSession socket;
    private final AtomicBoolean active = new AtomicBoolean(true);
    private final Object sendLock = new Object();

    private UpdateSession(String containerId, WebSocketSession socket) {
      this.containerId = containerId;
      this.socket = socket;
    }

    private boolean active() {
      return active.get() && socket.isOpen();
    }

    private void send(String text) {
      synchronized (sendLock) {
        if (!active()) {
          return;
        }
        try {
          socket.sendMessage(new TextMessage(text));
        } catch (IOException exception) {
          active.set(false);
        }
      }
    }
  }

  private final DockerComposeService composeService;
  private final Map<String, UpdateSession> sessions = new ConcurrentHashMap<>();

  DockerUpdateSessionManager(DockerComposeService composeService) {
    this.composeService = composeService;
  }

  void attach(String containerId, WebSocketSession socket) {
    UpdateSession update = new UpdateSession(containerId, socket);
    sessions.put(socket.getId(), update);
    Thread.startVirtualThread(() -> stream(update));
  }

  void detach(WebSocketSession socket) {
    UpdateSession update = sessions.remove(socket.getId());
    if (update != null) {
      update.active.set(false);
    }
  }

  private void stream(UpdateSession update) {
    boolean updated = false;
    try {
      updated = composeService.update(update.containerId, update::send, update::active);
    } catch (DockerException exception) {
      update.send(exception.getMessage() + "\n");
    } finally {
      if (update.active()) {
        update.send(updated ? UPDATED_CONTROL : FAILED_CONTROL);
        close(update.socket);
      }
      sessions.remove(update.socket.getId(), update);
    }
  }

  private static void close(WebSocketSession socket) {
    try {
      if (socket.isOpen()) {
        socket.close(CloseStatus.NORMAL);
      }
    } catch (IOException ignored) {
    }
  }
}
