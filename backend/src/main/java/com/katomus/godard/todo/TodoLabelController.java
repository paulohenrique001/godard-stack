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
public class TodoLabelController {

  private static final int MAX_NAME_LENGTH = 50;

  public record LabelRequest(String name, String color) {}

  private final TodoProjectRepository projectRepository;
  private final TodoLabelRepository labelRepository;

  public TodoLabelController(
      TodoProjectRepository projectRepository, TodoLabelRepository labelRepository) {
    this.projectRepository = projectRepository;
    this.labelRepository = labelRepository;
  }

  @GetMapping(
      value = "/api/todo/projects/{projectId}/labels",
      produces = MediaType.APPLICATION_JSON_VALUE)
  public List<TodoLabel> list(@PathVariable long projectId) {
    requireProject(projectId);
    return labelRepository.findByProject(projectId);
  }

  @PostMapping(
      value = "/api/todo/projects/{projectId}/labels",
      consumes = MediaType.APPLICATION_JSON_VALUE,
      produces = MediaType.APPLICATION_JSON_VALUE)
  public TodoLabel create(@PathVariable long projectId, @RequestBody LabelRequest request) {
    requireProject(projectId);
    return labelRepository.create(
        projectId,
        validatedName(request == null ? null : request.name()),
        validatedColor(request == null ? null : request.color()));
  }

  @PutMapping(
      value = "/api/todo/labels/{id}",
      consumes = MediaType.APPLICATION_JSON_VALUE,
      produces = MediaType.APPLICATION_JSON_VALUE)
  public TodoLabel update(@PathVariable long id, @RequestBody LabelRequest request) {
    TodoLabel label = requireLabel(id);
    if (label.system()) {
      throw new ResponseStatusException(
          HttpStatus.FORBIDDEN, "Labels de sistema não podem ser editadas.");
    }
    if (request == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Label inválida.");
    }
    return labelRepository.update(
        label, validatedName(request.name()), validatedColor(request.color()));
  }

  @DeleteMapping("/api/todo/labels/{id}")
  public ResponseEntity<Void> delete(@PathVariable long id) {
    TodoLabel label = requireLabel(id);
    if (label.system()) {
      throw new ResponseStatusException(
          HttpStatus.FORBIDDEN, "Labels de sistema não podem ser excluídas.");
    }
    labelRepository.delete(id);
    return ResponseEntity.noContent().build();
  }

  private void requireProject(long projectId) {
    projectRepository
        .find(projectId)
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Projeto não encontrado."));
  }

  private TodoLabel requireLabel(long id) {
    return labelRepository
        .find(id)
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Label não encontrada."));
  }

  private static String validatedName(String value) {
    String name = value == null ? "" : value.strip();
    if (name.isEmpty() || name.length() > MAX_NAME_LENGTH || name.indexOf('\u0000') >= 0) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nome de label inválido.");
    }
    return name;
  }

  private static String validatedColor(String value) {
    if (value == null || !value.strip().matches("#[0-9a-fA-F]{6}")) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cor inválida.");
    }
    return value.strip();
  }
}
