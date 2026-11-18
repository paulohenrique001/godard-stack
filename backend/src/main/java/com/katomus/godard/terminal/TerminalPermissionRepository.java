package com.katomus.godard.terminal;

import java.time.Instant;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class TerminalPermissionRepository {

  private final JdbcClient jdbcClient;

  public TerminalPermissionRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public boolean accepted() {
    return jdbcClient
        .sql("SELECT accepted_at FROM terminal_permission WHERE id = 1")
        .query(String.class)
        .optional()
        .isPresent();
  }

  public void accept() {
    jdbcClient
        .sql(
            """
                        INSERT INTO terminal_permission (id, accepted_at)
                        VALUES (1, :acceptedAt)
                        ON CONFLICT(id) DO UPDATE SET accepted_at = excluded.accepted_at
                        """)
        .param("acceptedAt", Instant.now().toString())
        .update();
  }
}
