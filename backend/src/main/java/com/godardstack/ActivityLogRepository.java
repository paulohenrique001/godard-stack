package com.godardstack;

import java.time.Instant;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class ActivityLogRepository {

    private static final int MAX_EVENTS = 10_000;

    record ActivityLog(long id, String kind, String tone, String message, String createdAt) {
    }

    private final JdbcClient jdbcClient;

    public ActivityLogRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    List<ActivityLog> find(String query, int offset, int limit) {
        String where = query.isEmpty() ? "" : " WHERE LOWER(message) LIKE :query";
        var statement = jdbcClient.sql("""
                SELECT id, kind, tone, message, created_at
                FROM activity_log%s
                ORDER BY id DESC
                OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
                """.formatted(where));
        if (!query.isEmpty()) {
            statement.param("query", "%" + query.toLowerCase() + "%");
        }
        return statement.param("offset", offset).param("limit", limit).query(ActivityLog.class).list();
    }

    long count(String query) {
        String where = query.isEmpty() ? "" : " WHERE LOWER(message) LIKE :query";
        var statement = jdbcClient.sql("SELECT COUNT(*) FROM activity_log" + where);
        if (!query.isEmpty()) {
            statement.param("query", "%" + query.toLowerCase() + "%");
        }
        return statement.query(Long.class).single();
    }

    void create(String kind, String tone, String message) {
        jdbcClient.sql("""
                        INSERT INTO activity_log (kind, tone, message, created_at)
                        VALUES (:kind, :tone, :message, :createdAt)
                        """)
                .param("kind", kind)
                .param("tone", tone)
                .param("message", message)
                .param("createdAt", Instant.now().toString())
                .update();
        jdbcClient.sql("""
                        DELETE FROM activity_log
                        WHERE id IN (
                            SELECT id FROM activity_log
                            ORDER BY id DESC
                            OFFSET :retention ROWS
                        )
                        """)
                .param("retention", MAX_EVENTS)
                .update();
    }

    void clear() {
        jdbcClient.sql("DELETE FROM activity_log").update();
    }
}
