package com.godardstack;

import java.util.Set;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/api/docker/state", produces = MediaType.TEXT_PLAIN_VALUE)
public class DockerViewStateController {

    private static final int MAX_CONTAINER_NAME_LENGTH = 255;
    private static final Set<String> TABS = Set.of("logs", "compose", "env", "shell", "output");

    private record DockerViewState(String containerName, String activeTab, boolean showStopped) {
    }

    private final JdbcClient jdbcClient;

    public DockerViewStateController(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    @GetMapping
    public ResponseEntity<String> state() {
        return jdbcClient.sql("SELECT container_name, active_tab, show_stopped FROM docker_view_state WHERE id = 1")
                .query(DockerViewState.class)
                .optional()
                .map(state -> ResponseEntity.ok((state.containerName() == null ? "" : state.containerName())
                        + "\n" + state.activeTab()
                        + "\n" + state.showStopped()))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping(consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<Void> save(@RequestParam(name = "container", defaultValue = "") String container,
                                     @RequestParam(name = "tab", defaultValue = "logs") String tab,
                                     @RequestParam(name = "showStopped", defaultValue = "true") boolean showStopped) {
        String name = container.strip();
        if (!TABS.contains(tab) || name.length() > MAX_CONTAINER_NAME_LENGTH
                || name.codePoints().anyMatch(Character::isISOControl)) {
            return ResponseEntity.badRequest().build();
        }
        jdbcClient.sql("""
                        MERGE INTO docker_view_state (id, container_name, active_tab, show_stopped)
                        KEY (id) VALUES (1, :container, :tab, :showStopped)
                        """)
                .param("container", name.isEmpty() ? null : name)
                .param("tab", tab)
                .param("showStopped", showStopped)
                .update();
        return ResponseEntity.noContent().build();
    }
}
