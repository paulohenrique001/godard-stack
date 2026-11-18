package com.godardstack;

import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class TerminalTabRepository {

    record TerminalTab(long id, int number, boolean active, String name, String cwd) {
    }

    private final JdbcClient jdbcClient;

    public TerminalTabRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    List<TerminalTab> findAll() {
        return jdbcClient.sql("SELECT id, number, active, name, cwd FROM terminal_tab ORDER BY id")
                .query(TerminalTab.class)
                .list();
    }

    Optional<TerminalTab> find(long id) {
        return jdbcClient.sql("SELECT id, number, active, name, cwd FROM terminal_tab WHERE id = :id")
                .param("id", id)
                .query(TerminalTab.class)
                .optional();
    }

    void create(int number) {
        jdbcClient.sql("UPDATE terminal_tab SET active = FALSE").update();
        jdbcClient.sql("INSERT INTO terminal_tab (number, active) VALUES (:number, TRUE)")
                .param("number", number)
                .update();
    }

    void delete(long id) {
        jdbcClient.sql("DELETE FROM terminal_tab WHERE id = :id").param("id", id).update();
    }

    void rename(long id, String name) {
        jdbcClient.sql("UPDATE terminal_tab SET name = :name WHERE id = :id")
                .param("name", name)
                .param("id", id)
                .update();
    }

    Optional<String> findCwd(long id) {
        return jdbcClient.sql("SELECT cwd FROM terminal_tab WHERE id = :id AND cwd IS NOT NULL")
                .param("id", id)
                .query(String.class)
                .optional();
    }

    void saveCwd(long id, String cwd) {
        jdbcClient.sql("UPDATE terminal_tab SET cwd = :cwd WHERE id = :id")
                .param("cwd", cwd)
                .param("id", id)
                .update();
    }

    void activate(long id) {
        jdbcClient.sql("UPDATE terminal_tab SET active = (id = :id)").param("id", id).update();
    }
}
