package com.katomus.godard.docker;

import com.katomus.godard.persistence.ActivityRepository;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

@Component
class DockerShellSessionManager {

  private static final int MAX_SESSIONS = 8;
  private static final int MAX_INPUT_CHARS = 64 * 1024;

  private static final class ManagedSession {

    private final String containerId;
    private final WebSocketSession socket;
    private final Object sendLock = new Object();
    private final AtomicBoolean finished = new AtomicBoolean();
    private DockerShellSession shell;

    private ManagedSession(String containerId, WebSocketSession socket) {
      this.containerId = containerId;
      this.socket = socket;
    }

    private void configure(DockerShellSession shell) {
      this.shell = shell;
    }

    private void deliver(String text) {
      synchronized (sendLock) {
        if (!socket.isOpen()) {
          return;
        }
        try {
          socket.sendMessage(new TextMessage(text));
        } catch (IOException ignored) {
        }
      }
    }

    private void close() {
      if (shell != null) {
        shell.close();
      }
    }
  }

  private final DockerService dockerService;
  private final ActivityRepository activityRepository;
  private final Semaphore slots = new Semaphore(MAX_SESSIONS);
  private final Map<String, ManagedSession> sessions = new ConcurrentHashMap<>();

  DockerShellSessionManager(DockerService dockerService, ActivityRepository activityRepository) {
    this.dockerService = dockerService;
    this.activityRepository = activityRepository;
  }

  void attach(String containerId, WebSocketSession socket) throws IOException {
    dockerService.requireShellAccess(containerId);
    if (!slots.tryAcquire()) {
      throw new IOException("A capacidade de shells Docker foi atingida.");
    }
    ManagedSession managed = new ManagedSession(containerId, socket);
    try {
      DockerShellSession shell =
          new DockerShellSession(containerId, managed::deliver, () -> finish(managed));
      managed.configure(shell);
      sessions.put(socket.getId(), managed);
      shell.start();
      activityRepository.create("container", "muted", "Shell do container iniciado");
    } catch (IOException | RuntimeException exception) {
      slots.release();
      throw exception;
    }
  }

  void receive(WebSocketSession socket, String message) {
    ManagedSession managed = sessions.get(socket.getId());
    if (managed == null
        || message == null
        || message.isEmpty()
        || message.length() > MAX_INPUT_CHARS) {
      close(socket, CloseStatus.POLICY_VIOLATION);
      return;
    }
    try {
      switch (message.charAt(0)) {
        case 'i' -> managed.shell.write(message.substring(1));
        case 'r' -> managed.shell.resize(message.substring(1));
        default -> close(socket, CloseStatus.POLICY_VIOLATION);
      }
    } catch (IOException | RuntimeException exception) {
      managed.deliver("\r\n[entrada recusada]\r\n");
    }
  }

  void detach(WebSocketSession socket) {
    ManagedSession managed = sessions.get(socket.getId());
    if (managed != null) {
      managed.close();
      finish(managed);
    }
  }

  private void finish(ManagedSession managed) {
    if (!managed.finished.compareAndSet(false, true)) {
      return;
    }
    sessions.remove(managed.socket.getId(), managed);
    slots.release();
    activityRepository.create("container", "muted", "Shell do container encerrado");
    close(managed.socket, CloseStatus.NORMAL);
  }

  private static void close(WebSocketSession socket, CloseStatus status) {
    try {
      if (socket.isOpen()) {
        socket.close(status);
      }
    } catch (IOException ignored) {
    }
  }
}
