package com.katomus.godard.todo;

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
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class TodoProjectController {

  private static final int MAX_ICON_LENGTH = 64;
  private static final int MAX_NAME_LENGTH = 100;
  private static final int MAX_DESCRIPTION_LENGTH = 500;

  public record ProjectRequest(String icon, String name, String description) {}

  private final TodoProjectRepository repository;
  private final TodoLabelRepository labelRepository;
  private final TodoListRepository listRepository;

  public TodoProjectController(
      TodoProjectRepository repository,
      TodoLabelRepository labelRepository,
      TodoListRepository listRepository) {
    this.repository = repository;
    this.labelRepository = labelRepository;
    this.listRepository = listRepository;
  }

  @GetMapping(value = "/api/todo/projects", produces = MediaType.APPLICATION_JSON_VALUE)
  public List<TodoProject> list() {
    return repository.findAll();
  }

  @PostMapping(
      value = "/api/todo/projects",
      consumes = MediaType.APPLICATION_JSON_VALUE,
      produces = MediaType.APPLICATION_JSON_VALUE)
  public TodoProject create(@RequestBody ProjectRequest request) {
    TodoProject project =
        repository.create(
            validatedIcon(request == null ? null : request.icon()),
            validatedName(request == null ? null : request.name()),
            validatedDescription(request == null ? null : request.description()));
    labelRepository.createSystem(project.id(), "Open", "#94a3b8", 0);
    labelRepository.createSystem(project.id(), "Closed", "#94a3b8", 1);
    TodoLabel todo = labelRepository.create(project.id(), "To-do", "#6366f1");
    listRepository.create(project.id(), todo.id(), "");
    TodoLabel doing = labelRepository.create(project.id(), "Doing", "#3b82f6");
    listRepository.create(project.id(), doing.id(), "");
    TodoLabel done = labelRepository.create(project.id(), "Done", "#22c55e");
    listRepository.create(project.id(), done.id(), "");
    return project;
  }

  @PutMapping(
      value = "/api/todo/projects/{id}",
      consumes = MediaType.APPLICATION_JSON_VALUE,
      produces = MediaType.APPLICATION_JSON_VALUE)
  public TodoProject update(@PathVariable long id, @RequestBody ProjectRequest request) {
    TodoProject project = requireProject(id);
    if (request == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Projeto inválido.");
    }
    return repository.update(
        project,
        validatedIcon(request.icon()),
        validatedName(request.name()),
        validatedDescription(request.description()));
  }

  @DeleteMapping("/api/todo/projects/{id}")
  public ResponseEntity<Void> delete(@PathVariable long id) {
    requireProject(id);
    repository.delete(id);
    return ResponseEntity.noContent().build();
  }

  private TodoProject requireProject(long id) {
    return repository
        .find(id)
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Projeto não encontrado."));
  }

  private static String validatedIcon(String value) {
    String icon = value == null ? "" : value.strip();
    if (icon.isEmpty() || icon.length() > MAX_ICON_LENGTH) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ícone inválido.");
    }
    return icon;
  }

  private static String validatedName(String value) {
    String name = value == null ? "" : value.strip();
    if (name.length() < 3 || name.length() > MAX_NAME_LENGTH || name.indexOf('\u0000') >= 0) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nome de projeto inválido.");
    }
    return name;
  }

  private static String validatedDescription(String value) {
    String desc = value == null ? "" : value.strip();
    if (desc.length() > MAX_DESCRIPTION_LENGTH) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Descrição muito longa.");
    }
    return desc;
  }
}
