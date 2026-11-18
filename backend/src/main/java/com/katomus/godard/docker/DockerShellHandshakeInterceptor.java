package com.katomus.godard.docker;

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
public class DockerShellHandshakeInterceptor implements HandshakeInterceptor {

  static final String CONTAINER_ID_ATTRIBUTE = "dockerShellContainerId";

  private final DockerStreamTicketService ticketService;

  public DockerShellHandshakeInterceptor(DockerStreamTicketService ticketService) {
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
    List<String> containers = query.get("container");
    List<String> tickets = query.get("ticket");
    if (containers == null || containers.size() != 1 || tickets == null || tickets.size() != 1) {
      response.setStatusCode(HttpStatus.FORBIDDEN);
      return false;
    }
    String containerId = containers.getFirst();
    if (!DockerService.validContainerId(containerId)
        || !ticketService.consume(
            DockerStreamTicketService.Purpose.SHELL, tickets.getFirst(), containerId)) {
      response.setStatusCode(HttpStatus.FORBIDDEN);
      return false;
    }
    attributes.put(CONTAINER_ID_ATTRIBUTE, containerId);
    return true;
  }

  @Override
  public void afterHandshake(
      ServerHttpRequest request,
      ServerHttpResponse response,
      WebSocketHandler handler,
      Exception exception) {}
}
