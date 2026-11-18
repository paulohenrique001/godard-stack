package com.godardstack;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class DashboardResourceRepository {

    private static final long RETENTION_DAYS = 7;

    record ResourceSample(String capturedAt, int memory, Integer disk) {
    }

    private final JdbcClient jdbcClient;

    DashboardResourceRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    void save(int memory, Integer disk) {
        String capturedAt = Instant.now().toString();
        jdbcClient.sql("""
                        INSERT INTO dashboard_resource_sample (captured_at, memory_percent, disk_percent)
                        VALUES (:capturedAt, :memory, :disk)
                        """)
                .param("capturedAt", capturedAt)
                .param("memory", memory)
                .param("disk", disk)
                .update();
        jdbcClient.sql("DELETE FROM dashboard_resource_sample WHERE captured_at < :cutoff")
                .param("cutoff", Instant.now().minus(RETENTION_DAYS, ChronoUnit.DAYS).toString())
                .update();
    }

    List<ResourceSample> findSince(Instant since) {
        return jdbcClient.sql("""
                        SELECT captured_at AS capturedAt, memory_percent AS memory, disk_percent AS disk
                        FROM dashboard_resource_sample
                        WHERE captured_at >= :since
                        ORDER BY captured_at
                        """)
                .param("since", since.toString())
                .query(ResourceSample.class)
                .list();
    }
}
