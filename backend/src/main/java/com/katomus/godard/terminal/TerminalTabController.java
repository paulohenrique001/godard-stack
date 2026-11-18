package com.katomus.godard.terminal;

import com.katomus.godard.persistence.ActivityRepository;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping(value = "/api/terminals", produces = MediaType.APPLICATION_JSON_VALUE)
public class TerminalTabController {

  public record TerminalTabResponse(
      long id, int number, boolean active, String name, String cwd, boolean alive) {}

  public record TerminalTicketResponse(String ticket) {}

  private static final int MAX_NAME_LENGTH = 15;

  private final TerminalAccessService accessService;
  private final TerminalTabRepository tabRepository;
  private final TerminalTranscriptRepository transcriptRepository;
  private final TerminalSessionManager sessionManager;
  private final TerminalTicketService ticketService;
  private final ActivityRepository activityRepository;

  public TerminalTabController(
      TerminalAccessService accessService,
      TerminalTabRepository tabRepository,
      TerminalTranscriptRepository transcriptRepository,
      TerminalSessionManager sessionManager,
      TerminalTicketService ticketService,
      ActivityRepository activityRepository) {
    this.accessService = accessService;
    this.tabRepository = tabRepository;
    this.transcriptRepository = transcriptRepository;
    this.sessionManager = sessionManager;
    this.ticketService = ticketService;
    this.activityRepository = activityRepository;
  }

  @GetMapping
  public synchronized List<TerminalTabResponse> list() {
    accessService.requireEnabled();
    return responses(tabRepository.ensureOne());
  }

  @PostMapping
  public synchronized List<TerminalTabResponse> create() {
    accessService.requireEnabled();
    List<TerminalTabRepository.TerminalTab> tabs = tabRepository.createNext();
    TerminalTabRepository.TerminalTab created = tabs.getLast();
    activityRepository.create(
        "console", "muted", "Console \"console " + created.number() + "\" criado");
    return responses(tabs);
  }

  @GetMapping(value = "/{id}/transcript", produces = "text/plain;charset=UTF-8")
  public String transcript(@PathVariable long id) {
    accessService.requireEnabled();
    requireTab(id);
    return transcriptRepository.find(id);
  }

  @DeleteMapping("/{id}/transcript")
  public ResponseEntity<Void> clearTranscript(@PathVariable long id) {
    accessService.requireEnabled();
    TerminalTabRepository.TerminalTab tab = requireTab(id);
    sessionManager.discardTranscript(id);
    transcriptRepository.replace(id, "");
    activityRepository.create("console", "muted", "Sessão do " + label(tab) + " limpa");
    return ResponseEntity.noContent().build();
  }

  @DeleteMapping("/{id}")
  public synchronized List<TerminalTabResponse> delete(@PathVariable long id) {
    accessService.requireEnabled();
    List<TerminalTabRepository.TerminalTab> before = tabRepository.findAll();
    TerminalTabRepository.TerminalTab removed =
        before.stream()
            .filter(tab -> tab.id() == id)
            .findFirst()
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Console não encontrado."));
    int index = before.indexOf(removed);
    tabRepository.delete(id);
    sessionManager.close(id);
    activityRepository.create("console", "muted", "Console \"" + label(removed) + "\" removido");
    List<TerminalTabRepository.TerminalTab> remaining = tabRepository.findAll();
    if (remaining.isEmpty()) {
      return responses(tabRepository.ensureOne());
    }
    if (remaining.stream().noneMatch(TerminalTabRepository.TerminalTab::active)) {
      tabRepository.activate(
          remaining.get(Math.min(Math.max(index, 0), remaining.size() - 1)).id());
      remaining = tabRepository.findAll();
    }
    return responses(remaining);
  }

  @PutMapping("/{id}/active")
  public ResponseEntity<Void> activate(@PathVariable long id) {
    accessService.requireEnabled();
    requireTab(id);
    tabRepository.activate(id);
    return ResponseEntity.noContent().build();
  }

  @PutMapping(value = "/{id}/name", consumes = MediaType.TEXT_PLAIN_VALUE)
  public ResponseEntity<Void> rename(@PathVariable long id, @RequestBody String body) {
    accessService.requireEnabled();
    String name = body.strip();
    if (name.isEmpty()
        || name.length() > MAX_NAME_LENGTH
        || name.codePoints().anyMatch(Character::isISOControl)) {
      return ResponseEntity.badRequest().build();
    }
    requireTab(id);
    tabRepository.rename(id, name);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/{id}/ticket")
  public TerminalTicketResponse ticket(@PathVariable long id) {
    accessService.requireEnabled();
    requireTab(id);
    return new TerminalTicketResponse(ticketService.issue(id));
  }

  private TerminalTabRepository.TerminalTab requireTab(long id) {
    return tabRepository
        .find(id)
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Console não encontrado."));
  }

  private List<TerminalTabResponse> responses(List<TerminalTabRepository.TerminalTab> tabs) {
    Set<Long> live =
        tabs.stream()
            .filter(tab -> sessionManager.alive(tab.id()))
            .map(TerminalTabRepository.TerminalTab::id)
            .collect(Collectors.toSet());
    return tabs.stream()
        .map(
            tab ->
                new TerminalTabResponse(
                    tab.id(),
                    tab.number(),
                    tab.active(),
                    tab.name(),
                    tab.cwd(),
                    live.contains(tab.id())))
        .toList();
  }

  private static String label(TerminalTabRepository.TerminalTab tab) {
    return tab.name() == null ? "console " + tab.number() : tab.name();
  }
}
