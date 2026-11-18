package com.katomus.godard.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DatabaseMigrationTest {

  @Test
  void initializesSchemaWithDefaultPreferences(@TempDir Path directory) throws Exception {
    String url = "jdbc:sqlite:" + directory.resolve("godard-stack.db");
    Flyway.configure().dataSource(url, "", "").locations("classpath:db/migration").load().migrate();

    try (Connection connection = DriverManager.getConnection(url);
        var statement =
            connection.prepareStatement(
                """
                     SELECT theme, last_page, refresh_seconds, notifications_read_id, motion, local_diagnostics_enabled
                     FROM app_preference WHERE id = 1
                     """);
        var result = statement.executeQuery()) {
      result.next();
      assertEquals("system", result.getString("theme"));
      assertEquals("dashboard", result.getString("last_page"));
      assertEquals(30, result.getInt("refresh_seconds"));
      assertEquals(0, result.getLong("notifications_read_id"));
      assertEquals("system", result.getString("motion"));
      assertEquals(false, result.getBoolean("local_diagnostics_enabled"));
    }
  }
}
