package com.katomus.godard.todo;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class TodoProjectRepository {

  private final JdbcClient jdbcClient;

  public TodoProjectRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public List<TodoProject> findAll() {
    return jdbcClient
        .sql(
            """
                SELECT id, icon, name, description, sort_order, created_at
                FROM todo_project
                ORDER BY sort_order, id
                """)
        .query((rs, row) -> map(rs))
        .list();
  }

  public Optional<TodoProject> find(long id) {
    return jdbcClient
        .sql(
            """
                SELECT id, icon, name, description, sort_order, created_at
                FROM todo_project WHERE id = :id
                """)
        .param("id", id)
        .query((rs, row) -> map(rs))
        .optional();
  }

  public TodoProject create(String icon, String name, String description) {
    return jdbcClient
        .sql(
            """
                INSERT INTO todo_project (icon, name, description, sort_order, created_at)
                VALUES (:icon, :name, :description, 0, :createdAt)
                RETURNING id, icon, name, description, sort_order, created_at
                """)
        .param("icon", icon)
        .param("name", name)
        .param("description", description)
        .param("createdAt", Instant.now().toString())
        .query((rs, row) -> map(rs))
        .single();
  }

  public TodoProject update(TodoProject project, String icon, String name, String description) {
    jdbcClient
        .sql(
            """
                UPDATE todo_project
                SET icon = :icon, name = :name, description = :description
                WHERE id = :id
                """)
        .param("id", project.id())
        .param("icon", icon)
        .param("name", name)
        .param("description", description)
        .update();
    return find(project.id()).orElseThrow();
  }

  public void delete(long id) {
    jdbcClient.sql("DELETE FROM todo_project WHERE id = :id").param("id", id).update();
  }

  private static TodoProject map(java.sql.ResultSet rs) throws java.sql.SQLException {
    return new TodoProject(
        rs.getLong("id"),
        rs.getString("icon"),
        rs.getString("name"),
        rs.getString("description"),
        rs.getInt("sort_order"),
        rs.getString("created_at"));
  }
}
