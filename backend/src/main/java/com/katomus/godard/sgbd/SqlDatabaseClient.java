package com.katomus.godard.sgbd;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.SQLInvalidAuthorizationSpecException;
import java.sql.SQLSyntaxErrorException;
import java.sql.SQLTimeoutException;
import java.sql.Statement;
import java.sql.Types;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
class SqlDatabaseClient implements SgbdClient {

  private static final int CONNECT_TIMEOUT_MS = 5_000;
  private static final int SOCKET_TIMEOUT_MS = 30_000;
  private static final int QUERY_TIMEOUT_SECONDS = 30;
  private static final int MAX_ROWS = 500;
  private static final int MAX_COLUMNS = 256;
  private static final int MAX_CELL_CHARS = 8_192;
  private static final int MAX_RESULT_CHARS = 512 * 1024;
  private static final int MAX_STRUCTURE_COLUMNS = 5_000;
  private static final int BINARY_PREVIEW_BYTES = 64;
  private static final Set<Integer> BINARY_TYPES =
      Set.of(Types.BINARY, Types.VARBINARY, Types.LONGVARBINARY, Types.BLOB);

  @Override
  public SgbdHealth test(ConnectionTarget target) throws SgbdClientException {
    try (Connection connection = open(target);
        Statement statement = connection.createStatement()) {
      String product = connection.getMetaData().getDatabaseProductName();
      String version = connection.getMetaData().getDatabaseProductVersion();
      long startedAt = System.nanoTime();
      statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
      statement.execute("SELECT 1");
      long elapsed = Math.max(1, Math.round((System.nanoTime() - startedAt) / 1_000_000.0));
      return new SgbdHealth(compact(product + " " + version, 120), elapsed);
    } catch (SQLException exception) {
      throw failure(exception, false);
    }
  }

  @Override
  public SgbdQueryResult execute(ConnectionTarget target, String command)
      throws SgbdClientException {
    long startedAt = System.nanoTime();
    try (Connection connection = open(target);
        Statement statement = connection.createStatement()) {
      statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
      statement.setMaxFieldSize(MAX_CELL_CHARS);
      boolean hasRows = statement.execute(command);
      long elapsed = Math.max(1, Math.round((System.nanoTime() - startedAt) / 1_000_000.0));
      if (!hasRows) {
        long affected = statement.getLargeUpdateCount();
        String message =
            affected < 0
                ? "Comando concluído."
                : affected + (affected == 1 ? " linha afetada." : " linhas afetadas.");
        return new SgbdQueryResult(
            message, List.of(), List.of(), affected < 0 ? null : affected, false, elapsed);
      }
      try (ResultSet resultSet = statement.getResultSet()) {
        return rows(resultSet, elapsed);
      }
    } catch (SQLException exception) {
      throw failure(exception, true);
    }
  }

  SgbdStructure structure(ConnectionTarget target) throws SgbdClientException {
    try (Connection connection = open(target);
        Statement statement = connection.createStatement()) {
      statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
      try (ResultSet resultSet =
          statement.executeQuery(
              """
                    SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
                    FROM information_schema.COLUMNS
                    ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
                    """)) {
        Map<String, Map<String, List<SgbdStructure.Column>>> schemas = new LinkedHashMap<>();
        int columns = 0;
        while (resultSet.next() && columns < MAX_STRUCTURE_COLUMNS) {
          String schema = compact(resultSet.getString(1), 128);
          String table = compact(resultSet.getString(2), 128);
          String column = compact(resultSet.getString(3), 128);
          String type = compact(resultSet.getString(4), 128);
          if (schema == null || table == null || column == null) {
            continue;
          }
          schemas
              .computeIfAbsent(schema, ignored -> new LinkedHashMap<>())
              .computeIfAbsent(table, ignored -> new ArrayList<>())
              .add(new SgbdStructure.Column(column, type == null ? "" : type));
          columns += 1;
        }
        return new SgbdStructure(
            schemas.entrySet().stream()
                .map(
                    schema ->
                        new SgbdStructure.Schema(
                            schema.getKey(),
                            schema.getValue().entrySet().stream()
                                .map(
                                    table ->
                                        new SgbdStructure.Table(table.getKey(), table.getValue()))
                                .toList()))
                .toList());
      }
    } catch (SQLException exception) {
      throw failure(exception, true);
    }
  }

  private SgbdQueryResult rows(ResultSet resultSet, long elapsed) throws SQLException {
    ResultSetMetaData metadata = resultSet.getMetaData();
    int columnCount = metadata.getColumnCount();
    if (columnCount > MAX_COLUMNS) {
      throw new SQLException("A consulta retornou colunas demais.");
    }
    List<String> columns = new ArrayList<>();
    for (int index = 1; index <= columnCount; index++) {
      String label = compact(metadata.getColumnLabel(index), 128);
      columns.add(label == null || label.isBlank() ? "Coluna " + index : label);
    }
    List<List<String>> rows = new ArrayList<>();
    int characters = 0;
    boolean truncated = false;
    while (resultSet.next()) {
      if (rows.size() >= MAX_ROWS || characters >= MAX_RESULT_CHARS) {
        truncated = true;
        break;
      }
      List<String> row = new ArrayList<>();
      for (int index = 1; index <= columnCount; index++) {
        String value = value(resultSet, metadata, index);
        if (value != null) {
          characters += value.length();
        }
        row.add(value);
      }
      rows.add(row);
    }
    String message = rows.size() + (rows.size() == 1 ? " linha retornada." : " linhas retornadas.");
    if (truncated) {
      message += " A visualização foi limitada para proteger o aplicativo.";
    }
    return new SgbdQueryResult(
        message, List.copyOf(columns), List.copyOf(rows), null, truncated, elapsed);
  }

  private Connection open(ConnectionTarget target) throws SQLException {
    Properties properties = new Properties();
    properties.setProperty("user", target.username());
    properties.setProperty("password", target.password());
    properties.setProperty("connectTimeout", String.valueOf(CONNECT_TIMEOUT_MS));
    properties.setProperty("socketTimeout", String.valueOf(SOCKET_TIMEOUT_MS));
    properties.setProperty("sslMode", target.ssl() ? "verify-full" : "disable");
    properties.setProperty("allowMultiQueries", "false");
    return DriverManager.getConnection(
        "jdbc:mariadb://"
            + hostForUrl(target.host())
            + ":"
            + target.port()
            + "/"
            + target.databaseName(),
        properties);
  }

  private static String hostForUrl(String host) {
    return host.indexOf(':') >= 0 && !host.startsWith("[") ? "[" + host + "]" : host;
  }

  private static String value(ResultSet resultSet, ResultSetMetaData metadata, int index)
      throws SQLException {
    if (BINARY_TYPES.contains(metadata.getColumnType(index))) {
      byte[] bytes = resultSet.getBytes(index);
      if (bytes == null) {
        return null;
      }
      int preview = Math.min(bytes.length, BINARY_PREVIEW_BYTES);
      String value = "0x" + HexFormat.of().withUpperCase().formatHex(bytes, 0, preview);
      return preview < bytes.length ? value + "…" : value;
    }
    return compact(resultSet.getString(index), MAX_CELL_CHARS);
  }

  private static String compact(String value, int limit) {
    if (value == null || value.length() <= limit) {
      return value;
    }
    return value.substring(0, limit) + "…";
  }

  private static SgbdClientException failure(SQLException exception, boolean query) {
    if (exception instanceof SQLTimeoutException) {
      return new SgbdClientException(
          query ? "A consulta excedeu o tempo permitido." : "A conexão excedeu o tempo permitido.",
          exception);
    }
    if (exception instanceof SQLInvalidAuthorizationSpecException
        || startsWith(exception.getSQLState(), "28")) {
      return new SgbdClientException("O servidor recusou as credenciais informadas.", exception);
    }
    if (query
        && (exception instanceof SQLSyntaxErrorException
            || startsWith(exception.getSQLState(), "42"))) {
      return new SgbdClientException(
          "O servidor recusou a consulta. Confira a sintaxe, o schema e as permissões.", exception);
    }
    return new SgbdClientException(
        query
            ? "O servidor não pôde executar a consulta."
            : "Não foi possível conectar. Confira host, porta, TLS e credenciais.",
        exception);
  }

  private static boolean startsWith(String value, String prefix) {
    return value != null && value.startsWith(prefix);
  }
}
