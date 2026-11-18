package com.katomus.godard.todo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.SimpleDriverDataSource;

class TodoItemRepositoryTest {

  @Test
  void persistsTasksAndTheirCompletionState(@TempDir Path directory) {
    String url = "jdbc:sqlite:" + directory.resolve("godard-stack.db");
    Flyway.configure().dataSource(url, "", "").locations("classpath:db/migration").load().migrate();
    SimpleDriverDataSource dataSource = new SimpleDriverDataSource();
    dataSource.setDriverClass(org.sqlite.JDBC.class);
    dataSource.setUrl(url);
    TodoItemRepository repository = new TodoItemRepository(JdbcClient.create(dataSource));

    TodoItem created = repository.create("Preparar a primeira tarefa");
    TodoItem completed = repository.update(created, created.title(), true);
    TodoItem reopened = repository.update(completed, "Preparar a tarefa revisada", false);

    assertEquals("Preparar a tarefa revisada", reopened.title());
    assertEquals(false, reopened.completed());
    assertNull(reopened.completedAt());
    assertEquals(1, repository.findAll().size());

    repository.delete(reopened.id());

    assertTrue(repository.findAll().isEmpty());
  }
}
