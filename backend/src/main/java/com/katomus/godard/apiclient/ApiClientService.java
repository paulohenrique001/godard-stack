package com.katomus.godard.apiclient;

import java.io.IOException;
import java.io.InputStream;
import java.net.ConnectException;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ApiClientService {

  private static final Set<String> METHODS = Set.of("GET", "POST", "PUT", "PATCH", "DELETE");
  private static final Set<String> RESTRICTED_HEADERS =
      Set.of("connection", "content-length", "expect", "host", "transfer-encoding", "upgrade");
  private static final int MAX_URL_LENGTH = 8_192;
  private static final int MAX_HEADERS = 30;
  private static final int MAX_HEADER_NAME_LENGTH = 128;
  private static final int MAX_HEADER_VALUE_LENGTH = 4_096;
  private static final int MAX_REQUEST_BODY_BYTES = 1_024 * 1_024;
  private static final int MAX_RESPONSE_BODY_BYTES = 2 * 1_024 * 1_024;
  private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(10);
  private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(30);

  private final HttpClient client;

  public ApiClientService() {
    this(
        HttpClient.newBuilder()
            .connectTimeout(CONNECT_TIMEOUT)
            .followRedirects(HttpClient.Redirect.NEVER)
            .build());
  }

  ApiClientService(HttpClient client) {
    this.client = client;
  }

  public ApiClientResponse execute(ApiClientRequest input) {
    if (input == null) {
      throw invalidRequest();
    }

    String method = normalizeMethod(input.method());
    URI uri = normalizeUri(input.url());
    List<ApiClientHeader> headers = normalizeHeaders(input.headers(), input.authentication());
    byte[] body = normalizeBody(input.body());
    HttpRequest request = buildRequest(method, uri, headers, body);
    long startedAt = System.nanoTime();

    try {
      HttpResponse<InputStream> response =
          client.send(request, HttpResponse.BodyHandlers.ofInputStream());
      String contentType = response.headers().firstValue("content-type").orElse(null);
      BodyContent responseBody;
      try (InputStream inputStream = response.body()) {
        responseBody = readBody(inputStream, contentType);
      }
      return new ApiClientResponse(
          response.statusCode(),
          responseHeaders(response),
          responseBody.text(),
          contentType,
          elapsedMs(startedAt),
          responseBody.sizeBytes(),
          responseBody.truncated(),
          responseBody.binary());
    } catch (HttpTimeoutException exception) {
      throw new ResponseStatusException(
          HttpStatus.GATEWAY_TIMEOUT, "A solicitação excedeu o tempo limite.", exception);
    } catch (ConnectException | UnknownHostException exception) {
      throw new ResponseStatusException(
          HttpStatus.BAD_GATEWAY, "Não foi possível alcançar a API.", exception);
    } catch (IOException exception) {
      throw new ResponseStatusException(
          HttpStatus.BAD_GATEWAY, "Não foi possível concluir a solicitação.", exception);
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE, "A solicitação foi interrompida.", exception);
    }
  }

  private static HttpRequest buildRequest(
      String method, URI uri, List<ApiClientHeader> headers, byte[] body) {
    HttpRequest.Builder builder = HttpRequest.newBuilder(uri).timeout(REQUEST_TIMEOUT);
    for (ApiClientHeader header : headers) {
      builder.header(header.name(), header.value());
    }
    return builder
        .method(
            method,
            body.length == 0
                ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofByteArray(body))
        .build();
  }

  private static String normalizeMethod(String value) {
    String method = value == null ? "" : value.strip().toUpperCase(Locale.ROOT);
    if (!METHODS.contains(method)) {
      throw invalidRequest();
    }
    return method;
  }

  private static URI normalizeUri(String value) {
    String url = value == null ? "" : value.strip();
    if (url.isEmpty() || url.length() > MAX_URL_LENGTH) {
      throw invalidRequest();
    }
    try {
      URI uri = URI.create(url);
      String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
      if ((!scheme.equals("http") && !scheme.equals("https"))
          || uri.getHost() == null
          || uri.getUserInfo() != null) {
        throw invalidRequest();
      }
      return uri;
    } catch (IllegalArgumentException exception) {
      throw invalidRequest();
    }
  }

  private static List<ApiClientHeader> normalizeHeaders(
      List<ApiClientHeader> input, ApiClientAuthentication authentication) {
    if (input == null || input.isEmpty()) {
      return authenticationHeader(authentication);
    }
    if (input.size() > MAX_HEADERS) {
      throw invalidRequest();
    }
    List<ApiClientHeader> headers =
        new ArrayList<>(input.stream().map(ApiClientService::normalizeHeader).toList());
    if (headers.stream().anyMatch(header -> header.name().equalsIgnoreCase("authorization"))) {
      if (authentication != null && !"none".equalsIgnoreCase(authentication.type())) {
        throw invalidRequest();
      }
      return List.copyOf(headers);
    }
    List<ApiClientHeader> authenticationHeaders = authenticationHeader(authentication);
    if (headers.size() + authenticationHeaders.size() > MAX_HEADERS) {
      throw invalidRequest();
    }
    headers.addAll(authenticationHeaders);
    return List.copyOf(headers);
  }

  private static List<ApiClientHeader> authenticationHeader(ApiClientAuthentication input) {
    if (input == null
        || input.type() == null
        || input.type().isBlank()
        || input.type().equalsIgnoreCase("none")) {
      return List.of();
    }
    String type = input.type().strip().toLowerCase(Locale.ROOT);
    if (type.equals("bearer")) {
      return List.of(new ApiClientHeader("Authorization", "Bearer " + nonBlank(input.token())));
    }
    if (type.equals("basic")) {
      String username = nonBlank(input.username());
      String password = input.password() == null ? "" : input.password();
      String encoded =
          Base64.getEncoder()
              .encodeToString((username + ":" + password).getBytes(StandardCharsets.UTF_8));
      return List.of(new ApiClientHeader("Authorization", "Basic " + encoded));
    }
    throw invalidRequest();
  }

  private static String nonBlank(String value) {
    String normalized = value == null ? "" : value.strip();
    if (normalized.isEmpty() || normalized.length() > MAX_HEADER_VALUE_LENGTH) {
      throw invalidRequest();
    }
    return normalized;
  }

  private static ApiClientHeader normalizeHeader(ApiClientHeader input) {
    if (input == null) {
      throw invalidRequest();
    }
    String name = input.name() == null ? "" : input.name().strip();
    String value = input.value() == null ? "" : input.value().strip();
    if (name.isEmpty()
        || name.length() > MAX_HEADER_NAME_LENGTH
        || value.length() > MAX_HEADER_VALUE_LENGTH
        || !isHeaderName(name)
        || value.indexOf('\r') >= 0
        || value.indexOf('\n') >= 0
        || RESTRICTED_HEADERS.contains(name.toLowerCase(Locale.ROOT))) {
      throw invalidRequest();
    }
    return new ApiClientHeader(name, value);
  }

  private static boolean isHeaderName(String value) {
    return value
        .chars()
        .allMatch(
            character ->
                character >= 'a' && character <= 'z'
                    || character >= 'A' && character <= 'Z'
                    || character >= '0' && character <= '9'
                    || "!#$%&'*+-.^_`|~".indexOf(character) >= 0);
  }

  private static byte[] normalizeBody(String value) {
    if (value == null || value.isEmpty()) {
      return new byte[0];
    }
    byte[] body = value.getBytes(StandardCharsets.UTF_8);
    if (body.length > MAX_REQUEST_BODY_BYTES) {
      throw invalidRequest();
    }
    return body;
  }

  private static List<ApiClientHeader> responseHeaders(HttpResponse<?> response) {
    return response.headers().map().entrySet().stream()
        .sorted(Comparator.comparing(entry -> entry.getKey().toLowerCase(Locale.ROOT)))
        .flatMap(
            entry ->
                entry.getValue().stream().map(value -> new ApiClientHeader(entry.getKey(), value)))
        .toList();
  }

  private static BodyContent readBody(InputStream input, String contentType) throws IOException {
    byte[] bytes = input.readNBytes(MAX_RESPONSE_BODY_BYTES + 1);
    boolean truncated = bytes.length > MAX_RESPONSE_BODY_BYTES;
    byte[] visible = truncated ? Arrays.copyOf(bytes, MAX_RESPONSE_BODY_BYTES) : bytes;
    if (!isTextual(contentType)) {
      return new BodyContent("", visible.length, truncated, true);
    }
    return new BodyContent(
        new String(visible, responseCharset(contentType)), visible.length, truncated, false);
  }

  private static boolean isTextual(String contentType) {
    if (contentType == null || contentType.isBlank()) {
      return true;
    }
    String mediaType = contentType.split(";", 2)[0].strip().toLowerCase(Locale.ROOT);
    return mediaType.startsWith("text/")
        || mediaType.contains("json")
        || mediaType.contains("xml")
        || mediaType.equals("application/javascript")
        || mediaType.equals("application/x-www-form-urlencoded");
  }

  private static Charset responseCharset(String contentType) {
    if (contentType == null || contentType.isBlank()) {
      return StandardCharsets.UTF_8;
    }
    try {
      Charset charset = MediaType.parseMediaType(contentType).getCharset();
      return charset == null ? StandardCharsets.UTF_8 : charset;
    } catch (InvalidMediaTypeException exception) {
      return StandardCharsets.UTF_8;
    }
  }

  private static long elapsedMs(long startedAt) {
    return Duration.ofNanos(System.nanoTime() - startedAt).toMillis();
  }

  private static ResponseStatusException invalidRequest() {
    return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Solicitação inválida.");
  }

  private record BodyContent(String text, long sizeBytes, boolean truncated, boolean binary) {}
}
