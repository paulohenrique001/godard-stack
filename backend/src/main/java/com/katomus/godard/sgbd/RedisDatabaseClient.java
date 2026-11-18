package com.katomus.godard.sgbd;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import org.springframework.stereotype.Component;

@Component
class RedisDatabaseClient implements SgbdClient {

  private static final int CONNECT_TIMEOUT_MS = 5_000;
  private static final int READ_TIMEOUT_MS = 30_000;
  private static final int MAX_BULK_BYTES = 256 * 1024;
  private static final int MAX_LINE_CHARS = 64 * 1024;
  private static final int MAX_ARRAY_ITEMS = 1_000;
  private static final int MAX_DEPTH = 12;
  private static final int MAX_RESULT_CHARS = 512 * 1024;

  @Override
  public SgbdHealth test(ConnectionTarget target) throws SgbdClientException {
    try (RedisSession session = open(target)) {
      send(session.output(), List.of("INFO", "server"));
      RedisValue info = read(session.input(), 0);
      long startedAt = System.nanoTime();
      send(session.output(), List.of("PING"));
      read(session.input(), 0);
      long elapsed = Math.max(1, Math.round((System.nanoTime() - startedAt) / 1_000_000.0));
      return new SgbdHealth("Redis " + redisVersion(info), elapsed);
    } catch (IOException | RedisProtocolException exception) {
      throw failure(exception, false);
    }
  }

  @Override
  public SgbdQueryResult execute(ConnectionTarget target, String command)
      throws SgbdClientException {
    long startedAt = System.nanoTime();
    try (RedisSession session = open(target)) {
      List<String> tokens = tokens(command);
      if (tokens.isEmpty()) {
        throw new RedisProtocolException("Comando Redis vazio.");
      }
      send(session.output(), tokens);
      RedisValue reply = read(session.input(), 0);
      long elapsed = Math.max(1, Math.round((System.nanoTime() - startedAt) / 1_000_000.0));
      return result(reply, elapsed, tokens.getFirst());
    } catch (IOException | RedisProtocolException exception) {
      throw failure(exception, true);
    }
  }

  private RedisSession open(ConnectionTarget target) throws IOException, RedisProtocolException {
    Socket socket = openSocket(target);
    RedisSession session =
        new RedisSession(
            socket, socket.getOutputStream(), new BufferedInputStream(socket.getInputStream()));
    try {
      if (!target.password().isEmpty()) {
        List<String> authentication =
            target.username().isEmpty()
                ? List.of("AUTH", target.password())
                : List.of("AUTH", target.username(), target.password());
        send(session.output(), authentication);
        read(session.input(), 0);
      }
      if (!target.databaseName().isEmpty() && !"0".equals(target.databaseName())) {
        send(session.output(), List.of("SELECT", target.databaseName()));
        read(session.input(), 0);
      }
      return session;
    } catch (IOException | RedisProtocolException exception) {
      try {
        session.close();
      } catch (IOException ignored) {
      }
      throw exception;
    }
  }

  private Socket openSocket(ConnectionTarget target) throws IOException {
    Socket socket = new Socket();
    socket.connect(new InetSocketAddress(target.host(), target.port()), CONNECT_TIMEOUT_MS);
    socket.setSoTimeout(READ_TIMEOUT_MS);
    if (!target.ssl()) {
      return socket;
    }
    SSLSocket secured =
        (SSLSocket)
            ((SSLSocketFactory) SSLSocketFactory.getDefault())
                .createSocket(socket, target.host(), target.port(), true);
    SSLParameters parameters = secured.getSSLParameters();
    parameters.setEndpointIdentificationAlgorithm("HTTPS");
    secured.setSSLParameters(parameters);
    secured.startHandshake();
    secured.setSoTimeout(READ_TIMEOUT_MS);
    return secured;
  }

  private static SgbdQueryResult result(RedisValue reply, long elapsed, String command) {
    if (reply instanceof RedisStatus status) {
      return new SgbdQueryResult(status.value(), List.of(), List.of(), null, false, elapsed);
    }
    if (reply instanceof RedisInteger integer) {
      return new SgbdQueryResult(
          "(integer) " + integer.value(), List.of(), List.of(), integer.value(), false, elapsed);
    }
    if (reply instanceof RedisArray array
        && "HGETALL".equalsIgnoreCase(command)
        && array.values().size() % 2 == 0) {
      return pairsResult(array, elapsed);
    }
    List<String> values = flatten(reply);
    boolean truncated = false;
    int characters = 0;
    List<List<String>> rows = new ArrayList<>();
    for (String value : values) {
      if (characters + value.length() > MAX_RESULT_CHARS) {
        truncated = true;
        break;
      }
      characters += value.length();
      rows.add(List.of(value));
    }
    String message =
        rows.size() + (rows.size() == 1 ? " resposta retornada." : " respostas retornadas.");
    if (truncated) {
      message += " A visualização foi limitada para proteger o aplicativo.";
    }
    return new SgbdQueryResult(
        message, List.of("Resultado"), List.copyOf(rows), null, truncated, elapsed);
  }

  private static SgbdQueryResult pairsResult(RedisArray array, long elapsed) {
    List<List<String>> rows = new ArrayList<>();
    int characters = 0;
    boolean truncated = false;
    for (int index = 0; index < array.values().size(); index += 2) {
      String key = display(array.values().get(index));
      String value = display(array.values().get(index + 1));
      if (characters + key.length() + value.length() > MAX_RESULT_CHARS) {
        truncated = true;
        break;
      }
      characters += key.length() + value.length();
      rows.add(List.of(key, value));
    }
    String message = rows.size() + (rows.size() == 1 ? " campo retornado." : " campos retornados.");
    return new SgbdQueryResult(
        message, List.of("Campo", "Valor"), List.copyOf(rows), null, truncated, elapsed);
  }

  private static List<String> flatten(RedisValue value) {
    if (value instanceof RedisArray array) {
      return array.values().stream().map(RedisDatabaseClient::display).toList();
    }
    return List.of(display(value));
  }

  private static String display(RedisValue value) {
    return switch (value) {
      case RedisStatus status -> status.value();
      case RedisInteger integer -> "(integer) " + integer.value();
      case RedisBulk bulk -> bulk.value() == null ? "(nil)" : bulk.value();
      case RedisArray array ->
          "["
              + String.join(
                  ", ",
                  array.values().stream().limit(40).map(RedisDatabaseClient::display).toList())
              + (array.values().size() > 40 ? ", …]" : "]");
    };
  }

  private static String redisVersion(RedisValue info) {
    String source = display(info);
    return source
        .lines()
        .filter(line -> line.startsWith("redis_version:"))
        .map(line -> line.substring("redis_version:".length()).strip())
        .findFirst()
        .orElse("desconhecida");
  }

  private static void send(OutputStream output, List<String> command) throws IOException {
    StringBuilder payload = new StringBuilder("*").append(command.size()).append("\r\n");
    for (String argument : command) {
      byte[] bytes = argument.getBytes(StandardCharsets.UTF_8);
      payload.append('$').append(bytes.length).append("\r\n").append(argument).append("\r\n");
    }
    output.write(payload.toString().getBytes(StandardCharsets.UTF_8));
    output.flush();
  }

  private static RedisValue read(InputStream input, int depth)
      throws IOException, RedisProtocolException {
    if (depth > MAX_DEPTH) {
      throw new RedisProtocolException("Resposta Redis é profunda demais.");
    }
    String header = readLine(input);
    if (header.isEmpty()) {
      throw new RedisProtocolException("Resposta Redis vazia.");
    }
    String content = header.substring(1);
    return switch (header.charAt(0)) {
      case '+' -> new RedisStatus(content);
      case ':' -> new RedisInteger(parseNumber(content));
      case '$' -> new RedisBulk(readBulk(input, parseLength(content)));
      case '*' -> array(input, parseLength(content), depth + 1);
      case '-' -> throw new RedisProtocolException(content);
      default -> throw new RedisProtocolException("Resposta Redis desconhecida.");
    };
  }

  private static RedisArray array(InputStream input, int length, int depth)
      throws IOException, RedisProtocolException {
    if (length < 0) {
      return new RedisArray(List.of());
    }
    if (length > MAX_ARRAY_ITEMS) {
      throw new RedisProtocolException("Resposta Redis tem itens demais.");
    }
    List<RedisValue> values = new ArrayList<>();
    for (int index = 0; index < length; index++) {
      values.add(read(input, depth));
    }
    return new RedisArray(List.copyOf(values));
  }

  private static String readBulk(InputStream input, int length)
      throws IOException, RedisProtocolException {
    if (length < 0) {
      return null;
    }
    if (length > MAX_BULK_BYTES) {
      throw new RedisProtocolException("A resposta Redis excede o limite de visualização.");
    }
    byte[] bytes = input.readNBytes(length);
    if (bytes.length != length || input.read() != '\r' || input.read() != '\n') {
      throw new RedisProtocolException("Resposta Redis incompleta.");
    }
    return new String(bytes, StandardCharsets.UTF_8);
  }

  private static String readLine(InputStream input) throws IOException, RedisProtocolException {
    StringBuilder line = new StringBuilder();
    int current;
    while ((current = input.read()) != -1) {
      if (current == '\n') {
        return line.toString();
      }
      if (current != '\r') {
        line.append((char) current);
        if (line.length() > MAX_LINE_CHARS) {
          throw new RedisProtocolException("Linha Redis excede o limite de visualização.");
        }
      }
    }
    throw new RedisProtocolException("Resposta Redis incompleta.");
  }

  private static int parseLength(String value) throws RedisProtocolException {
    try {
      return Integer.parseInt(value);
    } catch (NumberFormatException exception) {
      throw new RedisProtocolException("Resposta Redis inválida.");
    }
  }

  private static long parseNumber(String value) throws RedisProtocolException {
    try {
      return Long.parseLong(value);
    } catch (NumberFormatException exception) {
      throw new RedisProtocolException("Resposta Redis inválida.");
    }
  }

  private static List<String> tokens(String command) throws RedisProtocolException {
    List<String> values = new ArrayList<>();
    StringBuilder current = new StringBuilder();
    char quote = 0;
    boolean started = false;
    for (int index = 0; index < command.length(); index++) {
      char character = command.charAt(index);
      if (quote == 0 && Character.isWhitespace(character)) {
        if (started) {
          values.add(current.toString());
          current.setLength(0);
          started = false;
        }
        continue;
      }
      if (quote == 0 && (character == '\'' || character == '"')) {
        quote = character;
        started = true;
        continue;
      }
      if (quote != 0 && character == quote) {
        quote = 0;
        continue;
      }
      if (quote == '"' && character == '\\' && index + 1 < command.length()) {
        char escaped = command.charAt(++index);
        current.append(escaped == 'n' ? '\n' : escaped);
        started = true;
        continue;
      }
      current.append(character);
      started = true;
    }
    if (quote != 0) {
      throw new RedisProtocolException("Aspas sem fechamento no comando Redis.");
    }
    if (started) {
      values.add(current.toString());
    }
    return List.copyOf(values);
  }

  private static SgbdClientException failure(Exception exception, boolean query) {
    if (exception instanceof SocketTimeoutException) {
      return new SgbdClientException(
          query
              ? "O comando Redis excedeu o tempo permitido."
              : "A conexão Redis excedeu o tempo permitido.",
          exception);
    }
    if (exception instanceof UnknownHostException) {
      return new SgbdClientException("O host Redis não foi encontrado.", exception);
    }
    String detail =
        exception.getMessage() == null ? "" : exception.getMessage().toUpperCase(Locale.ROOT);
    if (detail.startsWith("NOAUTH") || detail.startsWith("WRONGPASS")) {
      return new SgbdClientException(
          "O servidor Redis recusou as credenciais informadas.", exception);
    }
    if (detail.startsWith("NOPERM")) {
      return new SgbdClientException(
          "A credencial Redis não tem permissão para essa operação.", exception);
    }
    return new SgbdClientException(
        query
            ? "O servidor Redis não pôde executar o comando."
            : "Não foi possível conectar ao Redis. Confira host, porta, TLS e credenciais.",
        exception);
  }

  private record RedisSession(Socket socket, OutputStream output, InputStream input)
      implements AutoCloseable {

    @Override
    public void close() throws IOException {
      socket.close();
    }
  }

  private sealed interface RedisValue permits RedisStatus, RedisInteger, RedisBulk, RedisArray {}

  private record RedisStatus(String value) implements RedisValue {}

  private record RedisInteger(long value) implements RedisValue {}

  private record RedisBulk(String value) implements RedisValue {}

  private record RedisArray(List<RedisValue> values) implements RedisValue {}

  private static final class RedisProtocolException extends Exception {

    private RedisProtocolException(String message) {
      super(message);
    }
  }
}
