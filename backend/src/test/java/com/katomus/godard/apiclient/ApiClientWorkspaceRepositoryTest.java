package com.katomus.godard.apiclient;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.katomus.godard.config.GodardProperties;
import com.katomus.godard.security.LocalKeyService;
import com.katomus.godard.security.LocalValueCipher;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.sql.DriverManager;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.SimpleDriverDataSource;
import tools.jackson.databind.ObjectMapper;

class ApiClientWorkspaceRepositoryTest {

  @Test
  void persistsEncryptedRequestsAndKeepsThemWhenFoldersAreDeleted(@TempDir Path directory)
      throws Exception {
    String url = "jdbc:sqlite:" + directory.resolve("godard-stack.db") + "?foreign_keys=on";
    Flyway.configure().dataSource(url, "", "").locations("classpath:db/migration").load().migrate();
    SimpleDriverDataSource dataSource = new SimpleDriverDataSource();
    dataSource.setDriverClass(org.sqlite.JDBC.class);
    dataSource.setUrl(url);
    ApiClientWorkspaceRepository repository =
        new ApiClientWorkspaceRepository(
            JdbcClient.create(dataSource), new ObjectMapper(), cipher(directory));

    ApiClientCollection collection = repository.createCollection("Godard API", "Workspace local");
    ApiClientFolder folder = repository.createFolder(collection.id(), null, "Users");
    ApiClientSavedRequest created =
        repository.createRequest(
            new ApiClientRequestDraft(
                collection.id(),
                folder.id(),
                "Create user",
                new ApiClientRequest(
                    "POST",
                    "https://example.test/users?token=private",
                    List.of(new ApiClientHeader("X-API-Key", "private-key")),
                    "{\"email\":\"private@example.test\"}",
                    new ApiClientAuthentication("bearer", "private-token", "", ""))));

    ApiClientSavedRequest restored = repository.request(created.id()).orElseThrow();

    assertEquals("private-token", restored.request().authentication().token());
    assertEquals(folder.id(), restored.folderId());
    try (var connection = DriverManager.getConnection(url);
        var statement =
            connection.prepareStatement(
                "SELECT payload_encrypted FROM api_client_request WHERE id = ?")) {
      statement.setLong(1, created.id());
      try (var resultSet = statement.executeQuery()) {
        resultSet.next();
        String stored = resultSet.getString(1);
        assertFalse(stored.contains("private-token"));
        assertFalse(stored.contains("private@example.test"));
      }
    }

    repository.saveViewState(new ApiClientWorkspaceState(List.of(created.id()), created.id()));
    assertEquals(List.of(created.id()), repository.viewState().openRequestIds());

    repository.deleteFolder(folder.id());

    assertNull(repository.request(created.id()).orElseThrow().folderId());
    assertTrue(repository.requests().stream().anyMatch(request -> request.id() == created.id()));
  }

  private static LocalValueCipher cipher(Path directory) throws Exception {
    Path secrets = Files.createDirectories(directory.resolve("secrets"));
    byte[] key = new byte[32];
    new SecureRandom().nextBytes(key);
    Files.write(secrets.resolve("connection.key"), key);
    LocalKeyService keyService =
        new LocalKeyService(new GodardProperties(directory.toString(), "test-session", "ready"));
    return new LocalValueCipher(keyService);
  }
}
