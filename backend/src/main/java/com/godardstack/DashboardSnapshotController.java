package com.godardstack;

import java.time.Instant;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/api/dashboard/snapshot", produces = MediaType.TEXT_PLAIN_VALUE)
public class DashboardSnapshotController {

    private static final int MAX_CONTENT_LENGTH = 2 * 1024 * 1024;

    private final JdbcClient jdbcClient;

    public DashboardSnapshotController(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    @GetMapping
    public ResponseEntity<String> snapshot() {
        return jdbcClient.sql("SELECT content FROM dashboard_snapshot WHERE id = 1")
                .query(String.class)
                .optional()
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping(consumes = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<Void> save(@RequestBody String content) {
        if (content.isBlank() || content.length() > MAX_CONTENT_LENGTH) {
            return ResponseEntity.badRequest().build();
        }
        jdbcClient.sql("""
                        MERGE INTO dashboard_snapshot (id, content, synced_at)
                        KEY (id) VALUES (1, :content, :syncedAt)
                        """)
                .param("content", content)
                .param("syncedAt", Instant.now().toString())
                .update();
        return ResponseEntity.noContent().build();
    }
}
