package com.katomus.godard.todo;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class TodoPageRepository {

  private final JdbcClient jdbcClient;

  public TodoPageRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public List<TodoPage> findByProject(long projectId) {
    return jdbcClient
        .sql(
            """
                SELECT p.id, p.project_id, p.icon, p.title, p.content,
                       p.sort_order, p.due_date, p.created_at, p.updated_at,
                       COALESCE(GROUP_CONCAT(pl.label_id), '') AS label_ids_csv
                FROM todo_page p
                LEFT JOIN todo_page_label pl ON pl.page_id = p.id
                WHERE p.project_id = :projectId
                GROUP BY p.id
                ORDER BY p.sort_order, p.id
                """)
        .param("projectId", projectId)
        .query((rs, row) -> map(rs))
        .list();
  }

  public Optional<TodoPage> find(long id) {
    return jdbcClient
        .sql(
            """
                SELECT p.id, p.project_id, p.icon, p.title, p.content,
                       p.sort_order, p.due_date, p.created_at, p.updated_at,
                       COALESCE(GROUP_CONCAT(pl.label_id), '') AS label_ids_csv
                FROM todo_page p
                LEFT JOIN todo_page_label pl ON pl.page_id = p.id
                WHERE p.id = :id
                GROUP BY p.id
                """)
        .param("id", id)
        .query((rs, row) -> map(rs))
        .optional();
  }

  public TodoPage create(
      long projectId, String icon, String title, String content, String dueDate) {
    int nextOrder =
        jdbcClient
            .sql("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM todo_page WHERE project_id = :pid")
            .param("pid", projectId)
            .query(Integer.class)
            .single();
    Instant now = Instant.now();
    long id =
        jdbcClient
            .sql(
                """
                INSERT INTO todo_page(project_id, icon, title, content, sort_order, due_date, created_at, updated_at)
                VALUES(:projectId, :icon, :title, :content, :sortOrder, :dueDate, :now, :now)
                RETURNING id
                """)
            .param("projectId", projectId)
            .param("icon", icon)
            .param("title", title)
            .param("content", content)
            .param("sortOrder", nextOrder)
            .param("dueDate", dueDate)
            .param("now", now.toString())
            .query(Long.class)
            .single();
    return find(id).orElseThrow();
  }

  public TodoPage update(TodoPage page, String icon, String title, String content, String dueDate) {
    jdbcClient
        .sql(
            """
                UPDATE todo_page
                SET icon = :icon, title = :title, content = :content,
                    due_date = :dueDate, updated_at = :updatedAt
                WHERE id = :id
                """)
        .param("id", page.id())
        .param("icon", icon)
        .param("title", title)
        .param("content", content)
        .param("dueDate", dueDate)
        .param("updatedAt", Instant.now().toString())
        .update();
    return find(page.id()).orElseThrow();
  }

  public void setLabels(long pageId, List<Long> labelIds) {
    jdbcClient
        .sql("DELETE FROM todo_page_label WHERE page_id = :pid")
        .param("pid", pageId)
        .update();
    for (long labelId : labelIds) {
      jdbcClient
          .sql("INSERT OR IGNORE INTO todo_page_label(page_id, label_id) VALUES(:pid, :lid)")
          .param("pid", pageId)
          .param("lid", labelId)
          .update();
    }
  }

  public void reorder(List<Long> pageIds) {
    for (int i = 0; i < pageIds.size(); i++) {
      jdbcClient
          .sql("UPDATE todo_page SET sort_order = :order WHERE id = :id")
          .param("order", i)
          .param("id", pageIds.get(i))
          .update();
    }
  }

  public void delete(long id) {
    jdbcClient.sql("DELETE FROM todo_page WHERE id = :id").param("id", id).update();
  }

  private static TodoPage map(java.sql.ResultSet rs) throws java.sql.SQLException {
    return new TodoPage(
        rs.getLong("id"),
        rs.getLong("project_id"),
        rs.getString("icon"),
        rs.getString("title"),
        rs.getString("content"),
        parseLabelIds(rs.getString("label_ids_csv")),
        rs.getInt("sort_order"),
        rs.getString("due_date"),
        rs.getString("created_at"),
        rs.getString("updated_at"));
  }

  private static List<Long> parseLabelIds(String csv) {
    if (csv == null || csv.isBlank()) return List.of();
    return Arrays.stream(csv.split(","))
        .map(String::trim)
        .filter(s -> !s.isBlank())
        .map(Long::parseLong)
        .collect(Collectors.toList());
  }
}
