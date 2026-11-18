package com.katomus.godard.todo;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class TodoItemRepository {

  private final JdbcClient jdbcClient;

  public TodoItemRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public List<TodoItem> findAll() {
    return jdbcClient
        .sql(
            """
                SELECT id, title, completed_at, created_at
                FROM todo_item
                ORDER BY completed_at IS NOT NULL, COALESCE(completed_at, created_at) DESC, id DESC
                """)
        .query((resultSet, row) -> map(resultSet))
        .list();
  }

  public Optional<TodoItem> find(long id) {
    return jdbcClient
        .sql(
            """
                SELECT id, title, completed_at, created_at
                FROM todo_item WHERE id = :id
                """)
        .param("id", id)
        .query((resultSet, row) -> map(resultSet))
        .optional();
  }

  public TodoItem create(String title) {
    Instant now = Instant.now();
    return jdbcClient
        .sql(
            """
                INSERT INTO todo_item (title, completed_at, created_at, updated_at)
                VALUES (:title, NULL, :createdAt, :updatedAt)
                RETURNING id, title, completed_at, created_at
                """)
        .param("title", title)
        .param("createdAt", now.toString())
        .param("updatedAt", now.toString())
        .query((resultSet, row) -> map(resultSet))
        .single();
  }

  public TodoItem update(TodoItem item, String title, boolean completed) {
    Instant now = Instant.now();
    jdbcClient
        .sql(
            """
                UPDATE todo_item
                SET title = :title,
                    completed_at = CASE WHEN :completed THEN COALESCE(completed_at, :completedAt) ELSE NULL END,
                    updated_at = :updatedAt
                WHERE id = :id
                """)
        .param("id", item.id())
        .param("title", title)
        .param("completed", completed)
        .param("completedAt", now.toString())
        .param("updatedAt", now.toString())
        .update();
    return find(item.id()).orElseThrow();
  }

  public void delete(long id) {
    jdbcClient.sql("DELETE FROM todo_item WHERE id = :id").param("id", id).update();
  }

  private static TodoItem map(java.sql.ResultSet resultSet) throws java.sql.SQLException {
    String completedAt = resultSet.getString("completed_at");
    return new TodoItem(
        resultSet.getLong("id"),
        resultSet.getString("title"),
        completedAt != null,
        resultSet.getString("created_at"),
        completedAt);
  }
}
