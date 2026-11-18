package com.godardstack.agent;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

final class QueryReport {

    static final int MAX_ROWS = 1000;
    private static final int MAX_CELL_CHARS = 2000;
    private static final int MAX_REPORT_CHARS = 1_000_000;
    private static final int MAX_RESULTS = 100;
    private static final int FIRST_PRINTABLE_CHAR = 0x20;
    private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    record Column(String name, boolean key, boolean numeric) {
    }

    record Table(String title, List<Column> columns, List<List<String>> rows, boolean truncated, long offset,
                 Long total, boolean paged) {
    }

    private final List<String> entries = new ArrayList<>();
    private int chars;
    private String schema;

    void schema(String current) {
        schema = current;
    }

    boolean hasRoom() {
        return chars < MAX_REPORT_CHARS && entries.size() < MAX_RESULTS;
    }

    String cell(String value) {
        if (value == null) {
            return null;
        }
        String kept = value.length() > MAX_CELL_CHARS ? value.substring(0, MAX_CELL_CHARS) + "..." : value;
        chars += kept.length();
        return kept;
    }

    void add(String statement, String message, Table table) {
        entries.add(entry(statement, message, false, table == null ? "null" : tableJson(table)));
    }

    void addFailure(String statement, String message) {
        entries.add(entry(statement, message, true, "null"));
    }

    String toJson() {
        return "{\"schema\":" + quote(schema) + ",\"results\":[" + String.join(",", entries) + "]}";
    }

    static String rowCount(int rows) {
        return rows == 1 ? "1 row" : rows + " rows";
    }

    private String entry(String statement, String message, boolean failed, String table) {
        return "{\"at\":" + quote(LocalDateTime.now().format(TIMESTAMP))
                + ",\"schema\":" + quote(schema)
                + ",\"statement\":" + quote(statement)
                + ",\"message\":" + quote(message)
                + ",\"failed\":" + failed
                + ",\"table\":" + table + "}";
    }

    private static String tableJson(Table table) {
        String columns = table.columns().stream()
                .map(column -> "{\"name\":" + quote(column.name())
                        + ",\"key\":" + column.key()
                        + ",\"numeric\":" + column.numeric() + "}")
                .collect(Collectors.joining(",", "[", "]"));
        String rows = table.rows().stream()
                .map(row -> row.stream().map(QueryReport::quote).collect(Collectors.joining(",", "[", "]")))
                .collect(Collectors.joining(",", "[", "]"));
        return "{\"title\":" + quote(table.title())
                + ",\"columns\":" + columns
                + ",\"rows\":" + rows
                + ",\"truncated\":" + table.truncated()
                + ",\"offset\":" + table.offset()
                + ",\"total\":" + table.total()
                + ",\"paged\":" + table.paged() + "}";
    }

    private static String quote(String value) {
        if (value == null) {
            return "null";
        }
        StringBuilder quoted = new StringBuilder("\"");
        value.chars().forEach(character -> {
            switch (character) {
                case '"' -> quoted.append("\\\"");
                case '\\' -> quoted.append("\\\\");
                case '\n' -> quoted.append("\\n");
                case '\r' -> quoted.append("\\r");
                case '\t' -> quoted.append("\\t");
                default -> {
                    if (character < FIRST_PRINTABLE_CHAR) {
                        quoted.append(String.format("\\u%04x", character));
                    } else {
                        quoted.append((char) character);
                    }
                }
            }
        });
        return quoted.append('"').toString();
    }
}
