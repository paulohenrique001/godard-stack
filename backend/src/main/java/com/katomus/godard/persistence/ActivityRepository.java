package com.katomus.godard.persistence;

import com.katomus.godard.dashboard.Activity;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class ActivityRepository {

  private final JdbcClient jdbcClient;

  public ActivityRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public List<Activity> latest(int limit) {
    return jdbcClient
        .sql(
            """
                        SELECT id, kind, tone, message, created_at
                        FROM activity_log ORDER BY id DESC LIMIT :limit
                        """)
        .param("limit", limit)
        .query(
            (resultSet, row) ->
                new Activity(
                    resultSet.getLong("id"),
                    resultSet.getString("kind"),
                    resultSet.getString("tone"),
                    resultSet.getString("message"),
                    resultSet.getString("created_at")))
        .list();
  }

  public void create(String kind, String tone, String message) {
    jdbcClient
        .sql(
            """
                        INSERT INTO activity_log (kind, tone, message, created_at)
                        VALUES (:kind, :tone, :message, :createdAt)
                        """)
        .param("kind", kind)
        .param("tone", tone)
        .param("message", message)
        .param("createdAt", Instant.now().toString())
        .update();
  }

  public void clear() {
    jdbcClient.sql("DELETE FROM activity_log").update();
  }
}
