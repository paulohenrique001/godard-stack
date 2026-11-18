package com.godardstack.agent;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.net.ssl.SSLSocketFactory;

final class RedisDriver implements SgbdDriver {

    private static final int CONNECT_TIMEOUT_MS = 5000;
    private static final int READ_TIMEOUT_MS = 10000;
    private static final String CRLF = "\r\n";
    private static final String VERSION_PREFIX = "redis_version:";
    private static final String KEYSPACE_PREFIX = "db";
    private static final String EMPTY_KEYSPACE = "db0\t0\t0\t0";
    private static final String EMPTY_COUNTERS = "\t0\t0\t0";
    private static final Pattern DATABASE_NAME = Pattern.compile("db(\\d{1,4})");
    private static final int MAX_ARRAY_ITEMS = QueryReport.MAX_ROWS * 2;
    private static final int MAX_BULK_BYTES = 256 * 1024;
    private static final int MAX_LINE_CHARS = 64 * 1024;
    private static final int MAX_DATABASES = 256;
    private static final double NANOS_PER_MS = 1_000_000.0;
    private static final String NIL = "(nil)";
    private static final String HASH_COMMAND = "HGETALL";
    private static final String SELECT_COMMAND = "SELECT";

    private record Status(String text) {
    }

    private record Items(List<Object> values, boolean truncated) {
    }

    private record Session(Socket socket, OutputStream output, InputStream input) implements AutoCloseable {

        @Override
        public void close() throws IOException {
            socket.close();
        }
    }

    @Override
    public String health(Target target) throws IOException {
        try (Session session = open(target)) {
            if (!target.database().isEmpty()) {
                sendCommand(session, List.of("SELECT", target.database()));
                readReply(session);
            }
            sendCommand(session, List.of("INFO", "server"));
            String version = readReply(session).lines()
                    .filter(line -> line.startsWith(VERSION_PREFIX))
                    .map(line -> line.substring(VERSION_PREFIX.length()).strip())
                    .findFirst()
                    .orElse("desconhecida");
            long startedAt = System.nanoTime();
            sendCommand(session, List.of("PING"));
            readReply(session);
            return SgbdDriver.healthReport(version, startedAt);
        }
    }

    @Override
    public String schemas(Target target) throws IOException {
        try (Session session = open(target)) {
            int databases = databaseCount(session);
            sendCommand(session, List.of("INFO", "keyspace"));
            Map<String, String> used = new LinkedHashMap<>();
            readReply(session).lines()
                    .filter(line -> line.startsWith(KEYSPACE_PREFIX))
                    .map(RedisDriver::keyspaceLine)
                    .forEach(line -> used.put(line.substring(0, line.indexOf('\t')), line));
            List<String> lines = new ArrayList<>();
            for (int index = 0; index < databases; index++) {
                String name = KEYSPACE_PREFIX + index;
                String line = used.remove(name);
                lines.add(line == null ? name + EMPTY_COUNTERS : line);
            }
            lines.addAll(used.values());
            return lines.isEmpty() ? EMPTY_KEYSPACE : String.join("\n", lines);
        }
    }

    @Override
    public String execute(Target target, String schema, List<String> statements, Page page) throws IOException {
        QueryReport report = new QueryReport();
        try (Session session = open(target)) {
            SgbdConnections.registerCancellation(session);
            session.socket().setSoTimeout(EXECUTE_TIMEOUT_MS);
            report.schema(selectDatabase(session, target, schema));
            for (String line : statements) {
                try {
                    runCommand(session, line, report);
                } catch (IOException | IllegalArgumentException e) {
                    report.addFailure(line, e.getMessage());
                    break;
                }
            }
        }
        return report.toJson();
    }

    private String selectDatabase(Session session, Target target, String schema) throws IOException {
        Matcher database = DATABASE_NAME.matcher(schema);
        String index = database.matches() ? database.group(1) : target.database();
        if (index.isEmpty()) {
            return null;
        }
        sendCommand(session, List.of(SELECT_COMMAND, index));
        readReply(session);
        return KEYSPACE_PREFIX + index;
    }

    private void runCommand(Session session, String line, QueryReport report) throws IOException {
        List<String> command = tokens(line);
        long startedAt = System.nanoTime();
        sendCommand(session, command);
        Object reply = readValue(session);
        String elapsed = Math.round((System.nanoTime() - startedAt) / NANOS_PER_MS) + " ms";
        if (reply instanceof Status status) {
            report.add(line, status.text() + " in " + elapsed, null);
            if (SELECT_COMMAND.equalsIgnoreCase(command.get(0)) && command.size() > 1) {
                report.schema(KEYSPACE_PREFIX + command.get(1));
            }
            return;
        }
        QueryReport.Table table = reply instanceof Items items
                ? itemsTable(line, command, items, report)
                : bulkTable(line, (String) reply, report);
        report.add(line, QueryReport.rowCount(table.rows().size()) + " retrieved in " + elapsed, table);
    }

    private QueryReport.Table bulkTable(String line, String bulk, QueryReport report) {
        List<String> lines = bulk.isEmpty() ? List.of("") : bulk.lines().toList();
        List<List<String>> rows = new ArrayList<>();
        for (String value : lines) {
            if (rows.size() < QueryReport.MAX_ROWS && report.hasRoom()) {
                List<String> row = new ArrayList<>();
                row.add(report.cell(value));
                rows.add(row);
            }
        }
        return new QueryReport.Table(line, List.of(new QueryReport.Column("value", false, false)), rows,
                rows.size() < lines.size(), 0, (long) rows.size(), false);
    }

    private QueryReport.Table itemsTable(String line, List<String> command, Items items, QueryReport report) {
        boolean pairs = HASH_COMMAND.equalsIgnoreCase(command.get(0));
        int width = pairs ? 2 : 1;
        List<QueryReport.Column> columns = pairs
                ? List.of(new QueryReport.Column("field", false, false), new QueryReport.Column("value", false, false))
                : List.of(new QueryReport.Column("value", false, false));
        List<List<String>> rows = new ArrayList<>();
        for (int index = 0; index + width <= items.values().size(); index += width) {
            if (rows.size() < QueryReport.MAX_ROWS && report.hasRoom()) {
                List<String> row = new ArrayList<>();
                for (int column = 0; column < width; column++) {
                    row.add(report.cell(describe(items.values().get(index + column))));
                }
                rows.add(row);
            }
        }
        boolean truncated = items.truncated() || rows.size() < items.values().size() / width;
        return new QueryReport.Table(line, columns, rows, truncated, 0, (long) rows.size(), false);
    }

    private String describe(Object value) {
        if (value instanceof Status status) {
            return status.text();
        }
        if (value instanceof Items items) {
            List<String> values = items.values().stream().map(this::describe).toList();
            return "[" + String.join(", ", values) + (items.truncated() ? ", ..." : "") + "]";
        }
        return (String) value;
    }

    private List<String> tokens(String line) {
        List<String> tokens = new ArrayList<>();
        StringBuilder token = new StringBuilder();
        boolean inToken = false;
        char quote = 0;
        for (int index = 0; index < line.length(); index++) {
            char current = line.charAt(index);
            if (quote == 0 && Character.isWhitespace(current)) {
                if (inToken) {
                    tokens.add(token.toString());
                    token.setLength(0);
                    inToken = false;
                }
            } else if (quote == 0 && (current == '"' || current == '\'')) {
                quote = current;
                inToken = true;
            } else if (current == quote) {
                quote = 0;
            } else if (quote == '"' && current == '\\' && index + 1 < line.length()) {
                index++;
                token.append(line.charAt(index) == 'n' ? '\n' : line.charAt(index));
            } else {
                token.append(current);
                inToken = true;
            }
        }
        if (quote != 0) {
            throw new IllegalArgumentException("Aspas sem fechamento no comando.");
        }
        if (inToken) {
            tokens.add(token.toString());
        }
        return tokens;
    }

    private Object readValue(Session session) throws IOException {
        String line = readLine(session.input());
        if (line.isEmpty()) {
            throw new IOException("resposta vazia do servidor");
        }
        String content = line.substring(1);
        return switch (line.charAt(0)) {
            case '-' -> throw new IOException(content);
            case '+' -> new Status(content);
            case ':' -> new Status("(integer) " + content);
            case '$' -> readBoundedBulk(session, Integer.parseInt(content));
            case '*' -> readItems(session, Integer.parseInt(content));
            default -> throw new IOException("resposta desconhecida do servidor");
        };
    }

    private Object readBoundedBulk(Session session, int length) throws IOException {
        if (length < 0) {
            return new Status(NIL);
        }
        if (length > MAX_BULK_BYTES) {
            throw new IOException("Resposta Redis excede o limite de 256 KiB.");
        }
        byte[] content = session.input().readNBytes(length);
        session.input().skipNBytes(CRLF.length());
        return new String(content, StandardCharsets.UTF_8);
    }

    private Object readItems(Session session, int count) throws IOException {
        if (count < 0) {
            return new Status(NIL);
        }
        if (count > MAX_ARRAY_ITEMS) {
            throw new IOException("Resposta Redis tem itens demais.");
        }
        List<Object> values = new ArrayList<>();
        for (int index = 0; index < count; index++) {
            Object value = readValue(session);
            values.add(value);
        }
        return new Items(values, false);
    }

    @Override
    public String dropSchema(Target target, String name) throws IOException {
        Matcher database = DATABASE_NAME.matcher(name);
        if (!database.matches()) {
            throw new IllegalArgumentException("Banco inválido.");
        }
        try (Session session = open(target)) {
            sendCommand(session, List.of("SELECT", database.group(1)));
            readReply(session);
            sendCommand(session, List.of("FLUSHDB"));
            readReply(session);
            return "";
        }
    }

    private int databaseCount(Session session) throws IOException {
        sendCommand(session, List.of("CONFIG", "GET", "databases"));
        String header = readLine(session.input());
        if (!header.startsWith("*2")) {
            return 0;
        }
        readBulkLine(session);
        int databases = Integer.parseInt(readBulkLine(session));
        if (databases < 1 || databases > MAX_DATABASES) {
            throw new IOException("Quantidade de bancos Redis fora do limite.");
        }
        return databases;
    }

    private String readBulkLine(Session session) throws IOException {
        String length = readLine(session.input());
        return readBulk(session.input(), Integer.parseInt(length.substring(1)));
    }

    @Override
    public String structure(Target target) {
        return "";
    }

    private static String keyspaceLine(String line) {
        String[] parts = line.split(":", 2);
        String[] counters = parts[1].split(",");
        return String.join("\t", parts[0], counters[0].split("=")[1], counters[1].split("=")[1],
                counters[2].split("=")[1]);
    }

    private Session open(Target target) throws IOException {
        Socket socket = openSocket(target);
        Session session = new Session(socket, socket.getOutputStream(), new BufferedInputStream(socket.getInputStream()));
        if (!target.password().isEmpty()) {
            sendCommand(session, target.username().isEmpty()
                    ? List.of("AUTH", target.password())
                    : List.of("AUTH", target.username(), target.password()));
            readReply(session);
        }
        return session;
    }

    private Socket openSocket(Target target) throws IOException {
        Socket socket = new Socket();
        socket.connect(new InetSocketAddress(target.host(), target.port()), CONNECT_TIMEOUT_MS);
        socket.setSoTimeout(READ_TIMEOUT_MS);
        if (!target.ssl()) {
            return socket;
        }
        SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
        return factory.createSocket(socket, target.host(), target.port(), true);
    }

    private void sendCommand(Session session, List<String> command) throws IOException {
        StringBuilder message = new StringBuilder("*").append(command.size()).append(CRLF);
        for (String argument : command) {
            int length = argument.getBytes(StandardCharsets.UTF_8).length;
            message.append('$').append(length).append(CRLF).append(argument).append(CRLF);
        }
        session.output().write(message.toString().getBytes(StandardCharsets.UTF_8));
        session.output().flush();
    }

    private String readReply(Session session) throws IOException {
        String line = readLine(session.input());
        if (line.isEmpty()) {
            throw new IOException("resposta vazia do servidor");
        }
        String content = line.substring(1);
        return switch (line.charAt(0)) {
            case '-' -> throw new IOException(content);
            case '$' -> readBulk(session.input(), Integer.parseInt(content));
            default -> content;
        };
    }

    private String readBulk(InputStream input, int length) throws IOException {
        if (length < 0) {
            return "";
        }
        if (length > MAX_BULK_BYTES) {
            throw new IOException("Resposta Redis excede o limite de 256 KiB.");
        }
        byte[] content = input.readNBytes(length);
        input.readNBytes(CRLF.length());
        return new String(content, StandardCharsets.UTF_8);
    }

    private String readLine(InputStream input) throws IOException {
        StringBuilder line = new StringBuilder();
        int current = input.read();
        while (current != -1 && current != '\n') {
            if (current != '\r') {
                line.append((char) current);
                if (line.length() > MAX_LINE_CHARS) {
                    throw new IOException("Linha Redis excede o limite de 64 KiB.");
                }
            }
            current = input.read();
        }
        return line.toString();
    }
}
