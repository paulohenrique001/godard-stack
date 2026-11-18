package com.godardstack;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sgbd")
public class SgbdController {

    private static final Set<String> KINDS = Set.of("mariadb", "mysql", "redis");
    private static final Pattern HOST = Pattern.compile("[A-Za-z0-9._:-]{1,255}");
    private static final Pattern DATABASE = Pattern.compile("[A-Za-z0-9_$-]{0,64}");
    private static final int MAX_NAME_LENGTH = 60;
    private static final int MAX_TEXT_LENGTH = 200;
    private static final int MAX_PORT = 65535;
    private static final String OK_PREFIX = "ok\n";
    private static final String FAILED_PREFIX = "failed\n";
    private static final int UNPROCESSABLE = 422;
    private static final int MAX_LABEL_LENGTH = 40;
    private static final int MAX_QUERY_LENGTH = 1024 * 1024;
    private static final int MAX_STATEMENTS = 100;
    private static final long MAX_PAGE_OFFSET = 1_000_000;
    private static final int MIN_EDITOR_PERCENT = 30;
    private static final int MAX_EDITOR_PERCENT = 70;
    private static final int MAX_SELECTED_SCHEMAS = 1000;
    private static final Set<Integer> PAGE_SIZES = Set.of(10, 100, 250, 500, 1000);
    private static final int MAX_SAVED_RESULTS_LENGTH = 4 * 1024 * 1024;
    private static final Pattern EXECUTION_REQUEST = Pattern.compile("[A-Za-z0-9-]{8,64}");
    private static final String LIVE = "live";
    private static final String CACHED = "cached";
    private static final int MAX_AUTOMATIC_PING_FAILURES = 3;

    private final SgbdConnectionRepository repository;
    private final SgbdConsoleRepository consoleRepository;
    private final AgentHealthClient agentHealthClient;

    public SgbdController(SgbdConnectionRepository repository,
                          SgbdConsoleRepository consoleRepository,
                          AgentHealthClient agentHealthClient) {
        this.repository = repository;
        this.consoleRepository = consoleRepository;
        this.agentHealthClient = agentHealthClient;
    }

    @GetMapping(value = "/connections", produces = MediaType.APPLICATION_JSON_VALUE)
    public String connections() {
        return repository.findAll().stream()
                .map(this::toJson)
                .collect(Collectors.joining(",", "[", "]"));
    }

    @PostMapping(value = "/connections", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<Void> create(@RequestParam("name") String name,
                                       @RequestParam("kind") String kind,
                                       @RequestParam("host") String host,
                                       @RequestParam("port") int port,
                                       @RequestParam(name = "username", defaultValue = "") String username,
                                       @RequestParam(name = "password", defaultValue = "") String password,
                                       @RequestParam(name = "database", defaultValue = "") String database,
                                       @RequestParam(name = "ssl", defaultValue = "false") boolean ssl,
                                       @RequestParam(name = "autoPing", defaultValue = "false") boolean autoPing,
                                       @RequestParam(name = "showAllSchemas", defaultValue = "true") boolean showAllSchemas,
                                       @RequestParam(name = "showSystemSchemas", defaultValue = "false") boolean showSystemSchemas,
                                       @RequestParam(name = "selectedSchema", required = false) List<String> selectedSchema) {
        List<String> selectedSchemas = normalizeSelectedSchemas(selectedSchema);
        var connection = new SgbdConnectionRepository.SgbdConnection(
                0, name.strip(), kind, host.strip(), port, username, password, database.strip(), ssl, autoPing,
                showAllSchemas, showSystemSchemas, String.join("\n", selectedSchemas), 0);
        if (!isValid(connection) || !areValidSelectedSchemas(selectedSchemas)) {
            return ResponseEntity.badRequest().build();
        }
        repository.create(connection);
        return ResponseEntity.noContent().build();
    }

    @PutMapping(value = "/connections/{id}", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<Void> update(@PathVariable("id") long id,
                                       @RequestParam("name") String name,
                                       @RequestParam("host") String host,
                                       @RequestParam("port") int port,
                                       @RequestParam(name = "username", defaultValue = "") String username,
                                       @RequestParam(name = "password", defaultValue = "") String password,
                                       @RequestParam(name = "database", defaultValue = "") String database,
                                       @RequestParam(name = "ssl", defaultValue = "false") boolean ssl,
                                       @RequestParam(name = "autoPing", defaultValue = "false") boolean autoPing,
                                       @RequestParam(name = "showAllSchemas", defaultValue = "true") boolean showAllSchemas,
                                       @RequestParam(name = "showSystemSchemas", defaultValue = "false") boolean showSystemSchemas,
                                       @RequestParam(name = "selectedSchema", required = false) List<String> selectedSchema) {
        Optional<SgbdConnectionRepository.SgbdConnection> current = repository.find(id);
        if (current.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        List<String> selectedSchemas = normalizeSelectedSchemas(selectedSchema);
        String kept = password.isEmpty() ? current.get().password() : password;
        var connection = new SgbdConnectionRepository.SgbdConnection(
                id, name.strip(), current.get().kind(), host.strip(), port, username, kept, database.strip(), ssl,
                autoPing, showAllSchemas, showSystemSchemas, String.join("\n", selectedSchemas),
                current.get().autoPingFailures());
        if (!isValid(connection) || !areValidSelectedSchemas(selectedSchemas)) {
            return ResponseEntity.badRequest().build();
        }
        repository.update(connection);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/connections/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") long id) {
        repository.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping(value = "/test", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE,
            produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> test(@RequestParam(name = "id", required = false) Long id,
                                       @RequestParam(name = "automatic", defaultValue = "false") boolean automatic,
                                       @RequestParam("kind") String kind,
                                       @RequestParam("host") String host,
                                       @RequestParam("port") int port,
                                       @RequestParam(name = "username", defaultValue = "") String username,
                                       @RequestParam(name = "password", defaultValue = "") String password,
                                       @RequestParam(name = "database", defaultValue = "") String database,
                                       @RequestParam(name = "ssl", defaultValue = "false") boolean ssl) {
        if (automatic && id != null && repository.find(id)
                .map(connection -> connection.autoPingFailures() >= MAX_AUTOMATIC_PING_FAILURES)
                .orElse(false)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body("Verificação automática suspensa após três falhas. Use Atualizar para testar novamente.");
        }
        String secret = password.isEmpty() && id != null
                ? repository.find(id).map(SgbdConnectionRepository.SgbdConnection::password).orElse("")
                : password;
        var target = new SgbdConnectionRepository.SgbdConnection(
                0, "teste", kind, host.strip(), port, username, secret, database.strip(), ssl, false, true, false, "", 0);
        if (!isValid(target)) {
            return ResponseEntity.badRequest().body("Confira os campos da conexão.");
        }
        Optional<String> report = agentHealthClient.testSgbdConnection(encode(target));
        boolean connected = report.map(value -> value.startsWith(OK_PREFIX)).orElse(false);
        if (id != null) {
            if (connected) {
                repository.resetAutomaticPingFailures(id);
            } else if (automatic) {
                repository.recordAutomaticPingFailure(id);
            }
        }
        return report.map(this::testResponse)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body("Agente indisponível."));
    }

    @GetMapping(value = "/connections/{id}/schemas", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> schemas(@PathVariable("id") long id,
                                           @RequestParam(name = "refresh", defaultValue = "false") boolean refresh) {
        var cached = consoleRepository.findSchemas(id);
        if (!refresh && cached.isPresent()) {
            var cache = cached.get();
            return ResponseEntity.ok(CACHED + "\t" + cache.syncedAt() + "\n" + cache.content());
        }
        Optional<String> live = repository.find(id)
                .flatMap(connection -> agentHealthClient.sgbdSchemas(encode(connection)))
                .filter(report -> report.startsWith(OK_PREFIX))
                .map(report -> report.substring(OK_PREFIX.length()));
        if (live.isPresent()) {
            String syncedAt = Instant.now().toString();
            consoleRepository.saveSchemas(id, live.get(), syncedAt);
            return ResponseEntity.ok(LIVE + "\t" + syncedAt + "\n" + live.get());
        }
        return cached
                .map(cache -> ResponseEntity.ok(CACHED + "\t" + cache.syncedAt() + "\n" + cache.content()))
                .orElseGet(() -> ResponseEntity.status(UNPROCESSABLE).build());
    }

    @PostMapping(value = "/connections/{id}/schemas", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE,
            produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> createSchema(@PathVariable("id") long id, @RequestParam("name") String name) {
        String schema = name.strip();
        if (schema.isEmpty() || !DATABASE.matcher(schema).matches()) {
            return ResponseEntity.badRequest().body("Use letras, números, hífen, sublinhado ou cifrão.");
        }
        return repository.find(id)
                .flatMap(connection -> agentHealthClient.createSgbdSchema(schema, encode(connection)))
                .map(this::createResponse)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body("Agente indisponível."));
    }

    @DeleteMapping(value = "/connections/{id}/schemas/{name}", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> dropSchema(@PathVariable("id") long id, @PathVariable("name") String name) {
        if (name.isEmpty() || !DATABASE.matcher(name).matches()) {
            return ResponseEntity.badRequest().body("Nome de schema inválido.");
        }
        return repository.find(id)
                .flatMap(connection -> agentHealthClient.dropSgbdSchema(name, encode(connection)))
                .map(this::createResponse)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body("Agente indisponível."));
    }

    private ResponseEntity<String> createResponse(String report) {
        if (report.startsWith(OK_PREFIX)) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.status(UNPROCESSABLE).body(report.substring(FAILED_PREFIX.length()));
    }

    @GetMapping(value = "/connections/{id}/structure", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> structure(@PathVariable("id") long id) {
        Optional<String> live = repository.find(id)
                .flatMap(connection -> agentHealthClient.sgbdStructure(encode(connection)))
                .filter(report -> report.startsWith(OK_PREFIX))
                .map(report -> report.substring(OK_PREFIX.length()));
        if (live.isPresent()) {
            consoleRepository.saveStructure(id, live.get(), Instant.now().toString());
            return ResponseEntity.ok(live.get());
        }
        return consoleRepository.findStructure(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.ok(""));
    }

    @GetMapping(value = "/connections/{id}/consoles", produces = MediaType.APPLICATION_JSON_VALUE)
    public String consoles(@PathVariable("id") long id) {
        return consoleRepository.findByConnection(id).stream()
                .map(this::toJson)
                .collect(Collectors.joining(",", "[", "]"));
    }

    @PostMapping(value = "/connections/{id}/consoles", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> createConsole(@PathVariable("id") long id,
                                                @RequestParam(name = "schema", required = false) String schema) {
        if (repository.find(id).isEmpty() || (schema != null && !DATABASE.matcher(schema).matches())) {
            return ResponseEntity.badRequest().build();
        }
        String label = "console " + consoleRepository.nextConsoleNumber(id);
        long consoleId = consoleRepository.create(id, label, schema);
        return ResponseEntity.ok(toJson(new SgbdConsoleRepository.SgbdConsole(
                consoleId, label, schema, "", SgbdConsoleRepository.DEFAULT_EDITOR_PERCENT, false,
                SgbdConsoleRepository.DEFAULT_PAGE_SIZE, "", "", true)));
    }

    @PostMapping(value = "/connections/{id}/execute", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> execute(@PathVariable("id") long id,
                                          @RequestParam MultiValueMap<String, String> form,
                                          @RequestParam("request") String request) {
        String schema = form.getFirst("schema");
        List<String> statements = form.getOrDefault("statement", List.of());
        String database = schema == null ? "" : schema;
        int length = statements.stream().mapToInt(String::length).sum();
        String limit = String.valueOf(form.getFirst("limit"));
        String offset = String.valueOf(form.getFirst("offset"));
        long parsedOffset = offset.matches("\\d{1,15}") ? Long.parseLong(offset) : -1;
        if (!EXECUTION_REQUEST.matcher(request).matches() || statements.isEmpty() || length > MAX_QUERY_LENGTH || !DATABASE.matcher(database).matches()
                || statements.size() > MAX_STATEMENTS || !limit.matches("\\d{1,4}") || parsedOffset < 0
                || parsedOffset > MAX_PAGE_OFFSET
                || !PAGE_SIZES.contains(Integer.valueOf(limit))) {
            return ResponseEntity.badRequest().build();
        }
        Optional<SgbdConnectionRepository.SgbdConnection> connection = repository.find(id);
        if (connection.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        String encoded = Stream.concat(Stream.of(database, limit, offset), statements.stream())
                .map(field -> Base64.getEncoder().encodeToString(field.getBytes(StandardCharsets.UTF_8)))
                .collect(Collectors.joining("\n"));
        return agentHealthClient.executeSgbdStatements(request, encode(connection.get()) + "\n" + encoded)
                .map(this::testResponse)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body("Agente indisponível."));
    }

    @PostMapping(value = "/connections/{id}/execute/{request}/cancel", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> cancelExecution(@PathVariable("id") long id, @PathVariable("request") String request) {
        if (!EXECUTION_REQUEST.matcher(request).matches() || repository.find(id).isEmpty()) {
            return ResponseEntity.badRequest().build();
        }
        return agentHealthClient.cancelSgbdStatements(request)
                .map(this::testResponse)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body("Agente indisponível."));
    }

    @PutMapping(value = "/connections/{id}/active-tab", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<Void> saveActiveTab(@PathVariable("id") long id,
                                              @RequestParam(name = "console", defaultValue = "0") long console) {
        consoleRepository.saveActiveTab(id, console);
        return ResponseEntity.noContent().build();
    }

    @GetMapping(value = "/resume", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> resume() {
        return consoleRepository.findConnectionToResume()
                .map((id) -> ResponseEntity.ok(String.valueOf(id)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @DeleteMapping("/resume")
    public ResponseEntity<Void> clearResume() {
        consoleRepository.clearConnectionToResume();
        return ResponseEntity.noContent().build();
    }

    @PutMapping(value = "/consoles/{id}", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<Void> updateConsole(@PathVariable("id") long id,
                                              @RequestParam(name = "label", required = false) String label,
                                              @RequestParam(name = "query", required = false) String query,
                                              @RequestParam(name = "schema", required = false) String schema,
                                              @RequestParam(name = "editorPercent", required = false) Integer editorPercent,
                                              @RequestParam(name = "pageSize", required = false) Integer pageSize,
                                              @RequestParam(name = "log", required = false) String log,
                                              @RequestParam(name = "resultsMinimized", required = false) Boolean resultsMinimized) {
        if (schema != null && !DATABASE.matcher(schema).matches()) {
            return ResponseEntity.badRequest().build();
        }
        if (editorPercent != null && (editorPercent < MIN_EDITOR_PERCENT || editorPercent > MAX_EDITOR_PERCENT)) {
            return ResponseEntity.badRequest().build();
        }
        if (pageSize != null && !PAGE_SIZES.contains(pageSize)) {
            return ResponseEntity.badRequest().build();
        }
        if (log != null && log.length() > MAX_QUERY_LENGTH) {
            return ResponseEntity.badRequest().build();
        }
        if (log != null) {
            consoleRepository.updateOutputLog(id, log);
        }
        if (resultsMinimized != null) {
            consoleRepository.updateResultsMinimized(id, resultsMinimized);
        }
        if (editorPercent != null) {
            consoleRepository.updateEditorPercent(id, editorPercent);
        }
        if (pageSize != null) {
            consoleRepository.updatePageSize(id, pageSize);
        }
        if (schema != null) {
            consoleRepository.updateSchema(id, schema.isEmpty() ? null : schema);
        }
        if (label != null) {
            String name = label.strip();
            if (name.isEmpty() || name.length() > MAX_LABEL_LENGTH) {
                return ResponseEntity.badRequest().build();
            }
            consoleRepository.updateLabel(id, name);
        }
        if (query != null) {
            if (query.length() > MAX_QUERY_LENGTH) {
                return ResponseEntity.badRequest().build();
            }
            consoleRepository.updateQuery(id, query);
        }
        return ResponseEntity.noContent().build();
    }

    @PutMapping(value = "/consoles/{id}/results", consumes = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<Void> saveResults(@PathVariable("id") long id, @RequestBody(required = false) String results) {
        String content = results == null ? "" : results;
        if (content.length() > MAX_SAVED_RESULTS_LENGTH) {
            return ResponseEntity.badRequest().build();
        }
        consoleRepository.updateSavedResults(id, content);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/consoles/{id}")
    public ResponseEntity<Void> deleteConsole(@PathVariable("id") long id) {
        consoleRepository.delete(id);
        return ResponseEntity.noContent().build();
    }

    private String toJson(SgbdConsoleRepository.SgbdConsole console) {
        return "{\"id\":" + console.id()
                + ",\"label\":" + JsonStrings.quote(console.label())
                + ",\"schema\":" + JsonStrings.quote(console.schemaName())
                + ",\"query\":" + JsonStrings.quote(console.queryText())
                + ",\"editorPercent\":" + console.editorPercent()
                + ",\"active\":" + console.active()
                + ",\"pageSize\":" + console.pageSize()
                + ",\"log\":" + JsonStrings.quote(console.outputLog())
                + ",\"results\":" + JsonStrings.quote(console.savedResults())
                + ",\"resultsMinimized\":" + console.resultsMinimized() + "}";
    }

    private ResponseEntity<String> testResponse(String report) {
        if (report.startsWith(OK_PREFIX)) {
            return ResponseEntity.ok(report.substring(OK_PREFIX.length()));
        }
        return ResponseEntity.status(UNPROCESSABLE).body(report.substring(FAILED_PREFIX.length()));
    }

    private boolean isValid(SgbdConnectionRepository.SgbdConnection connection) {
        return KINDS.contains(connection.kind())
                && !connection.name().isEmpty()
                && connection.name().length() <= MAX_NAME_LENGTH
                && connection.name().codePoints().noneMatch(Character::isISOControl)
                && HOST.matcher(connection.host()).matches()
                && connection.port() > 0 && connection.port() <= MAX_PORT
                && connection.username().length() <= MAX_TEXT_LENGTH
                && connection.password().length() <= MAX_TEXT_LENGTH
                && DATABASE.matcher(connection.databaseName()).matches();
    }

    private List<String> normalizeSelectedSchemas(List<String> schemas) {
        if (schemas == null) {
            return List.of();
        }
        return schemas.stream().map(String::strip).distinct().toList();
    }

    private boolean areValidSelectedSchemas(List<String> schemas) {
        return schemas.size() <= MAX_SELECTED_SCHEMAS
                && schemas.stream().allMatch(schema -> !schema.isEmpty() && DATABASE.matcher(schema).matches());
    }

    private List<String> selectedSchemas(SgbdConnectionRepository.SgbdConnection connection) {
        return connection.selectedSchemas().isEmpty() ? List.of() : connection.selectedSchemas().lines().toList();
    }

    private String encode(SgbdConnectionRepository.SgbdConnection target) {
        return Stream.of(target.kind(), target.host(), String.valueOf(target.port()), target.username(),
                        target.password(), target.databaseName(), String.valueOf(target.ssl()))
                .map(field -> Base64.getEncoder().encodeToString(field.getBytes(StandardCharsets.UTF_8)))
                .collect(Collectors.joining("\n"));
    }

    private String toJson(SgbdConnectionRepository.SgbdConnection connection) {
        return "{\"id\":" + connection.id()
                + ",\"name\":" + JsonStrings.quote(connection.name())
                + ",\"kind\":" + JsonStrings.quote(connection.kind())
                + ",\"host\":" + JsonStrings.quote(connection.host())
                + ",\"port\":" + connection.port()
                + ",\"username\":" + JsonStrings.quote(connection.username())
                + ",\"hasPassword\":" + !connection.password().isEmpty()
                + ",\"passwordMask\":" + JsonStrings.quote("*".repeat(connection.password().length()))
                + ",\"database\":" + JsonStrings.quote(connection.databaseName())
                + ",\"ssl\":" + connection.ssl()
                + ",\"autoPing\":" + connection.autoPing()
                + ",\"autoPingFailures\":" + connection.autoPingFailures()
                + ",\"showAllSchemas\":" + connection.showAllSchemas()
                + ",\"showSystemSchemas\":" + connection.showSystemSchemas()
                + ",\"selectedSchemas\":" + selectedSchemas(connection).stream()
                        .map(JsonStrings::quote)
                        .collect(Collectors.joining(",", "[", "]")) + "}";
    }
}
