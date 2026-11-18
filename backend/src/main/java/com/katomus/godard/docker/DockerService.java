package com.katomus.godard.docker;

import com.katomus.godard.persistence.ActivityRepository;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
class DockerService {

  private static final Pattern CONTAINER_ID = Pattern.compile("[a-f0-9]{12,64}");
  private static final Pattern CREATED_AT =
      Pattern.compile("^(\\d{4})-(\\d{2})-(\\d{2}) (\\d{2}:\\d{2})");
  private static final Pattern RUNNING_STATUS = Pattern.compile("^Up (.+?)(?: \\((.+)\\))?$");
  private static final Pattern EXITED_STATUS = Pattern.compile("^Exited \\((\\d+)\\) (.+) ago$");
  private static final Pattern HEALTH_STATUS =
      Pattern.compile("\\((healthy|unhealthy|health: starting)\\)", Pattern.CASE_INSENSITIVE);
  private static final Pattern COMPOSE_CONFIG_FILE =
      Pattern.compile(
          "(?:^|,)com\\.docker\\.compose\\.project\\.config_files=(.*?)(?=,[a-z0-9.-]+=|$)");
  private static final int MAX_FAILURE_LENGTH = 500;

  private final DockerClient client;
  private final ObjectMapper objectMapper;
  private final Consumer<String> activityRecorder;
  private final String selfId;

  @Autowired
  DockerService(
      DockerClient client,
      ObjectMapper objectMapper,
      ActivityRepository activityRepository,
      @Value("${HOSTNAME:}") String hostname) {
    this(
        client,
        objectMapper,
        message -> activityRepository.create("container", "muted", message),
        hostname);
  }

  DockerService(
      DockerClient client,
      ObjectMapper objectMapper,
      Consumer<String> activityRecorder,
      String hostname) {
    this.client = client;
    this.objectMapper = objectMapper;
    this.activityRecorder = activityRecorder;
    this.selfId = validContainerId(hostname) ? hostname : "";
  }

  List<DockerContainer> containers() {
    DockerCommandResult result = client.containers();
    if (!result.successful()) {
      throw failure(
          result, HttpStatus.SERVICE_UNAVAILABLE, "O Docker não está acessível nesta instalação.");
    }
    try {
      List<DockerContainer> containers = new ArrayList<>();
      for (String line : result.output().lines().toList()) {
        if (!line.isBlank()) {
          containers.add(container(objectMapper.readTree(line)));
        }
      }
      containers.sort(Comparator.comparing(DockerContainer::name, String.CASE_INSENSITIVE_ORDER));
      return List.copyOf(containers);
    } catch (Exception exception) {
      throw new DockerException(
          HttpStatus.BAD_GATEWAY, "O Docker retornou uma lista de contêineres inválida.");
    }
  }

  DockerMetrics metrics(String id) {
    requireContainerId(id);
    DockerCommandResult result = client.metrics(id);
    if (!result.successful()) {
      throw failure(
          result,
          HttpStatus.UNPROCESSABLE_CONTENT,
          "Não foi possível consultar as métricas do container.");
    }
    String[] fields = result.output().strip().split("\\t", -1);
    if (fields.length < 4) {
      throw new DockerException(
          HttpStatus.BAD_GATEWAY, "O Docker retornou métricas inválidas para o container.");
    }
    return new DockerMetrics(percent(fields[1]), blankToNull(fields[2]), percent(fields[3]));
  }

  void action(String id, String requestedAction) {
    requireContainerId(id);
    DockerAction action =
        DockerAction.from(requestedAction)
            .orElseThrow(
                () -> new DockerException(HttpStatus.BAD_REQUEST, "Ação Docker não suportada."));
    if (action.blocksProtectedContainer() && isProtected(id)) {
      throw new DockerException(HttpStatus.FORBIDDEN, "Este é o container da própria aplicação.");
    }
    DockerCommandResult result = client.action(action, id);
    if (!result.successful()) {
      throw failure(
          result,
          HttpStatus.UNPROCESSABLE_CONTENT,
          "Não foi possível concluir a ação no container.");
    }
    activityRecorder.accept("Container " + action.activity());
  }

  Process followLogs(String id) throws IOException {
    requireContainerId(id);
    return client.followLogs(id);
  }

  void requireShellAccess(String id) {
    requireContainerId(id);
    if (isProtected(id)) {
      throw new DockerException(HttpStatus.FORBIDDEN, "Este é o container da própria aplicação.");
    }
  }

  boolean isProtected(String id) {
    return !selfId.isEmpty() && id.startsWith(selfId);
  }

  static boolean validContainerId(String id) {
    return id != null && CONTAINER_ID.matcher(id).matches();
  }

  private DockerContainer container(JsonNode node) {
    String id = value(node, "ID");
    if (!validContainerId(id)) {
      throw new IllegalArgumentException("invalid id");
    }
    String state = value(node, "State").toLowerCase(Locale.ROOT);
    String rawStatus = value(node, "Status");
    String composeFile = composeFile(value(node, "Labels"));
    return new DockerContainer(
        id,
        value(node, "Names"),
        value(node, "Image"),
        createdAt(value(node, "CreatedAt")),
        state,
        "running".equals(state),
        status(rawStatus),
        health(rawStatus),
        ports(value(node, "Ports")),
        isProtected(id),
        composeFile != null,
        composeFile);
  }

  private static String value(JsonNode node, String field) {
    return node.path(field).asString("");
  }

  private static String composeFile(String labels) {
    Matcher matcher = COMPOSE_CONFIG_FILE.matcher(labels);
    if (!matcher.find()) {
      return null;
    }
    String value = matcher.group(1).split(",", 2)[0].strip();
    return value.isEmpty() ? null : value;
  }

  private static String createdAt(String value) {
    Matcher matcher = CREATED_AT.matcher(value);
    return matcher.find()
        ? matcher.group(3)
            + "/"
            + matcher.group(2)
            + "/"
            + matcher.group(1)
            + " "
            + matcher.group(4)
        : value;
  }

  private static List<String> ports(String value) {
    if (value.isBlank()) {
      return List.of();
    }
    return value
        .lines()
        .flatMap(line -> java.util.Arrays.stream(line.split(",\\s*")))
        .filter(port -> !port.isBlank() && !port.startsWith("[::]"))
        .map(port -> port.replace("->", " → ").replace("/tcp", ""))
        .toList();
  }

  private static String health(String status) {
    Matcher matcher = HEALTH_STATUS.matcher(status);
    if (!matcher.find()) {
      return null;
    }
    String value = matcher.group(1).toLowerCase(Locale.ROOT);
    return "health: starting".equals(value) ? "starting" : value;
  }

  private static String status(String value) {
    Matcher running = RUNNING_STATUS.matcher(value);
    if (running.matches()) {
      String health = running.group(2);
      String suffix =
          "healthy".equals(health)
              ? " (saudável)"
              : "unhealthy".equals(health) ? " (com problemas)" : "";
      return "Ativo há " + duration(running.group(1)) + suffix;
    }
    Matcher exited = EXITED_STATUS.matcher(value);
    if (exited.matches()) {
      String code = "0".equals(exited.group(1)) ? "" : " (código " + exited.group(1) + ")";
      return "Parado há " + duration(exited.group(2)) + code;
    }
    return value;
  }

  private static String duration(String value) {
    return value
        .replaceFirst("(?i)^about a minute", "cerca de 1 minuto")
        .replaceFirst("(?i)^about an hour", "cerca de 1 hora")
        .replaceFirst("(?i)^less than a second", "menos de 1 segundo")
        .replaceAll("(?i)\\bseconds?\\b", "segundos")
        .replaceAll("(?i)\\bminutes?\\b", "minutos")
        .replaceAll("(?i)\\bhours?\\b", "horas")
        .replaceAll("(?i)\\bdays?\\b", "dias")
        .replaceAll("(?i)\\bweeks?\\b", "semanas")
        .replaceAll("(?i)\\bmonths?\\b", "meses")
        .replaceAll("(?i)\\byears?\\b", "anos")
        .replace("1 segundos", "1 segundo")
        .replace("1 minutos", "1 minuto")
        .replace("1 horas", "1 hora")
        .replace("1 dias", "1 dia")
        .replace("1 semanas", "1 semana")
        .replace("1 meses", "1 mês")
        .replace("1 anos", "1 ano");
  }

  private static Double percent(String value) {
    try {
      double parsed = Double.parseDouble(value.replace("%", "").strip());
      return Double.isFinite(parsed) ? parsed : null;
    } catch (NumberFormatException exception) {
      return null;
    }
  }

  private static String blankToNull(String value) {
    String normalized = value.strip();
    return normalized.isEmpty() ? null : normalized;
  }

  static void requireContainerId(String id) {
    if (!validContainerId(id)) {
      throw new DockerException(HttpStatus.BAD_REQUEST, "Identificador de container inválido.");
    }
  }

  private static DockerException failure(
      DockerCommandResult result, HttpStatus status, String fallback) {
    if (result.timedOut()) {
      return new DockerException(
          HttpStatus.GATEWAY_TIMEOUT, "O Docker não respondeu no tempo esperado.");
    }
    if (result.outputLimitReached()) {
      return new DockerException(status, "A saída do Docker excedeu o limite seguro.");
    }
    String detail =
        result.output() == null ? "" : result.output().replaceAll("[\\r\\n]+", " ").strip();
    if (detail.isEmpty()) {
      return new DockerException(status, fallback);
    }
    return new DockerException(
        status,
        fallback + " " + detail.substring(0, Math.min(detail.length(), MAX_FAILURE_LENGTH)));
  }
}
