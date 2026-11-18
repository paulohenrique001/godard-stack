package com.godardstack;

import java.time.Instant;
import java.time.LocalDate;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/api/dashboard/institutional-banner", produces = MediaType.APPLICATION_JSON_VALUE)
public class DashboardInstitutionalBannerController {

    private final JdbcClient jdbcClient;

    public DashboardInstitutionalBannerController(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    @GetMapping
    public ResponseEntity<String> banner() {
        String today = LocalDate.now().toString();
        boolean dismissedToday = jdbcClient.sql("SELECT dismissed_on FROM dashboard_institutional_banner WHERE id = 1")
                .query(String.class)
                .optional()
                .map(today::equals)
                .orElse(false);
        return ResponseEntity.ok("{\"visible\":" + !dismissedToday + "}");
    }

    @PostMapping("/dismiss")
    public ResponseEntity<Void> dismiss() {
        jdbcClient.sql("""
                        MERGE INTO dashboard_institutional_banner (id, dismissed_on, updated_at)
                        KEY (id) VALUES (1, :dismissedOn, :updatedAt)
                        """)
                .param("dismissedOn", LocalDate.now().toString())
                .param("updatedAt", Instant.now().toString())
                .update();
        return ResponseEntity.noContent().build();
    }
}
