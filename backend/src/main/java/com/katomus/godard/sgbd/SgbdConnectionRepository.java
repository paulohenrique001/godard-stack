package com.katomus.godard.sgbd;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
class SgbdConnectionRepository {

  private static final String COLUMNS =
      "id, name, kind, host, port, username, password, database_name, ssl_enabled, auto_ping, "
          + "show_all_schemas, show_system_schemas, selected_schemas, selected";

  private final JdbcClient jdbcClient;
  private final ConnectionSecretCipher cipher;

  SgbdConnectionRepository(JdbcClient jdbcClient, ConnectionSecretCipher cipher) {
    this.jdbcClient = jdbcClient;
    this.cipher = cipher;
  }

  List<SgbdConnection> findAll() {
    return jdbcClient
        .sql("SELECT " + COLUMNS + " FROM sgbd_connection ORDER BY LOWER(name), id")
        .query((resultSet, row) -> map(resultSet))
        .list();
  }

  List<SgbdConnectionView> findAllViews() {
    return jdbcClient
        .sql("SELECT " + COLUMNS + " FROM sgbd_connection ORDER BY LOWER(name), id")
        .query((resultSet, row) -> view(resultSet))
        .list();
  }

  Optional<SgbdConnection> find(long id) {
    return jdbcClient
        .sql("SELECT " + COLUMNS + " FROM sgbd_connection WHERE id = :id")
        .param("id", id)
        .query((resultSet, row) -> map(resultSet))
        .optional();
  }

  long create(ConnectionValues values) {
    String now = Instant.now().toString();
    jdbcClient.sql("UPDATE sgbd_connection SET selected = 0").update();
    GeneratedKeyHolder keys = new GeneratedKeyHolder();
    jdbcClient
        .sql(
            """
                        INSERT INTO sgbd_connection
                            (name, kind, host, port, username, password, database_name, ssl_enabled, auto_ping,
                             show_all_schemas, show_system_schemas, selected_schemas, selected, created_at, updated_at)
                        VALUES
                            (:name, :kind, :host, :port, :username, :password, :database, :ssl, :autoPing,
                             :showAllSchemas, :showSystemSchemas, :selectedSchemas, 1, :createdAt, :updatedAt)
                        """)
        .param("name", values.name())
        .param("kind", values.kind().value())
        .param("host", values.host())
        .param("port", values.port())
        .param("username", values.username())
        .param("password", cipher.encrypt(values.password()))
        .param("database", values.databaseName())
        .param("ssl", values.ssl())
        .param("autoPing", values.autoPing())
        .param("showAllSchemas", values.showAllSchemas())
        .param("showSystemSchemas", values.showSystemSchemas())
        .param("selectedSchemas", String.join("\n", values.selectedSchemas()))
        .param("createdAt", now)
        .param("updatedAt", now)
        .update(keys, "id");
    return keys.getKey().longValue();
  }

  void update(long id, ConnectionValues values) {
    jdbcClient
        .sql(
            """
                        UPDATE sgbd_connection
                        SET name = :name, kind = :kind, host = :host, port = :port, username = :username,
                            password = :password, database_name = :database, ssl_enabled = :ssl, auto_ping = :autoPing,
                            show_all_schemas = :showAllSchemas, show_system_schemas = :showSystemSchemas,
                            selected_schemas = :selectedSchemas,
                            updated_at = :updatedAt
                        WHERE id = :id
                        """)
        .param("id", id)
        .param("name", values.name())
        .param("kind", values.kind().value())
        .param("host", values.host())
        .param("port", values.port())
        .param("username", values.username())
        .param("password", cipher.encrypt(values.password()))
        .param("database", values.databaseName())
        .param("ssl", values.ssl())
        .param("autoPing", values.autoPing())
        .param("showAllSchemas", values.showAllSchemas())
        .param("showSystemSchemas", values.showSystemSchemas())
        .param("selectedSchemas", String.join("\n", values.selectedSchemas()))
        .param("updatedAt", Instant.now().toString())
        .update();
  }

  void select(long id) {
    jdbcClient.sql("UPDATE sgbd_connection SET selected = 0").update();
    jdbcClient
        .sql("UPDATE sgbd_connection SET selected = 1 WHERE id = :id")
        .param("id", id)
        .update();
  }

  void delete(long id) {
    jdbcClient.sql("DELETE FROM sgbd_connection WHERE id = :id").param("id", id).update();
  }

  private SgbdConnection map(java.sql.ResultSet resultSet) throws java.sql.SQLException {
    return new SgbdConnection(
        resultSet.getLong("id"),
        resultSet.getString("name"),
        DatabaseKind.from(resultSet.getString("kind")).orElseThrow(),
        resultSet.getString("host"),
        resultSet.getInt("port"),
        resultSet.getString("username"),
        cipher.decrypt(resultSet.getString("password")),
        resultSet.getString("database_name"),
        resultSet.getBoolean("ssl_enabled"),
        resultSet.getBoolean("auto_ping"),
        resultSet.getBoolean("show_all_schemas"),
        resultSet.getBoolean("show_system_schemas"),
        resultSet.getString("selected_schemas"),
        resultSet.getBoolean("selected"));
  }

  private SgbdConnectionView view(java.sql.ResultSet resultSet) throws java.sql.SQLException {
    DatabaseKind kind = DatabaseKind.from(resultSet.getString("kind")).orElseThrow();
    return new SgbdConnectionView(
        resultSet.getLong("id"),
        resultSet.getString("name"),
        kind.value(),
        kind.label(),
        resultSet.getString("host"),
        resultSet.getInt("port"),
        resultSet.getString("username"),
        !resultSet.getString("password").isEmpty(),
        resultSet.getString("database_name"),
        resultSet.getBoolean("ssl_enabled"),
        resultSet.getBoolean("auto_ping"),
        resultSet.getBoolean("show_all_schemas"),
        resultSet.getBoolean("show_system_schemas"),
        selectedSchemas(resultSet.getString("selected_schemas")),
        resultSet.getBoolean("selected"));
  }

  record ConnectionValues(
      String name,
      DatabaseKind kind,
      String host,
      int port,
      String username,
      String password,
      String databaseName,
      boolean ssl,
      boolean autoPing,
      boolean showAllSchemas,
      boolean showSystemSchemas,
      List<String> selectedSchemas) {

    @Override
    public String toString() {
      return "ConnectionValues[kind=" + kind + ", password=<redacted>]";
    }
  }

  private static List<String> selectedSchemas(String stored) {
    return stored == null || stored.isBlank() ? List.of() : stored.lines().toList();
  }
}
