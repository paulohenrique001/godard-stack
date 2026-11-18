package com.katomus.godard.terminal;

import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class TerminalSocketHandler extends TextWebSocketHandler {

  private final TerminalSessionManager sessionManager;

  public TerminalSocketHandler(TerminalSessionManager sessionManager) {
    this.sessionManager = sessionManager;
  }

  @Override
  public void afterConnectionEstablished(WebSocketSession session) throws IOException {
    Long tabId = tabId(session);
    if (tabId == null) {
      session.close(CloseStatus.POLICY_VIOLATION);
      return;
    }
    try {
      sessionManager.attach(tabId, session);
    } catch (IOException exception) {
      if (session.isOpen()) {
        session.sendMessage(new TextMessage("\r\n[terminal indisponível]\r\n"));
        session.close(CloseStatus.SERVER_ERROR);
      }
    }
  }

  @Override
  protected void handleTextMessage(WebSocketSession session, TextMessage message) {
    Long tabId = tabId(session);
    if (tabId == null) {
      close(session, CloseStatus.POLICY_VIOLATION);
      return;
    }
    sessionManager.receive(tabId, session, message.getPayload());
  }

  @Override
  public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
    Long tabId = tabId(session);
    if (tabId != null) {
      sessionManager.detach(tabId, session);
    }
  }

  @Override
  public void handleTransportError(WebSocketSession session, Throwable exception) {
    Long tabId = tabId(session);
    if (tabId != null) {
      sessionManager.detach(tabId, session);
    }
    close(session, CloseStatus.SERVER_ERROR);
  }

  private static Long tabId(WebSocketSession session) {
    Object value = session.getAttributes().get(TerminalHandshakeInterceptor.TAB_ID_ATTRIBUTE);
    return value instanceof Long tabId ? tabId : null;
  }

  private static void close(WebSocketSession session, CloseStatus status) {
    try {
      if (session.isOpen()) {
        session.close(status);
      }
    } catch (IOException ignored) {
    }
  }
}
