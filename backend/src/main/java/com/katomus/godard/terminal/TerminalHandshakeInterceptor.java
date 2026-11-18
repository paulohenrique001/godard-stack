package com.katomus.godard.terminal;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.MultiValueMap;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class TerminalHandshakeInterceptor implements HandshakeInterceptor {

  static final String TAB_ID_ATTRIBUTE = "terminalTabId";

  private final TerminalTicketService ticketService;

  public TerminalHandshakeInterceptor(TerminalTicketService ticketService) {
    this.ticketService = ticketService;
  }

  @Override
  public boolean beforeHandshake(
      ServerHttpRequest request,
      ServerHttpResponse response,
      WebSocketHandler handler,
      Map<String, Object> attributes) {
    MultiValueMap<String, String> query =
        UriComponentsBuilder.fromUri(request.getURI()).build().getQueryParams();
    List<String> tabs = query.get("tab");
    List<String> tickets = query.get("ticket");
    if (tabs == null || tabs.size() != 1 || tickets == null || tickets.size() != 1) {
      response.setStatusCode(HttpStatus.FORBIDDEN);
      return false;
    }
    long tabId;
    try {
      tabId = Long.parseLong(tabs.getFirst());
    } catch (NumberFormatException exception) {
      response.setStatusCode(HttpStatus.FORBIDDEN);
      return false;
    }
    if (tabId < 1 || !ticketService.consume(tickets.getFirst(), tabId)) {
      response.setStatusCode(HttpStatus.FORBIDDEN);
      return false;
    }
    attributes.put(TAB_ID_ATTRIBUTE, tabId);
    return true;
  }

  @Override
  public void afterHandshake(
      ServerHttpRequest request,
      ServerHttpResponse response,
      WebSocketHandler handler,
      Exception exception) {}
}
