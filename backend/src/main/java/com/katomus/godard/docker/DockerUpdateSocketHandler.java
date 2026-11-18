package com.katomus.godard.docker;

import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class DockerUpdateSocketHandler extends TextWebSocketHandler {

  private final DockerUpdateSessionManager sessionManager;

  public DockerUpdateSocketHandler(DockerUpdateSessionManager sessionManager) {
    this.sessionManager = sessionManager;
  }

  @Override
  public void afterConnectionEstablished(WebSocketSession session) throws IOException {
    Object value =
        session.getAttributes().get(DockerUpdateHandshakeInterceptor.CONTAINER_ID_ATTRIBUTE);
    if (!(value instanceof String containerId)) {
      session.close(CloseStatus.POLICY_VIOLATION);
      return;
    }
    sessionManager.attach(containerId, session);
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
