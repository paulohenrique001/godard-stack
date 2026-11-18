package com.katomus.godard.terminal;

import com.katomus.godard.persistence.ActivityRepository;
import java.util.List;
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
@RequestMapping(value = "/api/commands", produces = MediaType.APPLICATION_JSON_VALUE)
public class SavedCommandController {

  private static final int MAX_COMMAND_LENGTH = 500;

  private final TerminalAccessService accessService;
  private final SavedCommandRepository commandRepository;
  private final ActivityRepository activityRepository;

  public SavedCommandController(
      TerminalAccessService accessService,
      SavedCommandRepository commandRepository,
      ActivityRepository activityRepository) {
    this.accessService = accessService;
    this.commandRepository = commandRepository;
    this.activityRepository = activityRepository;
  }

  @GetMapping
  public List<SavedCommandRepository.SavedCommand> list() {
    accessService.requireEnabled();
    return commandRepository.findAll();
  }

  @PostMapping(consumes = MediaType.TEXT_PLAIN_VALUE)
  public SavedCommandRepository.SavedCommand create(@RequestBody String body) {
    accessService.requireEnabled();
    SavedCommandRepository.SavedCommand command = commandRepository.create(validated(body));
    activityRepository.create("command", "muted", "Comando salvo");
    return command;
  }

  @PutMapping(value = "/{id}", consumes = MediaType.TEXT_PLAIN_VALUE)
  public ResponseEntity<Void> update(@PathVariable long id, @RequestBody String body) {
    accessService.requireEnabled();
    requireCommand(id);
    commandRepository.update(id, validated(body));
    return ResponseEntity.noContent().build();
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable long id) {
    accessService.requireEnabled();
    requireCommand(id);
    commandRepository.delete(id);
    activityRepository.create("command", "muted", "Comando salvo removido");
    return ResponseEntity.noContent().build();
  }

  private void requireCommand(long id) {
    if (commandRepository.find(id).isEmpty()) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Comando não encontrado.");
    }
  }

  private static String validated(String body) {
    String command = body.strip();
    if (command.isEmpty()
        || command.length() > MAX_COMMAND_LENGTH
        || command.indexOf('\u0000') >= 0) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Comando inválido.");
    }
    return command;
  }
}
