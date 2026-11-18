package com.katomus.godard.sgbd;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
class SgbdConsoleRepository {

  private static final String COLUMNS =
      "id, connection_id, label, database_name, query_text, editor_percent, active, "
          + "output_log, saved_result, results_minimized";

  private final JdbcClient jdbcClient;

  SgbdConsoleRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  List<SgbdConsoleView> findViewsByConnection(long connectionId) {
    return jdbcClient
        .sql(
            "SELECT "
                + COLUMNS
                + " FROM sgbd_console WHERE connection_id = :connection ORDER BY id")
        .param("connection", connectionId)
        .query((resultSet, row) -> view(map(resultSet)))
        .list();
  }

  Optional<SgbdConsole> find(long id) {
    return jdbcClient
        .sql("SELECT " + COLUMNS + " FROM sgbd_console WHERE id = :id")
        .param("id", id)
        .query((resultSet, row) -> map(resultSet))
        .optional();
  }

  long nextConsoleNumber(long connectionId) {
    return jdbcClient
            .sql("SELECT COUNT(*) FROM sgbd_console WHERE connection_id = :connection")
            .param("connection", connectionId)
            .query(Long.class)
            .single()
        + 1;
  }

  long create(long connectionId, ConsoleValues values) {
    String now = Instant.now().toString();
    GeneratedKeyHolder keys = new GeneratedKeyHolder();
    jdbcClient
        .sql(
            """
                        INSERT INTO sgbd_console
                            (connection_id, label, database_name, query_text, editor_percent, active, output_log,
                             saved_result, results_minimized, created_at, updated_at)
                        VALUES
                            (:connection, :label, :database, :query, :editorPercent, 0, :outputLog,
                             :savedResult, :resultsMinimized, :createdAt, :updatedAt)
                        """)
        .param("connection", connectionId)
        .param("label", values.label())
        .param("database", values.database())
        .param("query", values.query())
        .param("editorPercent", values.editorPercent())
        .param("outputLog", values.outputLog())
        .param("savedResult", values.savedResult())
        .param("resultsMinimized", values.resultsMinimized())
        .param("createdAt", now)
        .param("updatedAt", now)
        .update(keys, "id");
    return keys.getKey().longValue();
  }

  void update(long id, ConsoleValues values) {
    jdbcClient
        .sql(
            """
                        UPDATE sgbd_console
                        SET label = :label, database_name = :database, query_text = :query,
                            editor_percent = :editorPercent, output_log = :outputLog,
                            saved_result = :savedResult, results_minimized = :resultsMinimized,
                            updated_at = :updatedAt
                        WHERE id = :id
                        """)
        .param("id", id)
        .param("label", values.label())
        .param("database", values.database())
        .param("query", values.query())
        .param("editorPercent", values.editorPercent())
        .param("outputLog", values.outputLog())
        .param("savedResult", values.savedResult())
        .param("resultsMinimized", values.resultsMinimized())
        .param("updatedAt", Instant.now().toString())
        .update();
  }

  void selectActive(long connectionId, Long consoleId) {
    jdbcClient
        .sql("UPDATE sgbd_console SET active = 0 WHERE connection_id = :connection")
        .param("connection", connectionId)
        .update();
    if (consoleId != null) {
      jdbcClient
          .sql("UPDATE sgbd_console SET active = 1 WHERE id = :id AND connection_id = :connection")
          .param("id", consoleId)
          .param("connection", connectionId)
          .update();
    }
  }

  void delete(long id) {
    jdbcClient.sql("DELETE FROM sgbd_console WHERE id = :id").param("id", id).update();
  }

  SgbdConsoleView view(SgbdConsole console) {
    return new SgbdConsoleView(
        console.id(),
        console.label(),
        console.database(),
        console.query(),
        console.editorPercent(),
        console.active(),
        console.outputLog(),
        console.savedResult(),
        console.resultsMinimized());
  }

  private static SgbdConsole map(java.sql.ResultSet resultSet) throws java.sql.SQLException {
    return new SgbdConsole(
        resultSet.getLong("id"),
        resultSet.getLong("connection_id"),
        resultSet.getString("label"),
        resultSet.getString("database_name"),
        resultSet.getString("query_text"),
        resultSet.getInt("editor_percent"),
        resultSet.getBoolean("active"),
        resultSet.getString("output_log"),
        resultSet.getString("saved_result"),
        resultSet.getBoolean("results_minimized"));
  }

  record SgbdConsole(
      long id,
      long connectionId,
      String label,
      String database,
      String query,
      int editorPercent,
      boolean active,
      String outputLog,
      String savedResult,
      boolean resultsMinimized) {

    @Override
    public String toString() {
      return "SgbdConsole[id="
          + id
          + ", connectionId="
          + connectionId
          + ", editorPercent="
          + editorPercent
          + ", active="
          + active
          + ", resultsMinimized="
          + resultsMinimized
          + "]";
    }
  }

  record ConsoleValues(
      String label,
      String database,
      String query,
      int editorPercent,
      String outputLog,
      String savedResult,
      boolean resultsMinimized) {

    @Override
    public String toString() {
      return "ConsoleValues[editorPercent="
          + editorPercent
          + ", resultsMinimized="
          + resultsMinimized
          + "]";
    }
  }
}
