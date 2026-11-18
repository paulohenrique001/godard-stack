package com.godardstack;

import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class SavedCommandRepository {

    record SavedCommand(long id, String command) {
    }

    private static final String SEED_NAME = "saved-commands";
    private static final List<String> DEFAULT_COMMANDS = List.of("ls -la", "df -h", "top");

    private final JdbcClient jdbcClient;

    public SavedCommandRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    List<SavedCommand> findAll() {
        return jdbcClient.sql("SELECT id, command FROM saved_command ORDER BY id")
                .query(SavedCommand.class)
                .list();
    }

    Optional<SavedCommand> find(long id) {
        return jdbcClient.sql("SELECT id, command FROM saved_command WHERE id = :id")
                .param("id", id)
                .query(SavedCommand.class)
                .optional();
    }

    void seedDefaults() {
        boolean seeded = jdbcClient.sql("SELECT COUNT(*) FROM app_seed WHERE name = :name")
                .param("name", SEED_NAME)
                .query(Long.class)
                .single() > 0;
        if (seeded) {
            return;
        }
        DEFAULT_COMMANDS.forEach(this::create);
        jdbcClient.sql("INSERT INTO app_seed (name) VALUES (:name)").param("name", SEED_NAME).update();
    }

    void create(String command) {
        jdbcClient.sql("INSERT INTO saved_command (command) VALUES (:command)").param("command", command).update();
    }

    void update(long id, String command) {
        jdbcClient.sql("UPDATE saved_command SET command = :command WHERE id = :id")
                .param("command", command)
                .param("id", id)
                .update();
    }

    void delete(long id) {
        jdbcClient.sql("DELETE FROM saved_command WHERE id = :id").param("id", id).update();
    }
}
