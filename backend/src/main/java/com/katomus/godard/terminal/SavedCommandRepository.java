package com.katomus.godard.terminal;

import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class SavedCommandRepository {

  public record SavedCommand(long id, String command) {}

  private final JdbcClient jdbcClient;

  public SavedCommandRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public List<SavedCommand> findAll() {
    return jdbcClient
        .sql("SELECT id, command FROM saved_command ORDER BY id")
        .query(
            (resultSet, row) ->
                new SavedCommand(resultSet.getLong("id"), resultSet.getString("command")))
        .list();
  }

  public Optional<SavedCommand> find(long id) {
    return jdbcClient
        .sql("SELECT id, command FROM saved_command WHERE id = :id")
        .param("id", id)
        .query(
            (resultSet, row) ->
                new SavedCommand(resultSet.getLong("id"), resultSet.getString("command")))
        .optional();
  }

  public SavedCommand create(String command) {
    jdbcClient
        .sql("INSERT INTO saved_command (command) VALUES (:command)")
        .param("command", command)
        .update();
    return jdbcClient
        .sql("SELECT id, command FROM saved_command WHERE id = last_insert_rowid()")
        .query(
            (resultSet, row) ->
                new SavedCommand(resultSet.getLong("id"), resultSet.getString("command")))
        .single();
  }

  public void update(long id, String command) {
    jdbcClient
        .sql("UPDATE saved_command SET command = :command WHERE id = :id")
        .param("id", id)
        .param("command", command)
        .update();
  }

  public void delete(long id) {
    jdbcClient.sql("DELETE FROM saved_command WHERE id = :id").param("id", id).update();
  }
}
