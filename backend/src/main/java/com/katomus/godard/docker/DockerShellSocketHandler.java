package com.katomus.godard.docker;

import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class DockerShellSocketHandler extends TextWebSocketHandler {

  private final DockerShellSessionManager sessionManager;

  public DockerShellSocketHandler(DockerShellSessionManager sessionManager) {
    this.sessionManager = sessionManager;
  }

  @Override
  public void afterConnectionEstablished(WebSocketSession session) throws IOException {
    Object value =
        session.getAttributes().get(DockerShellHandshakeInterceptor.CONTAINER_ID_ATTRIBUTE);
    if (!(value instanceof String containerId)) {
      session.close(CloseStatus.POLICY_VIOLATION);
      return;
    }
    try {
      sessionManager.attach(containerId, session);
    } catch (DockerException | IOException exception) {
      if (session.isOpen()) {
        session.sendMessage(new TextMessage("\r\n[shell indisponível]\r\n"));
        session.close(CloseStatus.SERVER_ERROR);
      }
    }
  }

  @Override
  protected void handleTextMessage(WebSocketSession session, TextMessage message) {
    sessionManager.receive(session, message.getPayload());
  }

  @Override
  public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
    sessionManager.detach(session);
  }

  @Override
  public void handleTransportError(WebSocketSession session, Throwable exception) {
    sessionManager.detach(session);
  }
}
