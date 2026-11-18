package com.godardstack.agent;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.Set;
import java.util.regex.Pattern;

class MariadbDriver implements SgbdDriver {

    private static final Pattern SCHEMA_NAME = Pattern.compile("[A-Za-z0-9_$-]{1,64}");
    private static final Set<String> SYSTEM_SCHEMAS = Set.of("information_schema", "mysql", "performance_schema", "sys");
    private static final int CONNECT_TIMEOUT_MS = 5000;
    private static final int READ_TIMEOUT_MS = 10000;
    private static final int FETCH_SIZE = 100;
    private static final int METADATA_TIMEOUT_SECONDS = 15;
    private static final int MAX_METADATA_ROWS = 10_000;
    private static final int MAX_METADATA_CHARS = 1024 * 1024;
    private static final int COUNT_TIMEOUT_SECONDS = 5;
    private static final Pattern PAGED_STATEMENT = Pattern.compile(
            "^\\s*(SELECT|WITH|SHOW|DESC|DESCRIBE|EXPLAIN|VALUES|TABLE)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern COUNTABLE_STATEMENT = Pattern.compile(
            "^\\s*(SELECT|WITH)\\b", Pattern.CASE_INSENSITIVE);
    private static final int BINARY_PREVIEW_BYTES = 64;
    private static final double NANOS_PER_MS = 1_000_000.0;
    private static final Set<Integer> NUMERIC_TYPES = Set.of(Types.TINYINT, Types.SMALLINT, Types.INTEGER, Types.BIGINT,
            Types.FLOAT, Types.REAL, Types.DOUBLE, Types.NUMERIC, Types.DECIMAL);
    private static final Set<Integer> BINARY_TYPES = Set.of(Types.BINARY, Types.VARBINARY, Types.LONGVARBINARY, Types.BLOB);
    private static final String SCHEMAS_QUERY = """
            SELECT s.SCHEMA_NAME, s.DEFAULT_CHARACTER_SET_NAME, s.DEFAULT_COLLATION_NAME,
                   COUNT(CASE WHEN t.TABLE_TYPE <> 'VIEW' THEN 1 END),
                   COUNT(CASE WHEN t.TABLE_TYPE = 'VIEW' THEN 1 END),
                   COALESCE(SUM(t.TABLE_ROWS), 0),
                   COALESCE(SUM(t.DATA_LENGTH), 0),
                   COALESCE(SUM(t.INDEX_LENGTH), 0)
            FROM information_schema.SCHEMATA s
            LEFT JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = s.SCHEMA_NAME
            GROUP BY s.SCHEMA_NAME, s.DEFAULT_CHARACTER_SET_NAME, s.DEFAULT_COLLATION_NAME
            ORDER BY s.SCHEMA_NAME
            """;

    private static final String STRUCTURE_QUERY = """
            SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
            FROM information_schema.COLUMNS
            ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
            """;

    private record Reading(String sql, boolean paged, int limit, long offset, long startedAt) {
    }

    @Override
    public String health(Target target) throws SQLException {
        try (Connection connection = open(target);
             Statement statement = connection.createStatement()) {
            String version = connection.getMetaData().getDatabaseProductVersion();
            long startedAt = System.nanoTime();
            statement.execute("SELECT 1");
            return SgbdDriver.healthReport(version, startedAt);
        }
    }

    @Override
    public String schemas(Target target) throws SQLException {
        List<String> lines = new ArrayList<>();
        int chars = 0;
        try (Connection connection = open(target);
             Statement statement = connection.createStatement()) {
            statement.setQueryTimeout(METADATA_TIMEOUT_SECONDS);
            try (ResultSet schemas = statement.executeQuery(SCHEMAS_QUERY)) {
                while (schemas.next()) {
                    String line = String.join("\t", schemas.getString(1), schemas.getString(2), schemas.getString(3),
                            schemas.getString(4), schemas.getString(5), schemas.getString(6), schemas.getString(7),
                            schemas.getString(8));
                    if (lines.size() >= MAX_METADATA_ROWS || chars + line.length() > MAX_METADATA_CHARS) {
                        throw new SQLException("Metadados excedem o limite de exibição.");
                    }
                    lines.add(line);
                    chars += line.length();
                }
            }
        }
        return String.join("\n", lines);
    }

    @Override
    public String structure(Target target) throws SQLException {
        StringBuilder lines = new StringBuilder();
        try (Connection connection = open(target);
             Statement statement = connection.createStatement()) {
            statement.setQueryTimeout(METADATA_TIMEOUT_SECONDS);
            int rows = 0;
            try (ResultSet columns = statement.executeQuery(STRUCTURE_QUERY)) {
                while (columns.next()) {
                    String line = columns.getString(1) + '\t'
                            + columns.getString(2) + '\t'
                            + columns.getString(3) + '\t'
                            + columns.getString(4) + '\n';
                    if (++rows > MAX_METADATA_ROWS || lines.length() + line.length() > MAX_METADATA_CHARS) {
                        throw new SQLException("Metadados excedem o limite de exibição.");
                    }
                    lines.append(line);
                }
            }
        }
        return lines.toString();
    }

    @Override
    public String execute(Target target, String schema, List<String> statements, Page page) throws SQLException {
        if (!schema.isEmpty() && !SCHEMA_NAME.matcher(schema).matches()) {
            throw new IllegalArgumentException("Nome de schema inválido.");
        }
        String database = schema.isEmpty() ? target.database() : schema;
        QueryReport report = new QueryReport();
        try (Connection connection = open(target, database, EXECUTE_TIMEOUT_MS + "&tinyInt1isBit=false");
             Statement statement = connection.createStatement()) {
            SgbdConnections.registerStatement(statement);
            statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
            statement.setFetchSize(FETCH_SIZE);
            for (String sql : statements) {
                report.schema(currentSchema(connection));
                try {
                    runStatement(connection, statement, sql, page, report);
                } catch (SQLException e) {
                    report.addFailure(sql, "[" + e.getSQLState() + "] " + e.getMessage());
                    break;
                }
            }
            report.schema(currentSchema(connection));
        }
        return report.toJson();
    }

    private String currentSchema(Connection connection) throws SQLException {
        String catalog = connection.getCatalog();
        return catalog == null || catalog.isEmpty() ? null : catalog;
    }

    private void runStatement(Connection connection, Statement statement, String sql, Page page, QueryReport report)
            throws SQLException {
        boolean paged = PAGED_STATEMENT.matcher(sql).find();
        Reading reading = new Reading(sql, paged, paged ? page.limit() : QueryReport.MAX_ROWS, paged ? page.offset() : 0,
                System.nanoTime());
        statement.setLargeMaxRows(reading.offset() + reading.limit() + 1);
        boolean hasRows = statement.execute(sql);
        long executedAt = System.nanoTime();
        while (report.hasRoom()) {
            if (hasRows) {
                addRows(connection, statement, reading, executedAt, report);
            } else {
                int affected = statement.getUpdateCount();
                if (affected == -1) {
                    return;
                }
                String message = QueryReport.rowCount(affected) + " affected in "
                        + millis(reading.startedAt(), System.nanoTime()) + " ms";
                report.add(sql, message, null);
            }
            hasRows = statement.getMoreResults();
        }
    }

    private void addRows(Connection connection, Statement statement, Reading reading, long executedAt,
                         QueryReport report) throws SQLException {
        List<List<String>> rows = new ArrayList<>();
        List<String> labels = new ArrayList<>();
        List<String> originals = new ArrayList<>();
        List<Boolean> numeric = new ArrayList<>();
        String catalog = "";
        String table = "";
        boolean more;
        long skipped = 0;
        try (ResultSet results = statement.getResultSet()) {
            ResultSetMetaData metadata = results.getMetaData();
            int columns = metadata.getColumnCount();
            for (int index = 1; index <= columns; index++) {
                labels.add(metadata.getColumnLabel(index));
                originals.add(metadata.getColumnName(index));
                numeric.add(NUMERIC_TYPES.contains(metadata.getColumnType(index)));
            }
            if (isSingleTable(metadata)) {
                catalog = metadata.getCatalogName(1);
                table = metadata.getTableName(1);
            }
            while (skipped < reading.offset() && results.next()) {
                skipped++;
            }
            while (rows.size() < reading.limit() && report.hasRoom() && results.next()) {
                rows.add(readRow(results, metadata, report));
            }
            more = results.next();
        }
        long fetchedAt = System.nanoTime();
        Set<String> keys = table.isEmpty() ? Set.of() : primaryKeys(connection, catalog, table);
        List<QueryReport.Column> columns = new ArrayList<>();
        for (int index = 0; index < labels.size(); index++) {
            boolean key = keys.contains(originals.get(index).toLowerCase(Locale.ROOT));
            columns.add(new QueryReport.Column(labels.get(index), key, numeric.get(index)));
        }
        String title = catalog.isEmpty() ? table : catalog + "." + table;
        boolean truncated = more && !reading.paged();
        String message = QueryReport.rowCount(rows.size()) + " retrieved starting from " + (skipped + 1) + " in "
                + millis(reading.startedAt(), fetchedAt) + " ms (execution: " + millis(reading.startedAt(), executedAt)
                + " ms, fetching: " + millis(executedAt, fetchedAt) + " ms)"
                + (truncated ? ", more rows available" : "");
        Long total = more ? countRows(connection, reading) : Long.valueOf(skipped + rows.size());
        report.add(reading.sql(), message,
                new QueryReport.Table(title, columns, rows, truncated, skipped, total, reading.paged()));
    }

    private Long countRows(Connection connection, Reading reading) {
        if (!reading.paged() || !COUNTABLE_STATEMENT.matcher(reading.sql()).find()) {
            return null;
        }
        try (Statement counter = connection.createStatement()) {
            counter.setQueryTimeout(COUNT_TIMEOUT_SECONDS);
            try (ResultSet count = counter.executeQuery("SELECT COUNT(*) FROM (" + reading.sql() + ") AS godard_stack_count")) {
                return count.next() ? count.getLong(1) : null;
            }
        } catch (SQLException e) {
            return null;
        }
    }

    private List<String> readRow(ResultSet results, ResultSetMetaData metadata, QueryReport report) throws SQLException {
        List<String> row = new ArrayList<>();
        for (int index = 1; index <= metadata.getColumnCount(); index++) {
            if (BINARY_TYPES.contains(metadata.getColumnType(index))) {
                row.add(report.cell(binaryPreview(results.getBytes(index))));
            } else {
                row.add(report.cell(results.getString(index)));
            }
        }
        return row;
    }

    private String binaryPreview(byte[] content) {
        if (content == null) {
            return null;
        }
        int kept = Math.min(content.length, BINARY_PREVIEW_BYTES);
        String preview = "0x" + HexFormat.of().withUpperCase().formatHex(content, 0, kept);
        return kept < content.length ? preview + "..." : preview;
    }

    private boolean isSingleTable(ResultSetMetaData metadata) throws SQLException {
        String table = metadata.getTableName(1);
        if (table == null || table.isEmpty()) {
            return false;
        }
        for (int index = 2; index <= metadata.getColumnCount(); index++) {
            if (!table.equals(metadata.getTableName(index))) {
                return false;
            }
        }
        return true;
    }

    private Set<String> primaryKeys(Connection connection, String catalog, String table) {
        Set<String> keys = new HashSet<>();
        try (ResultSet primaryKeys = connection.getMetaData().getPrimaryKeys(catalog, null, table)) {
            while (primaryKeys.next()) {
                keys.add(primaryKeys.getString("COLUMN_NAME").toLowerCase(Locale.ROOT));
            }
        } catch (SQLException e) {
            return Set.of();
        }
        return keys;
    }

    private long millis(long from, long to) {
        return Math.round((to - from) / NANOS_PER_MS);
    }


    @Override
    public String createSchema(Target target, String name) throws SQLException {
        return executeOnSchema(target, "CREATE DATABASE", name);
    }

    @Override
    public String dropSchema(Target target, String name) throws SQLException {
        if (SYSTEM_SCHEMAS.contains(name.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("Schemas do sistema não podem ser excluídos.");
        }
        return executeOnSchema(target, "DROP DATABASE", name);
    }

    private String executeOnSchema(Target target, String command, String name) throws SQLException {
        if (!SCHEMA_NAME.matcher(name).matches()) {
            throw new IllegalArgumentException("Nome de schema inválido.");
        }
        try (Connection connection = open(target);
             Statement statement = connection.createStatement()) {
            statement.execute(command + " `" + name + "`");
            return "";
        }
    }

    protected Connection open(Target target) throws SQLException {
        return open(target, target.database(), String.valueOf(READ_TIMEOUT_MS));
    }

    protected Connection open(Target target, String database, String socketOptions) throws SQLException {
        String url = "jdbc:mariadb://" + target.host() + ":" + target.port() + "/" + database
                + "?connectTimeout=" + CONNECT_TIMEOUT_MS
                + "&socketTimeout=" + socketOptions
                + "&sslMode=" + (target.ssl() ? "trust" : "disable");
        Properties properties = new Properties();
        properties.setProperty("user", target.username());
        properties.setProperty("password", target.password());
        return new org.mariadb.jdbc.Driver().connect(url, properties);
    }
}
