package com.katomus.godard.docker;

import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/api/docker", produces = MediaType.APPLICATION_JSON_VALUE)
public class DockerController {

  public record DockerViewStateRequest(String containerName, String tab, Boolean showStopped) {}

  public record DockerStreamTicket(String ticket) {

    @Override
    public String toString() {
      return "DockerStreamTicket[ticket=<redacted>]";
    }
  }

  public record DockerContainerRequest(String name, String compose, String env) {

    @Override
    public String toString() {
      return "DockerContainerRequest[name=<redacted>, compose=<redacted>, env=<redacted>]";
    }
  }

  private static final Set<String> TABS = Set.of("logs", "compose", "env", "shell", "output");
  private static final int MAX_CONTAINER_NAME_LENGTH = 255;

  private final DockerService dockerService;
  private final DockerComposeService composeService;
  private final DockerViewStateRepository viewStateRepository;
  private final DockerStreamTicketService ticketService;

  DockerController(
      DockerService dockerService,
      DockerComposeService composeService,
      DockerViewStateRepository viewStateRepository,
      DockerStreamTicketService ticketService) {
    this.dockerService = dockerService;
    this.composeService = composeService;
    this.viewStateRepository = viewStateRepository;
    this.ticketService = ticketService;
  }

  @GetMapping("/containers")
  public List<DockerContainer> containers() {
    return dockerService.containers();
  }

  @GetMapping("/containers/{id}/metrics")
  public DockerMetrics metrics(@PathVariable String id) {
    return dockerService.metrics(id);
  }

  @PostMapping("/containers/{id}/{action}")
  public ResponseEntity<Void> action(@PathVariable String id, @PathVariable String action) {
    dockerService.action(id, action);
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/containers/{id}/files")
  public DockerComposeFiles files(@PathVariable String id) {
    return composeService.files(id);
  }

  @PutMapping(value = "/containers/{id}/files", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Void> saveFiles(
      @PathVariable String id, @RequestBody DockerComposeFilesRequest request) {
    composeService.save(id, request);
    return ResponseEntity.noContent().build();
  }

  @PostMapping(value = "/containers", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Void> create(@RequestBody DockerContainerRequest request) {
    if (request == null) {
      throw new DockerException(HttpStatus.BAD_REQUEST, "Informe a configuração do container.");
    }
    composeService.create(
        request.name(), new DockerComposeFilesRequest(request.compose(), request.env()));
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/containers/{id}/logs/ticket")
  public DockerStreamTicket logsTicket(@PathVariable String id) {
    if (!DockerService.validContainerId(id)) {
      throw new DockerException(HttpStatus.BAD_REQUEST, "Identificador de container inválido.");
    }
    return new DockerStreamTicket(ticketService.issue(DockerStreamTicketService.Purpose.LOGS, id));
  }

  @PostMapping("/containers/{id}/shell/ticket")
  public DockerStreamTicket shellTicket(@PathVariable String id) {
    dockerService.requireShellAccess(id);
    return new DockerStreamTicket(ticketService.issue(DockerStreamTicketService.Purpose.SHELL, id));
  }

  @PostMapping("/containers/{id}/update/ticket")
  public DockerStreamTicket updateTicket(@PathVariable String id) {
    composeService.requireUpdatable(id);
    return new DockerStreamTicket(
        ticketService.issue(DockerStreamTicketService.Purpose.UPDATE, id));
  }

  @GetMapping("/state")
  public DockerViewState state() {
    return viewStateRepository.find();
  }

  @PutMapping(value = "/state", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Void> saveState(@RequestBody DockerViewStateRequest request) {
    if (request == null) {
      throw new DockerException(HttpStatus.BAD_REQUEST, "Informe a visualização do Docker.");
    }
    String name = request.containerName() == null ? "" : request.containerName().strip();
    String tab = request.tab() == null ? "logs" : request.tab();
    if (name.length() > MAX_CONTAINER_NAME_LENGTH
        || hasControlCharacter(name)
        || !TABS.contains(tab)) {
      throw new DockerException(HttpStatus.BAD_REQUEST, "Visualização do Docker inválida.");
    }
    viewStateRepository.save(
        new DockerViewState(
            name.isEmpty() ? null : name,
            tab,
            request.showStopped() == null || request.showStopped()));
    return ResponseEntity.noContent().build();
  }

  @ExceptionHandler(DockerException.class)
  public ResponseEntity<String> failure(DockerException exception) {
    return ResponseEntity.status(exception.status())
        .contentType(MediaType.TEXT_PLAIN)
        .body(exception.getMessage());
  }

  private static boolean hasControlCharacter(String value) {
    return value.codePoints().anyMatch(Character::isISOControl);
  }
}
