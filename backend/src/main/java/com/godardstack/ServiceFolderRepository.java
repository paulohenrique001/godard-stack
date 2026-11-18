package com.godardstack;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class ServiceFolderRepository {

    private final JdbcClient jdbcClient;

    public ServiceFolderRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    Optional<String> find() {
        return jdbcClient.sql("SELECT path FROM service_folder").query(String.class).optional();
    }

    void save(String path) {
        jdbcClient.sql("MERGE INTO service_folder (id, path) KEY (id) VALUES (1, :path)")
                .param("path", path)
                .update();
    }
}
