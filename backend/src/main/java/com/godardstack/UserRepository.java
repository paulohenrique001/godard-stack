package com.godardstack;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {

    private final JdbcClient jdbcClient;

    public UserRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    Optional<String> findName() {
        return jdbcClient.sql("SELECT name FROM app_user").query(String.class).optional();
    }

    Optional<String> findAvatarSeed() {
        return jdbcClient.sql("SELECT avatar_seed FROM app_user WHERE avatar_seed IS NOT NULL")
                .query(String.class)
                .optional();
    }

    void saveAvatarSeed(String seed) {
        jdbcClient.sql("UPDATE app_user SET avatar_seed = :seed").param("seed", seed).update();
    }

    void saveName(String name) {
        jdbcClient.sql("MERGE INTO app_user (id, name) KEY (id) VALUES (1, :name)")
                .param("name", name)
                .update();
    }
}
