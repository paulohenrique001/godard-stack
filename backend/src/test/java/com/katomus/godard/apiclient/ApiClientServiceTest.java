package com.katomus.godard.apiclient;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class ApiClientServiceTest {

  private HttpServer server;

  @BeforeEach
  void startServer() throws IOException {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/echo", this::echo);
    server.start();
  }

  @AfterEach
  void stopServer() {
    if (server != null) {
      server.stop(0);
    }
  }

  @Test
  void sendsRequestAndReturnsTextualResponse() {
    ApiClientResponse response =
        new ApiClientService()
            .execute(
                new ApiClientRequest(
                    "POST",
                    url("/echo"),
                    List.of(
                        new ApiClientHeader("Content-Type", "application/json"),
                        new ApiClientHeader("X-Request-Id", "test-request")),
                    "{\"name\":\"Godard\"}",
                    null));

    assertEquals(201, response.status());
    assertEquals("application/json", response.contentType());
    assertEquals("{\"received\":\"{\\\"name\\\":\\\"Godard\\\"}\"}", response.body());
    assertTrue(response.headers().stream().anyMatch(header -> header.name().equals("x-trace-id")));
    assertFalse(response.truncated());
    assertFalse(response.binary());
  }

  @Test
  void rejectsUnsupportedTargetsAndSensitiveDiagnostics() {
    ApiClientService service = new ApiClientService();

    ResponseStatusException invalidMethod =
        assertThrows(
            ResponseStatusException.class,
            () ->
                service.execute(new ApiClientRequest("HEAD", url("/echo"), List.of(), null, null)));
    ResponseStatusException restrictedHeader =
        assertThrows(
            ResponseStatusException.class,
            () ->
                service.execute(
                    new ApiClientRequest(
                        "GET",
                        url("/echo"),
                        List.of(new ApiClientHeader("Host", "example.test")),
                        null,
                        null)));

    assertEquals(HttpStatus.BAD_REQUEST, invalidMethod.getStatusCode());
    assertEquals(HttpStatus.BAD_REQUEST, restrictedHeader.getStatusCode());
    assertFalse(
        new ApiClientRequest("GET", "https://example.test/?token=secret", List.of(), "secret", null)
            .toString()
            .contains("secret"));
  }

  @Test
  void addsBearerAuthenticationWithoutExposingItInDiagnostics() {
    ApiClientResponse response =
        new ApiClientService()
            .execute(
                new ApiClientRequest(
                    "GET",
                    url("/echo"),
                    List.of(),
                    "",
                    new ApiClientAuthentication("bearer", "private-token", "", "")));

    assertEquals(201, response.status());
    assertFalse(
        new ApiClientAuthentication("bearer", "private-token", "", "")
            .toString()
            .contains("private-token"));
  }

  private String url(String path) {
    return "http://127.0.0.1:" + server.getAddress().getPort() + path;
  }

  private void echo(HttpExchange exchange) throws IOException {
    String received = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    byte[] response =
        ("{\"received\":\"" + received.replace("\"", "\\\"") + "\"}")
            .getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().add("Content-Type", "application/json");
    exchange.getResponseHeaders().add("X-Trace-Id", "local-test");
    exchange.sendResponseHeaders(201, response.length);
    exchange.getResponseBody().write(response);
    exchange.close();
  }
}
