package com.katomus.godard.terminal;

import com.katomus.godard.persistence.ActivityRepository;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

@Service
public class TerminalSessionManager {

  public static final String NEW_SESSION_CONTROL = "\u0001new";
  public static final String ATTACHED_SESSION_CONTROL = "\u0001attached";
  public static final String PERSISTENCE_ERROR_CONTROL = "\u0001persistence-error";

  private static final int MAX_SESSIONS = 16;
  private static final int MAX_TERMINAL_INPUT_CHARS = 64 * 1024;
  private static final int MAX_DETACHED_CHARS = 256 * 1024;

  private final TerminalAvailability availability;
  private final TerminalTabRepository tabRepository;
  private final TerminalTranscriptRepository transcriptRepository;
  private final ActivityRepository activityRepository;
  private final Semaphore slots = new Semaphore(MAX_SESSIONS);
  private final Object sessionLock = new Object();
  private final Map<Long, ManagedSession> sessions = new ConcurrentHashMap<>();

  public TerminalSessionManager(
      TerminalAvailability availability,
      TerminalTabRepository tabRepository,
      TerminalTranscriptRepository transcriptRepository,
      ActivityRepository activityRepository) {
    this.availability = availability;
    this.tabRepository = tabRepository;
    this.transcriptRepository = transcriptRepository;
    this.activityRepository = activityRepository;
  }

  public void attach(long tabId, WebSocketSession client) throws IOException {
    ManagedSession managed;
    boolean created = false;
    synchronized (sessionLock) {
      managed = sessions.get(tabId);
      if (managed == null) {
        TerminalAvailability.Capability capability = availability.capability();
        if (!capability.available()) {
          throw new IOException(capability.reason());
        }
        TerminalTabRepository.TerminalTab tab =
            tabRepository.find(tabId).orElseThrow(() -> new IOException("Console não encontrado."));
        if (!slots.tryAcquire()) {
          throw new IOException("A capacidade de sessões foi atingida.");
        }
        ManagedSession candidate = new ManagedSession(tabId);
        TranscriptRecorder recorder =
            new TranscriptRecorder(
                transcriptRepository, tabRepository, tabId, candidate::reportPersistenceError);
        recorder.startNewSession();
        try {
          TerminalSession terminal =
              new TerminalSession(
                  capability.shell(),
                  tab.cwd(),
                  text -> {
                    recorder.record(text);
                    candidate.deliver(text);
                  },
                  () -> finish(candidate));
          candidate.configure(terminal, recorder);
          sessions.put(tabId, candidate);
          managed = candidate;
          created = true;
          activityRepository.create("console", "muted", "Sessão de console iniciada");
        } catch (IOException | RuntimeException exception) {
          slots.release();
          throw exception;
        }
      }
    }
    managed.attach(client, created ? NEW_SESSION_CONTROL : ATTACHED_SESSION_CONTROL);
    if (created) {
      managed.start();
    }
  }

  public void receive(long tabId, WebSocketSession client, String message) {
    if (message == null || message.isEmpty() || message.length() > MAX_TERMINAL_INPUT_CHARS) {
      closeClient(client, CloseStatus.POLICY_VIOLATION);
      return;
    }
    ManagedSession managed = sessions.get(tabId);
    if (managed == null || !managed.accepts(client)) {
      closeClient(client, CloseStatus.POLICY_VIOLATION);
      return;
    }
    try {
      switch (message.charAt(0)) {
        case 'i' -> managed.write(message.substring(1));
        case 'r' -> managed.resize(message.substring(1));
        default -> closeClient(client, CloseStatus.POLICY_VIOLATION);
      }
    } catch (IOException | RuntimeException exception) {
      managed.send("\r\n[entrada recusada]\r\n");
    }
  }

  public void detach(long tabId, WebSocketSession client) {
    ManagedSession managed = sessions.get(tabId);
    if (managed != null) {
      managed.detach(client);
    }
  }

  public void close(long tabId) {
    ManagedSession managed = sessions.get(tabId);
    if (managed != null) {
      managed.close();
    }
  }

  public void discardTranscript(long tabId) {
    ManagedSession managed = sessions.get(tabId);
    if (managed != null) {
      managed.discardTranscript();
    }
  }

  public boolean alive(long tabId) {
    ManagedSession managed = sessions.get(tabId);
    return managed != null && managed.isAlive();
  }

  @PreDestroy
  public void shutdown() {
    sessions.values().forEach(ManagedSession::close);
  }

  private void finish(ManagedSession managed) {
    if (!managed.markFinished()) {
      return;
    }
    sessions.remove(managed.tabId(), managed);
    managed.endTranscript();
    slots.release();
    activityRepository.create("console", "muted", "Sessão de console encerrada");
    managed.closeClient();
  }

  private static void closeClient(WebSocketSession client, CloseStatus status) {
    try {
      if (client.isOpen()) {
        client.close(status);
      }
    } catch (IOException ignored) {
    }
  }

  private static final class ManagedSession {

    private final long tabId;
    private final Object sendLock = new Object();
    private final StringBuilder detachedOutput = new StringBuilder();
    private final AtomicBoolean finished = new AtomicBoolean();
    private TerminalSession terminal;
    private TranscriptRecorder recorder;
    private WebSocketSession client;

    private ManagedSession(long tabId) {
      this.tabId = tabId;
    }

    private long tabId() {
      return tabId;
    }

    private synchronized void configure(TerminalSession terminal, TranscriptRecorder recorder) {
      this.terminal = terminal;
      this.recorder = recorder;
    }

    private void start() {
      terminal.start();
    }

    private void attach(WebSocketSession next, String control) {
      WebSocketSession previous;
      synchronized (sendLock) {
        previous = client;
        client = next;
        sendLocked(next, control);
        if (!detachedOutput.isEmpty()) {
          sendLocked(next, detachedOutput.toString());
          detachedOutput.setLength(0);
        }
      }
      if (previous != null && previous != next) {
        TerminalSessionManager.closeClient(previous, CloseStatus.NORMAL);
      }
    }

    private void detach(WebSocketSession closed) {
      synchronized (sendLock) {
        if (client == closed) {
          client = null;
        }
      }
    }

    private boolean accepts(WebSocketSession candidate) {
      synchronized (sendLock) {
        return client == candidate;
      }
    }

    private void deliver(String text) {
      synchronized (sendLock) {
        if (client == null || !client.isOpen()) {
          keepDetached(text);
          return;
        }
        sendLocked(client, text);
      }
    }

    private void reportPersistenceError() {
      send(PERSISTENCE_ERROR_CONTROL);
    }

    private void send(String text) {
      synchronized (sendLock) {
        if (client != null && client.isOpen()) {
          sendLocked(client, text);
        }
      }
    }

    private void write(String text) throws IOException {
      terminal.write(text);
    }

    private void resize(String dimensions) {
      terminal.resize(dimensions);
    }

    private boolean isAlive() {
      return terminal != null && terminal.isAlive();
    }

    private void discardTranscript() {
      if (recorder != null) {
        recorder.discard();
      }
    }

    private void endTranscript() {
      if (recorder != null) {
        recorder.endSession();
      }
    }

    private void close() {
      if (terminal != null) {
        terminal.close();
      }
    }

    private boolean markFinished() {
      return finished.compareAndSet(false, true);
    }

    private void closeClient() {
      WebSocketSession current;
      synchronized (sendLock) {
        current = client;
        client = null;
      }
      if (current != null) {
        TerminalSessionManager.closeClient(current, CloseStatus.NORMAL);
      }
    }

    private void keepDetached(String text) {
      detachedOutput.append(text);
      int excess = detachedOutput.length() - MAX_DETACHED_CHARS;
      if (excess > 0) {
        detachedOutput.delete(0, excess);
      }
    }

    private void sendLocked(WebSocketSession target, String text) {
      try {
        target.sendMessage(new TextMessage(text));
      } catch (IOException exception) {
        if (client == target) {
          client = null;
        }
        if (!text.startsWith("\u0001")) {
          keepDetached(text);
        }
      }
    }
  }
}
