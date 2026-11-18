package com.godardstack;

import java.util.function.Consumer;
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

@RestController
@RequestMapping(value = "/api/commands", produces = MediaType.APPLICATION_JSON_VALUE)
public class SavedCommandController {

    private static final int MAX_COMMAND_LENGTH = 500;

    private final SavedCommandRepository repository;
    private final ActivityLogRepository activityLogRepository;

    public SavedCommandController(SavedCommandRepository repository, ActivityLogRepository activityLogRepository) {
        this.repository = repository;
        this.activityLogRepository = activityLogRepository;
    }

    @GetMapping
    public synchronized String list() {
        repository.seedDefaults();
        return toJson();
    }

    @PostMapping(consumes = MediaType.TEXT_PLAIN_VALUE)
    public synchronized ResponseEntity<String> create(@RequestBody String body) {
        return save(body, command -> {
            repository.create(command);
            activityLogRepository.create("command", "muted", "Comando salvo criado");
        });
    }

    @PutMapping(value = "/{id}", consumes = MediaType.TEXT_PLAIN_VALUE)
    public synchronized ResponseEntity<String> update(@PathVariable long id, @RequestBody String body) {
        return save(body, command -> {
            if (repository.find(id).isPresent()) {
                repository.update(id, command);
                activityLogRepository.create("command", "muted", "Comando salvo editado");
            }
        });
    }

    @DeleteMapping("/{id}")
    public synchronized String delete(@PathVariable long id) {
        if (repository.find(id).isPresent()) {
            repository.delete(id);
            activityLogRepository.create("command", "muted", "Comando salvo removido");
        }
        return toJson();
    }

    private ResponseEntity<String> save(String body, Consumer<String> action) {
        String command = body.strip();
        if (command.isEmpty()
                || command.length() > MAX_COMMAND_LENGTH
                || command.codePoints().anyMatch(Character::isISOControl)) {
            return ResponseEntity.badRequest().build();
        }
        action.accept(command);
        return ResponseEntity.ok(toJson());
    }

    private String toJson() {
        return repository.findAll().stream()
                .map(saved -> "{\"id\":" + saved.id() + ",\"command\":" + JsonStrings.quote(saved.command()) + "}")
                .collect(Collectors.joining(",", "[", "]"));
    }
}
