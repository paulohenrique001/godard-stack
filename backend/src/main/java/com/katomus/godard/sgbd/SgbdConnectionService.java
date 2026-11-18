package com.katomus.godard.sgbd;

import com.katomus.godard.persistence.ActivityRepository;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class SgbdConnectionService {

  private static final Pattern HOST = Pattern.compile("[A-Za-z0-9._:-]{1,255}");
  private static final Pattern SQL_DATABASE = Pattern.compile("[A-Za-z0-9_$-]{0,64}");
  private static final Pattern REDIS_DATABASE = Pattern.compile("\\d{1,5}");
  private static final int MAX_NAME_LENGTH = 60;
  private static final int MAX_USERNAME_LENGTH = 200;
  private static final int MAX_PASSWORD_LENGTH = 512;
  private static final int MAX_SELECTED_SCHEMAS = 256;
  private static final int MAX_COMMAND_LENGTH = 256 * 1024;
  private static final int MAX_CONSOLE_LABEL_LENGTH = 40;
  private static final int MIN_CONSOLE_EDITOR_PERCENT = 30;
  private static final int MAX_CONSOLE_EDITOR_PERCENT = 70;
  private static final int MAX_CONSOLE_LOG_LENGTH = 256 * 1024;
  private static final int MAX_CONSOLE_RESULT_LENGTH = 1024 * 1024;
  private static final Set<String> SQL_SYSTEM_SCHEMAS =
      Set.of("information_schema", "mysql", "performance_schema", "sys");

  private final SgbdConnectionRepository repository;
  private final SgbdConsoleRepository consoleRepository;
  private final SqlDatabaseClient sqlClient;
  private final RedisDatabaseClient redisClient;
  private final ActivityRepository activityRepository;

  SgbdConnectionService(
      SgbdConnectionRepository repository,
      SgbdConsoleRepository consoleRepository,
      SqlDatabaseClient sqlClient,
      RedisDatabaseClient redisClient,
      ActivityRepository activityRepository) {
    this.repository = repository;
    this.consoleRepository = consoleRepository;
    this.sqlClient = sqlClient;
    this.redisClient = redisClient;
    this.activityRepository = activityRepository;
  }

  List<SgbdConnectionView> list() {
    return repository.findAllViews();
  }

  @Transactional
  synchronized SgbdConnectionView create(SgbdConnectionDraft draft) {
    SgbdConnectionRepository.ConnectionValues values = values(draft, password(draft));
    long id = repository.create(values);
    activityRepository.create("connection", "success", "Conexão \"" + values.name() + "\" criada");
    return repository.findAllViews().stream()
        .filter(connection -> connection.id() == id)
        .findFirst()
        .orElseThrow(() -> new IllegalStateException("A conexão salva não foi encontrada."));
  }

  @Transactional
  synchronized SgbdConnectionView update(long id, SgbdConnectionDraft draft) {
    if (draft == null) {
      throw new SgbdException(HttpStatus.BAD_REQUEST, "Informe os dados da conexão.");
    }
    SgbdConnection current = required(id);
    String password = draft.passwordChanged() ? password(draft) : current.password();
    SgbdConnectionRepository.ConnectionValues values = values(draft, password);
    repository.update(id, values);
    activityRepository.create(
        "connection", "muted", "Conexão \"" + values.name() + "\" atualizada");
    return repository.findAllViews().stream()
        .filter(connection -> connection.id() == id)
        .findFirst()
        .orElseThrow(() -> new IllegalStateException("A conexão salva não foi encontrada."));
  }

  @Transactional
  synchronized void select(long id) {
    required(id);
    repository.select(id);
  }

  @Transactional
  synchronized void delete(long id) {
    SgbdConnection connection = required(id);
    repository.delete(id);
    activityRepository.create(
        "connection", "muted", "Conexão \"" + connection.name() + "\" removida");
  }

  SgbdHealth test(SgbdConnectionDraft draft, Long existingId) {
    if (draft == null) {
      throw new SgbdException(HttpStatus.BAD_REQUEST, "Informe os dados da conexão.");
    }
    SgbdConnectionRepository.ConnectionValues values;
    if (existingId == null) {
      values = values(draft, password(draft));
    } else {
      SgbdConnection current = required(existingId);
      if (!draft.passwordChanged() && differsFrom(current, draft)) {
        throw new SgbdException(
            HttpStatus.BAD_REQUEST,
            "Informe a senha novamente para testar mudanças ainda não salvas.");
      }
      values = values(draft, draft.passwordChanged() ? password(draft) : current.password());
    }
    return test(target(values));
  }

  SgbdHealth testSaved(long id) {
    return test(target(required(id)));
  }

  SgbdStructure structure(long id) {
    SgbdConnection connection = required(id);
    if (connection.kind() == DatabaseKind.REDIS) {
      return SgbdStructure.empty();
    }
    try {
      SgbdStructure structure = sqlClient.structure(target(connection));
      Set<String> selected = selectedSchemas(connection);
      return new SgbdStructure(
          structure.schemas().stream()
              .filter(
                  schema ->
                      (connection.showSystemSchemas()
                              || !SQL_SYSTEM_SCHEMAS.contains(
                                  schema.name().toLowerCase(Locale.ROOT)))
                          && (connection.showAllSchemas() || selected.contains(schema.name())))
              .toList());
    } catch (SgbdClientException exception) {
      throw new SgbdException(HttpStatus.UNPROCESSABLE_CONTENT, exception.getMessage());
    }
  }

  List<SgbdConsoleView> consoles(long connectionId) {
    required(connectionId);
    return consoleRepository.findViewsByConnection(connectionId);
  }

  @Transactional
  synchronized SgbdConsoleView createConsole(long connectionId, SgbdConsoleDraft draft) {
    SgbdConnection connection = required(connectionId);
    String database =
        consoleDatabaseName(connection.kind(), draft == null ? null : draft.database());
    String label = "console " + consoleRepository.nextConsoleNumber(connectionId);
    SgbdConsoleRepository.ConsoleValues values =
        new SgbdConsoleRepository.ConsoleValues(
            label, database, initialConsoleQuery(connection.kind()), 50, "", "", true);
    long consoleId = consoleRepository.create(connectionId, values);
    repository.select(connectionId);
    consoleRepository.selectActive(connectionId, consoleId);
    return consoleRepository
        .find(consoleId)
        .map(consoleRepository::view)
        .orElseThrow(() -> new IllegalStateException("O console salvo não foi encontrado."));
  }

  @Transactional
  synchronized void selectConsole(long connectionId, Long consoleId) {
    required(connectionId);
    if (consoleId != null) {
      SgbdConsoleRepository.SgbdConsole console = requiredConsole(consoleId);
      if (console.connectionId() != connectionId) {
        throw new SgbdException(HttpStatus.NOT_FOUND, "Console não encontrado para esta conexão.");
      }
    }
    repository.select(connectionId);
    consoleRepository.selectActive(connectionId, consoleId);
  }

  @Transactional
  synchronized SgbdConsoleView updateConsole(long id, SgbdConsoleUpdate update) {
    if (update == null) {
      throw new SgbdException(HttpStatus.BAD_REQUEST, "Informe os dados do console.");
    }
    SgbdConsoleRepository.SgbdConsole current = requiredConsole(id);
    SgbdConnection connection = required(current.connectionId());
    String label = update.label() == null ? current.label() : consoleLabel(update.label());
    String database =
        update.database() == null
            ? current.database()
            : consoleDatabaseName(connection.kind(), update.database());
    String query =
        update.query() == null
            ? current.query()
            : consoleText(
                update.query(), MAX_COMMAND_LENGTH, "A consulta excede o tamanho permitido.");
    int editorPercent =
        update.editorPercent() == null
            ? current.editorPercent()
            : editorPercent(update.editorPercent());
    String outputLog =
        update.outputLog() == null
            ? current.outputLog()
            : consoleText(
                update.outputLog(),
                MAX_CONSOLE_LOG_LENGTH,
                "O histórico do console excede o tamanho permitido.");
    String savedResult =
        update.savedResult() == null
            ? current.savedResult()
            : consoleText(
                update.savedResult(),
                MAX_CONSOLE_RESULT_LENGTH,
                "O resultado salvo excede o tamanho permitido.");
    boolean resultsMinimized =
        update.resultsMinimized() == null ? current.resultsMinimized() : update.resultsMinimized();
    SgbdConsoleRepository.ConsoleValues values =
        new SgbdConsoleRepository.ConsoleValues(
            label, database, query, editorPercent, outputLog, savedResult, resultsMinimized);
    consoleRepository.update(id, values);
    return new SgbdConsoleView(
        id,
        label,
        database,
        query,
        editorPercent,
        current.active(),
        outputLog,
        savedResult,
        resultsMinimized);
  }

  @Transactional
  synchronized void deleteConsole(long id) {
    requiredConsole(id);
    consoleRepository.delete(id);
  }

  SgbdQueryResult execute(long id, String command, String requestedDatabase) {
    String query = command == null ? "" : command.strip();
    if (query.isEmpty() || query.length() > MAX_COMMAND_LENGTH) {
      throw new SgbdException(HttpStatus.BAD_REQUEST, "Informe um comando de até 256 KiB.");
    }
    SgbdConnection connection = required(id);
    String database =
        requestedDatabase == null
            ? connection.databaseName()
            : databaseName(connection.kind(), requestedDatabase);
    try {
      return clientFor(connection.kind()).execute(target(connection, database), query);
    } catch (SgbdClientException exception) {
      throw new SgbdException(HttpStatus.UNPROCESSABLE_CONTENT, exception.getMessage());
    }
  }

  private SgbdHealth test(ConnectionTarget target) {
    try {
      return clientFor(target.kind()).test(target);
    } catch (SgbdClientException exception) {
      throw new SgbdException(HttpStatus.UNPROCESSABLE_CONTENT, exception.getMessage());
    }
  }

  private SgbdClient clientFor(DatabaseKind kind) {
    return kind == DatabaseKind.REDIS ? redisClient : sqlClient;
  }

  private SgbdConnection required(long id) {
    return repository
        .find(id)
        .orElseThrow(() -> new SgbdException(HttpStatus.NOT_FOUND, "Conexão não encontrada."));
  }

  private SgbdConsoleRepository.SgbdConsole requiredConsole(long id) {
    return consoleRepository
        .find(id)
        .orElseThrow(() -> new SgbdException(HttpStatus.NOT_FOUND, "Console não encontrado."));
  }

  private SgbdConnectionRepository.ConnectionValues values(
      SgbdConnectionDraft draft, String password) {
    if (draft == null) {
      throw new SgbdException(HttpStatus.BAD_REQUEST, "Informe os dados da conexão.");
    }
    DatabaseKind kind =
        DatabaseKind.from(draft.kind())
            .orElseThrow(
                () -> new SgbdException(HttpStatus.BAD_REQUEST, "Tipo de banco não suportado."));
    String name = normalized(draft.name());
    String host = normalized(draft.host());
    String username = safe(draft.username());
    String database = databaseName(kind, draft.database());
    List<String> selectedSchemas = selectedSchemas(kind, draft.selectedSchemas());
    if (name.isEmpty() || name.length() > MAX_NAME_LENGTH || containsControl(name)) {
      throw new SgbdException(HttpStatus.BAD_REQUEST, "Informe um nome de conexão válido.");
    }
    if (!HOST.matcher(host).matches()) {
      throw new SgbdException(HttpStatus.BAD_REQUEST, "Informe um host válido.");
    }
    if (draft.port() == null || draft.port() < 1 || draft.port() > 65_535) {
      throw new SgbdException(HttpStatus.BAD_REQUEST, "Informe uma porta entre 1 e 65535.");
    }
    if (username.length() > MAX_USERNAME_LENGTH || containsControl(username)) {
      throw new SgbdException(HttpStatus.BAD_REQUEST, "Informe um usuário válido.");
    }
    if (password.length() > MAX_PASSWORD_LENGTH) {
      throw new SgbdException(HttpStatus.BAD_REQUEST, "A senha excede o tamanho permitido.");
    }
    return new SgbdConnectionRepository.ConnectionValues(
        name,
        kind,
        host,
        draft.port(),
        username,
        password,
        database,
        draft.ssl(),
        draft.autoPing(),
        draft.showAllSchemas(),
        draft.showSystemSchemas(),
        selectedSchemas);
  }

  private static ConnectionTarget target(SgbdConnectionRepository.ConnectionValues values) {
    return new ConnectionTarget(
        values.kind(),
        values.host(),
        values.port(),
        values.username(),
        values.password(),
        values.databaseName(),
        values.ssl());
  }

  private static ConnectionTarget target(SgbdConnection connection) {
    return new ConnectionTarget(
        connection.kind(),
        connection.host(),
        connection.port(),
        connection.username(),
        connection.password(),
        connection.databaseName(),
        connection.ssl());
  }

  private static ConnectionTarget target(SgbdConnection connection, String database) {
    return new ConnectionTarget(
        connection.kind(),
        connection.host(),
        connection.port(),
        connection.username(),
        connection.password(),
        database,
        connection.ssl());
  }

  private static String databaseName(DatabaseKind kind, String value) {
    String database = normalized(value);
    if ((kind == DatabaseKind.MARIADB || kind == DatabaseKind.MYSQL)
        && !SQL_DATABASE.matcher(database).matches()) {
      throw new SgbdException(HttpStatus.BAD_REQUEST, "Informe um banco padrão válido.");
    }
    if (kind == DatabaseKind.REDIS && !REDIS_DATABASE.matcher(database).matches()) {
      throw new SgbdException(
          HttpStatus.BAD_REQUEST, "O banco Redis deve ser um número entre 0 e 99999.");
    }
    return database;
  }

  private static String consoleDatabaseName(DatabaseKind kind, String value) {
    String database = normalized(value);
    return database.isEmpty() ? "" : databaseName(kind, database);
  }

  private static String initialConsoleQuery(DatabaseKind kind) {
    return kind == DatabaseKind.REDIS ? "PING" : "SELECT 1;";
  }

  private static String consoleLabel(String value) {
    String label = normalized(value);
    if (label.isEmpty() || label.length() > MAX_CONSOLE_LABEL_LENGTH || containsControl(label)) {
      throw new SgbdException(HttpStatus.BAD_REQUEST, "Informe um nome de console válido.");
    }
    return label;
  }

  private static int editorPercent(int value) {
    if (value < MIN_CONSOLE_EDITOR_PERCENT || value > MAX_CONSOLE_EDITOR_PERCENT) {
      throw new SgbdException(
          HttpStatus.BAD_REQUEST, "A altura do editor deve ficar entre 30% e 70%.");
    }
    return value;
  }

  private static String consoleText(String value, int limit, String message) {
    String text = safe(value);
    if (text.length() > limit) {
      throw new SgbdException(HttpStatus.BAD_REQUEST, message);
    }
    return text;
  }

  private static List<String> selectedSchemas(DatabaseKind kind, List<String> values) {
    if (values == null || values.isEmpty()) {
      return List.of();
    }
    if (values.size() > MAX_SELECTED_SCHEMAS) {
      throw new SgbdException(HttpStatus.BAD_REQUEST, "Selecione no máximo 256 schemas.");
    }
    List<String> selected = new ArrayList<>();
    for (String value : values) {
      String schema = databaseName(kind, value);
      if (schema.isEmpty()) {
        throw new SgbdException(HttpStatus.BAD_REQUEST, "Informe um schema válido.");
      }
      if (!selected.contains(schema)) {
        selected.add(schema);
      }
    }
    return List.copyOf(selected);
  }

  private static Set<String> selectedSchemas(SgbdConnection connection) {
    if (connection.selectedSchemas().isBlank()) {
      return Set.of();
    }
    return connection
        .selectedSchemas()
        .lines()
        .collect(java.util.stream.Collectors.toCollection(HashSet::new));
  }

  private static boolean differsFrom(SgbdConnection current, SgbdConnectionDraft draft) {
    return !current.kind().value().equals(draft.kind())
        || !current.host().equals(normalized(draft.host()))
        || draft.port() == null
        || current.port() != draft.port()
        || !current.username().equals(safe(draft.username()))
        || !current.databaseName().equals(normalized(draft.database()))
        || current.ssl() != draft.ssl();
  }

  private static String password(SgbdConnectionDraft draft) {
    return safe(draft == null ? null : draft.password());
  }

  private static String normalized(String value) {
    return safe(value).strip();
  }

  private static String safe(String value) {
    return value == null ? "" : value;
  }

  private static boolean containsControl(String value) {
    return value.codePoints().anyMatch(Character::isISOControl);
  }
}
