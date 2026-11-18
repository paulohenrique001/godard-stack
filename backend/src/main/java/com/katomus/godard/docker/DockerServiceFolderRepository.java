package com.katomus.godard.docker;

import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class DockerServiceFolderRepository {

  private final JdbcClient jdbcClient;

  DockerServiceFolderRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  Optional<String> find() {
    return jdbcClient
        .sql("SELECT path FROM service_folder WHERE id = 1")
        .query(String.class)
        .optional();
  }

  void save(String path) {
    jdbcClient
        .sql(
            """
                        INSERT INTO service_folder (id, path)
                        VALUES (1, :path)
                        ON CONFLICT(id) DO UPDATE SET path = excluded.path
                        """)
        .param("path", path)
        .update();
  }
}
