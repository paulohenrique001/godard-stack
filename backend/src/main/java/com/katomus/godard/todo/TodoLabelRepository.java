package com.katomus.godard.todo;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class TodoLabelRepository {

  private final JdbcClient jdbcClient;

  public TodoLabelRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public List<TodoLabel> findByProject(long projectId) {
    return jdbcClient
        .sql(
            "SELECT id, project_id, name, color, sort_order, is_system, created_at"
                + " FROM todo_label WHERE project_id = :projectId ORDER BY sort_order, id")
        .param("projectId", projectId)
        .query((rs, row) -> map(rs))
        .list();
  }

  public Optional<TodoLabel> find(long id) {
    return jdbcClient
        .sql(
            "SELECT id, project_id, name, color, sort_order, is_system, created_at"
                + " FROM todo_label WHERE id = :id")
        .param("id", id)
        .query((rs, row) -> map(rs))
        .optional();
  }

  public TodoLabel create(long projectId, String name, String color) {
    return jdbcClient
        .sql(
            """
                INSERT INTO todo_label(project_id, name, color, sort_order, is_system, created_at)
                VALUES(:pid, :name, :color, 0, 0, :now)
                RETURNING id, project_id, name, color, sort_order, is_system, created_at
                """)
        .param("pid", projectId)
        .param("name", name)
        .param("color", color)
        .param("now", Instant.now().toString())
        .query((rs, row) -> map(rs))
        .single();
  }

  public TodoLabel createSystem(long projectId, String name, String color, int sortOrder) {
    return jdbcClient
        .sql(
            """
                INSERT INTO todo_label(project_id, name, color, sort_order, is_system, created_at)
                VALUES(:pid, :name, :color, :sortOrder, 1, :now)
                RETURNING id, project_id, name, color, sort_order, is_system, created_at
                """)
        .param("pid", projectId)
        .param("name", name)
        .param("color", color)
        .param("sortOrder", sortOrder)
        .param("now", Instant.now().toString())
        .query((rs, row) -> map(rs))
        .single();
  }

  public TodoLabel update(TodoLabel label, String name, String color) {
    jdbcClient
        .sql("UPDATE todo_label SET name = :name, color = :color WHERE id = :id")
        .param("name", name)
        .param("color", color)
        .param("id", label.id())
        .update();
    return find(label.id()).orElseThrow();
  }

  public void delete(long id) {
    jdbcClient.sql("DELETE FROM todo_label WHERE id = :id").param("id", id).update();
  }

  private static TodoLabel map(java.sql.ResultSet rs) throws java.sql.SQLException {
    return new TodoLabel(
        rs.getLong("id"),
        rs.getLong("project_id"),
        rs.getString("name"),
        rs.getString("color"),
        rs.getInt("sort_order"),
        rs.getBoolean("is_system"),
        rs.getString("created_at"));
  }
}
