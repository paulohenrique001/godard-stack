package com.katomus.godard.todo;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class TodoListRepository {

  private final JdbcClient jdbcClient;

  public TodoListRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public List<TodoList> findByProject(long projectId) {
    return jdbcClient
        .sql(
            """
                SELECT id, project_id, label_id, description, sort_order, created_at
                FROM todo_list
                WHERE project_id = :projectId
                ORDER BY sort_order, id
                """)
        .param("projectId", projectId)
        .query((rs, row) -> map(rs))
        .list();
  }

  public Optional<TodoList> find(long id) {
    return jdbcClient
        .sql(
            "SELECT id, project_id, label_id, description, sort_order, created_at FROM todo_list WHERE id = :id")
        .param("id", id)
        .query((rs, row) -> map(rs))
        .optional();
  }

  public TodoList create(long projectId, long labelId, String description) {
    int nextOrder =
        jdbcClient
            .sql("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM todo_list WHERE project_id = :pid")
            .param("pid", projectId)
            .query(Integer.class)
            .single();
    return jdbcClient
        .sql(
            """
                INSERT INTO todo_list(project_id, label_id, description, sort_order, created_at)
                VALUES(:pid, :labelId, :description, :order, :now)
                RETURNING id, project_id, label_id, description, sort_order, created_at
                """)
        .param("pid", projectId)
        .param("labelId", labelId)
        .param("description", description)
        .param("order", nextOrder)
        .param("now", Instant.now().toString())
        .query((rs, row) -> map(rs))
        .single();
  }

  public TodoList update(long id, long labelId, String description) {
    return jdbcClient
        .sql(
            """
                UPDATE todo_list SET label_id = :labelId, description = :description WHERE id = :id
                RETURNING id, project_id, label_id, description, sort_order, created_at
                """)
        .param("id", id)
        .param("labelId", labelId)
        .param("description", description)
        .query((rs, row) -> map(rs))
        .single();
  }

  public void delete(long id) {
    jdbcClient.sql("DELETE FROM todo_list WHERE id = :id").param("id", id).update();
  }

  public void reorder(long projectId, List<Long> ids) {
    for (int i = 0; i < ids.size(); i++) {
      jdbcClient
          .sql("UPDATE todo_list SET sort_order = :order WHERE id = :id AND project_id = :pid")
          .param("order", i)
          .param("id", ids.get(i))
          .param("pid", projectId)
          .update();
    }
  }

  private static TodoList map(java.sql.ResultSet rs) throws java.sql.SQLException {
    return new TodoList(
        rs.getLong("id"),
        rs.getLong("project_id"),
        rs.getLong("label_id"),
        rs.getString("description"),
        rs.getInt("sort_order"),
        rs.getString("created_at"));
  }
}
