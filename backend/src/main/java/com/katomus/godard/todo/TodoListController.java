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
public class TodoListController {

  private static final int MAX_DESC_LENGTH = 500;

  public record CreateListRequest(Long labelId, String description) {}

  public record UpdateListRequest(Long labelId, String description) {}

  public record CreateListResponse(TodoList list, TodoLabel label) {}

  public record ReorderRequest(List<Long> ids) {}

  private final TodoProjectRepository projectRepository;
  private final TodoLabelRepository labelRepository;
  private final TodoListRepository listRepository;

  public TodoListController(
      TodoProjectRepository projectRepository,
      TodoLabelRepository labelRepository,
      TodoListRepository listRepository) {
    this.projectRepository = projectRepository;
    this.labelRepository = labelRepository;
    this.listRepository = listRepository;
  }

  @GetMapping(
      value = "/api/todo/projects/{projectId}/lists",
      produces = MediaType.APPLICATION_JSON_VALUE)
  public List<TodoList> list(@PathVariable long projectId) {
    requireProject(projectId);
    return listRepository.findByProject(projectId);
  }

  @PostMapping(
      value = "/api/todo/projects/{projectId}/lists",
      consumes = MediaType.APPLICATION_JSON_VALUE,
      produces = MediaType.APPLICATION_JSON_VALUE)
  public CreateListResponse create(
      @PathVariable long projectId, @RequestBody CreateListRequest request) {
    requireProject(projectId);
    if (request == null || request.labelId() == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Requisição inválida.");
    }
    String desc = request.description() == null ? "" : request.description().strip();
    if (desc.length() > MAX_DESC_LENGTH) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Descrição muito longa.");
    }
    TodoLabel label =
        labelRepository
            .find(request.labelId())
            .filter(l -> l.projectId() == projectId)
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Label não encontrada."));
    TodoList todoList = listRepository.create(projectId, label.id(), desc);
    return new CreateListResponse(todoList, label);
  }

  @PutMapping(
      value = "/api/todo/lists/{id}",
      consumes = MediaType.APPLICATION_JSON_VALUE,
      produces = MediaType.APPLICATION_JSON_VALUE)
  public CreateListResponse update(@PathVariable long id, @RequestBody UpdateListRequest request) {
    TodoList list =
        listRepository
            .find(id)
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lista não encontrada."));
    if (request == null || request.labelId() == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Requisição inválida.");
    }
    String desc = request.description() == null ? "" : request.description().strip();
    if (desc.length() > MAX_DESC_LENGTH) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Descrição muito longa.");
    }
    TodoLabel label =
        labelRepository
            .find(request.labelId())
            .filter(l -> l.projectId() == list.projectId())
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Label não encontrada."));
    TodoList updated = listRepository.update(id, label.id(), desc);
    return new CreateListResponse(updated, label);
  }

  @DeleteMapping("/api/todo/lists/{id}")
  public ResponseEntity<Void> delete(@PathVariable long id) {
    listRepository
        .find(id)
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lista não encontrada."));
    listRepository.delete(id);
    return ResponseEntity.noContent().build();
  }

  @PutMapping(
      value = "/api/todo/projects/{projectId}/lists/order",
      consumes = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Void> reorder(
      @PathVariable long projectId, @RequestBody ReorderRequest request) {
    requireProject(projectId);
    if (request == null || request.ids() == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Lista de IDs inválida.");
    }
    listRepository.reorder(projectId, request.ids());
    return ResponseEntity.ok().build();
  }

  private void requireProject(long projectId) {
    projectRepository
        .find(projectId)
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Projeto não encontrado."));
  }
}
