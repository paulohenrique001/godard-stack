package com.godardstack;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

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

import com.godardstack.TerminalTabRepository.TerminalTab;

@RestController
@RequestMapping(value = "/api/terminals", produces = MediaType.APPLICATION_JSON_VALUE)
public class TerminalTabController {

    private static final int MAX_NAME_LENGTH = 15;

    private final TerminalTabRepository repository;
    private final TerminalTranscriptRepository transcriptRepository;
    private final AgentHealthClient agentHealthClient;
    private final TerminalHandler terminalHandler;
    private final ActivityLogRepository activityLogRepository;

    public TerminalTabController(TerminalTabRepository repository,
                                 TerminalTranscriptRepository transcriptRepository,
                                 AgentHealthClient agentHealthClient,
                                 TerminalHandler terminalHandler,
                                 ActivityLogRepository activityLogRepository) {
        this.repository = repository;
        this.transcriptRepository = transcriptRepository;
        this.agentHealthClient = agentHealthClient;
        this.terminalHandler = terminalHandler;
        this.activityLogRepository = activityLogRepository;
    }

    @GetMapping
    public synchronized String list() {
        return toJson(ensureOneTab(), agentHealthClient.activeSessions());
    }

    @GetMapping(value = "/{id}/transcript", produces = "text/plain;charset=UTF-8")
    public String transcript(@PathVariable long id) {
        return transcriptRepository.find(id);
    }

    @DeleteMapping("/{id}/transcript")
    public ResponseEntity<Void> clearTranscript(@PathVariable long id) {
        terminalHandler.discardTranscript(id);
        transcriptRepository.replace(id, "");
        repository.find(id).ifPresent(tab -> activityLogRepository.create("console", "muted", "Sessão do " + label(tab) + " limpa"));
        return ResponseEntity.noContent().build();
    }

    @PostMapping
    public synchronized ResponseEntity<String> create() {
        List<TerminalTab> tabs = repository.findAll();
        int number = lowestFreeNumber(tabs);
        repository.create(number);
        activityLogRepository.create("console", "muted", "Console \"console " + number + "\" criado");
        return ResponseEntity.ok(toJson(repository.findAll()));
    }

    @DeleteMapping("/{id}")
    public synchronized String delete(@PathVariable long id) {
        List<TerminalTab> before = repository.findAll();
        TerminalTab removed = before.stream().filter(tab -> tab.id() == id).findFirst().orElse(null);
        int index = before.stream().map(TerminalTab::id).toList().indexOf(id);
        repository.delete(id);
        agentHealthClient.closeSession(id);
        if (removed != null) {
            activityLogRepository.create("console", "muted", "Console \"" + label(removed) + "\" removido");
        }

        List<TerminalTab> remaining = repository.findAll();
        if (remaining.isEmpty()) {
            return toJson(ensureOneTab());
        }
        if (remaining.stream().noneMatch(TerminalTab::active)) {
            int next = Math.min(Math.max(index, 0), remaining.size() - 1);
            repository.activate(remaining.get(next).id());
        }
        return toJson(repository.findAll());
    }

    @PutMapping("/{id}/active")
    public synchronized ResponseEntity<Void> activate(@PathVariable long id) {
        repository.activate(id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping(value = "/{id}/name", consumes = MediaType.TEXT_PLAIN_VALUE)
    public synchronized ResponseEntity<Void> rename(@PathVariable long id, @RequestBody String body) {
        String name = body.strip();
        if (name.isEmpty() || name.length() > MAX_NAME_LENGTH || name.codePoints().anyMatch(Character::isISOControl)) {
            return ResponseEntity.badRequest().build();
        }
        repository.rename(id, name);
        return ResponseEntity.noContent().build();
    }

    private List<TerminalTab> ensureOneTab() {
        List<TerminalTab> tabs = repository.findAll();
        if (!tabs.isEmpty()) {
            return tabs;
        }
        repository.create(1);
        return repository.findAll();
    }

    private int lowestFreeNumber(List<TerminalTab> tabs) {
        Set<Integer> used = tabs.stream().map(TerminalTab::number).collect(Collectors.toSet());
        int number = 1;
        while (used.contains(number)) {
            number++;
        }
        return number;
    }

    private String label(TerminalTab tab) {
        return tab.name() == null ? "console " + tab.number() : tab.name();
    }

    private String toJson(List<TerminalTab> tabs) {
        return toJson(tabs, Set.of());
    }

    private String toJson(List<TerminalTab> tabs, Set<Long> activeSessions) {
        return tabs.stream()
                .map(tab -> "{\"id\":" + tab.id() + ",\"number\":" + tab.number()
                        + ",\"active\":" + tab.active() + ",\"name\":" + JsonStrings.quote(tab.name())
                        + ",\"cwd\":" + JsonStrings.quote(tab.cwd())
                        + ",\"alive\":" + activeSessions.contains(tab.id()) + "}")
                .collect(Collectors.joining(",", "[", "]"));
    }
}
