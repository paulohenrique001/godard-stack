package com.godardstack.agent;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

final class SgbdConnections {

    private static final int FIELD_COUNT = 7;
    private static final int PAGE_FIELDS = 4;
    private static final String OK = "ok\n";
    private static final String FAILED = "failed\n";
    private static final int MAX_CONCURRENT_EXECUTIONS = 2;
    private static final int MAX_STATEMENTS = 100;
    private static final long MAX_PAGE_OFFSET = 1_000_000;
    private static final Map<String, SgbdDriver> DRIVERS = Map.of(
            "mariadb", new MariadbDriver(),
            "mysql", new MysqlDriver(),
            "redis", new RedisDriver());
    private static final Map<String, Execution> EXECUTIONS = new ConcurrentHashMap<>();
    private static final ThreadLocal<Execution> ACTIVE_EXECUTION = new ThreadLocal<>();
    private static final Semaphore EXECUTION_SLOTS = new Semaphore(MAX_CONCURRENT_EXECUTIONS);

    private static final class Execution {
        private final AtomicReference<Statement> statement = new AtomicReference<>();
        private final AtomicReference<AutoCloseable> cancellation = new AtomicReference<>();
        private final AtomicBoolean cancelled = new AtomicBoolean();
    }

    @FunctionalInterface
    private interface Operation {
        String run(SgbdDriver driver, SgbdDriver.Target target) throws IOException, SQLException;
    }

    private SgbdConnections() {
    }

    static String test(String body) {
        return run(body, SgbdDriver::health);
    }

    static String schemas(String body) {
        return run(body, SgbdDriver::schemas);
    }

    static String structure(String body) {
        return run(body, SgbdDriver::structure);
    }

    static String createSchema(String name, String body) {
        return run(body, (driver, target) -> driver.createSchema(target, name));
    }

    static String dropSchema(String name, String body) {
        return run(body, (driver, target) -> driver.dropSchema(target, name));
    }

    static String execute(String requestId, String body) {
        if (!EXECUTION_SLOTS.tryAcquire()) {
            return FAILED + "Há consultas demais em execução. Aguarde uma terminar.";
        }
        Execution execution = new Execution();
        try {
            if (EXECUTIONS.putIfAbsent(requestId, execution) != null) {
                return FAILED + "execução já existe";
            }
            ACTIVE_EXECUTION.set(execution);
            List<String> lines = List.of(body.split("\n", -1));
            if (lines.size() < FIELD_COUNT + PAGE_FIELDS) {
                return FAILED + "pedido inválido";
            }
            String target = String.join("\n", lines.subList(0, FIELD_COUNT));
            String schema = decode(lines.get(FIELD_COUNT));
            SgbdDriver.Page page = new SgbdDriver.Page(Integer.parseInt(decode(lines.get(FIELD_COUNT + 1))),
                    Long.parseLong(decode(lines.get(FIELD_COUNT + 2))));
            List<String> statements = lines.subList(FIELD_COUNT + 3, lines.size()).stream()
                    .map(SgbdConnections::decode)
                    .toList();
            if (page.limit() < 1 || page.limit() > QueryReport.MAX_ROWS || page.offset() < 0
                    || page.offset() > MAX_PAGE_OFFSET || statements.size() > MAX_STATEMENTS) {
                return FAILED + "pedido inválido";
            }
            return run(target, (driver, connection) -> driver.execute(connection, schema, statements, page));
        } finally {
            ACTIVE_EXECUTION.remove();
            EXECUTIONS.remove(requestId, execution);
            EXECUTION_SLOTS.release();
        }
    }

    static String cancel(String requestId) {
        Execution execution = EXECUTIONS.get(requestId);
        if (execution == null) {
            return FAILED + "execução não encontrada";
        }
        execution.cancelled.set(true);
        Statement statement = execution.statement.get();
        if (statement != null) {
            try {
                statement.cancel();
            } catch (SQLException exception) {
                return FAILED + exception.getMessage();
            }
        }
        close(execution.cancellation.get());
        return OK;
    }

    static void registerStatement(Statement statement) throws SQLException {
        Execution execution = ACTIVE_EXECUTION.get();
        if (execution == null) {
            return;
        }
        execution.statement.set(statement);
        if (execution.cancelled.get()) {
            statement.cancel();
        }
    }

    static void registerCancellation(AutoCloseable cancellation) {
        Execution execution = ACTIVE_EXECUTION.get();
        if (execution == null) {
            return;
        }
        execution.cancellation.set(cancellation);
        if (execution.cancelled.get()) {
            close(cancellation);
        }
    }

    private static void close(AutoCloseable cancellation) {
        if (cancellation == null) {
            return;
        }
        try {
            cancellation.close();
        } catch (Exception ignored) {
            // O cancelamento deve encerrar a execução mesmo quando o recurso já foi fechado.
        }
    }

    private static String run(String body, Operation operation) {
        try {
            SgbdDriver.Target target = parse(body);
            SgbdDriver driver = DRIVERS.get(target.kind());
            if (driver == null) {
                return FAILED + "tipo de conexão desconhecido";
            }
            return OK + operation.run(driver, target);
        } catch (IOException | SQLException | RuntimeException e) {
            return FAILED + e.getMessage();
        }
    }

    private static String decode(String field) {
        return new String(Base64.getDecoder().decode(field), StandardCharsets.UTF_8);
    }

    private static SgbdDriver.Target parse(String body) {
        List<String> fields = Arrays.stream(body.split("\n", -1))
                .map(SgbdConnections::decode)
                .toList();
        if (fields.size() != FIELD_COUNT) {
            throw new IllegalArgumentException("pedido inválido");
        }
        return new SgbdDriver.Target(fields.get(0), fields.get(1), Integer.parseInt(fields.get(2)), fields.get(3),
                fields.get(4), fields.get(5), Boolean.parseBoolean(fields.get(6)));
    }
}
