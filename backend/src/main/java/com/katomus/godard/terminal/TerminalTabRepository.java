package com.katomus.godard.terminal;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class TerminalTabRepository {

  public record TerminalTab(long id, int number, boolean active, String name, String cwd) {}

  private final JdbcClient jdbcClient;

  public TerminalTabRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public List<TerminalTab> findAll() {
    return jdbcClient
        .sql("SELECT id, number, active, name, cwd FROM terminal_tab ORDER BY id")
        .query(
            (resultSet, row) ->
                new TerminalTab(
                    resultSet.getLong("id"),
                    resultSet.getInt("number"),
                    resultSet.getBoolean("active"),
                    resultSet.getString("name"),
                    resultSet.getString("cwd")))
        .list();
  }

  public Optional<TerminalTab> find(long id) {
    return jdbcClient
        .sql("SELECT id, number, active, name, cwd FROM terminal_tab WHERE id = :id")
        .param("id", id)
        .query(
            (resultSet, row) ->
                new TerminalTab(
                    resultSet.getLong("id"),
                    resultSet.getInt("number"),
                    resultSet.getBoolean("active"),
                    resultSet.getString("name"),
                    resultSet.getString("cwd")))
        .optional();
  }

  public List<TerminalTab> ensureOne() {
    List<TerminalTab> tabs = findAll();
    if (tabs.isEmpty()) {
      create(lowestFreeNumber(tabs));
      tabs = findAll();
    }
    return tabs;
  }

  public List<TerminalTab> createNext() {
    List<TerminalTab> tabs = findAll();
    create(lowestFreeNumber(tabs));
    return findAll();
  }

  public void delete(long id) {
    jdbcClient.sql("DELETE FROM terminal_tab WHERE id = :id").param("id", id).update();
  }

  public void rename(long id, String name) {
    jdbcClient
        .sql("UPDATE terminal_tab SET name = :name WHERE id = :id")
        .param("id", id)
        .param("name", name)
        .update();
  }

  public void activate(long id) {
    jdbcClient
        .sql("UPDATE terminal_tab SET active = CASE WHEN id = :id THEN 1 ELSE 0 END")
        .param("id", id)
        .update();
  }

  public void saveCwd(long id, String cwd) {
    jdbcClient
        .sql("UPDATE terminal_tab SET cwd = :cwd WHERE id = :id")
        .param("id", id)
        .param("cwd", cwd)
        .update();
  }

  private void create(int number) {
    jdbcClient.sql("UPDATE terminal_tab SET active = 0").update();
    jdbcClient
        .sql("INSERT INTO terminal_tab (number, active) VALUES (:number, 1)")
        .param("number", number)
        .update();
  }

  private static int lowestFreeNumber(List<TerminalTab> tabs) {
    Set<Integer> used = tabs.stream().map(TerminalTab::number).collect(Collectors.toSet());
    int number = 1;
    while (used.contains(number)) {
      number++;
    }
    return number;
  }
}
