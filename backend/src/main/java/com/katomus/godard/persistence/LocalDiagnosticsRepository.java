package com.katomus.godard.persistence;

import com.katomus.godard.diagnostics.LocalDiagnosticEvent;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class LocalDiagnosticsRepository {

  private final JdbcClient jdbcClient;

  public LocalDiagnosticsRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public List<LocalDiagnosticEvent> latest() {
    return jdbcClient
        .sql(
            """
                SELECT id, event_type, app_version, created_at
                FROM local_diagnostic_event
                ORDER BY created_at DESC
                LIMIT 100
                """)
        .query(
            (rs, row) ->
                new LocalDiagnosticEvent(
                    rs.getLong("id"),
                    rs.getString("event_type"),
                    rs.getString("app_version"),
                    rs.getString("created_at")))
        .list();
  }

  public void record(String eventType, String appVersion) {
    jdbcClient
        .sql(
            """
                INSERT INTO local_diagnostic_event(event_type, app_version, created_at)
                VALUES(:eventType, :appVersion, :now)
                """)
        .param("eventType", eventType)
        .param("appVersion", appVersion)
        .param("now", Instant.now().toString())
        .update();
  }

  public void clear() {
    jdbcClient.sql("DELETE FROM local_diagnostic_event").update();
  }
}
