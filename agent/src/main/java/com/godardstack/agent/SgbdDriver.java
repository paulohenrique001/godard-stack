package com.godardstack.agent;

import java.io.IOException;
import java.sql.SQLException;
import java.util.List;

interface SgbdDriver {

    double NANOS_PER_MILLI = 1_000_000.0;
    long MIN_PING_MS = 1;
    int EXECUTE_TIMEOUT_MS = 60_000;
    int QUERY_TIMEOUT_SECONDS = 60;

    record Target(String kind, String host, int port, String username, String password, String database,
                  boolean ssl) {
    }

    record Page(int limit, long offset) {
    }

    String health(Target target) throws IOException, SQLException;

    String schemas(Target target) throws IOException, SQLException;

    String structure(Target target) throws IOException, SQLException;

    String execute(Target target, String schema, List<String> statements, Page page) throws IOException, SQLException;

    default String createSchema(Target target, String name) throws IOException, SQLException {
        throw new UnsupportedOperationException("Este banco não permite criar schemas.");
    }

    default String dropSchema(Target target, String name) throws IOException, SQLException {
        throw new UnsupportedOperationException("Este banco não permite excluir schemas.");
    }

    static String healthReport(String version, long startedAt) {
        long elapsed = Math.round((System.nanoTime() - startedAt) / NANOS_PER_MILLI);
        return version + "\n" + Math.max(elapsed, MIN_PING_MS);
    }
}
