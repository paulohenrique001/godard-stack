package com.katomus.godard.docker;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class DockerViewStateRepository {

  private final JdbcClient jdbcClient;

  DockerViewStateRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  DockerViewState find() {
    return jdbcClient
        .sql(
            """
                        SELECT container_name, active_tab, show_stopped
                        FROM docker_view_state WHERE id = 1
                        """)
        .query(
            (resultSet, row) ->
                new DockerViewState(
                    resultSet.getString("container_name"),
                    resultSet.getString("active_tab"),
                    resultSet.getBoolean("show_stopped")))
        .optional()
        .orElse(new DockerViewState(null, "logs", true));
  }

  void save(DockerViewState state) {
    jdbcClient
        .sql(
            """
                        INSERT INTO docker_view_state (id, container_name, active_tab, show_stopped)
                        VALUES (1, :containerName, :tab, :showStopped)
                        ON CONFLICT(id) DO UPDATE SET
                            container_name = excluded.container_name,
                            active_tab = excluded.active_tab,
                            show_stopped = excluded.show_stopped
                        """)
        .param("containerName", state.containerName())
        .param("tab", state.tab())
        .param("showStopped", state.showStopped())
        .update();
  }
}
