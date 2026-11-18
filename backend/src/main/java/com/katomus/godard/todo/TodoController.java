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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping(value = "/api/todos", produces = MediaType.APPLICATION_JSON_VALUE)
public class TodoController {

  private static final int MAX_TITLE_LENGTH = 280;

  public record CreateTodoRequest(String title) {}

  public record UpdateTodoRequest(String title, boolean completed) {}

  private final TodoItemRepository repository;

  public TodoController(TodoItemRepository repository) {
    this.repository = repository;
  }

  @GetMapping
  public List<TodoItem> list() {
    return repository.findAll();
  }

  @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
  public TodoItem create(@RequestBody CreateTodoRequest request) {
    return repository.create(validatedTitle(request == null ? null : request.title()));
  }

  @PutMapping(value = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
  public TodoItem update(@PathVariable long id, @RequestBody UpdateTodoRequest request) {
    TodoItem item = requireItem(id);
    if (request == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tarefa inválida.");
    }
    return repository.update(item, validatedTitle(request.title()), request.completed());
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable long id) {
    requireItem(id);
    repository.delete(id);
    return ResponseEntity.noContent().build();
  }

  private TodoItem requireItem(long id) {
    return repository
        .find(id)
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tarefa não encontrada."));
  }

  private static String validatedTitle(String value) {
    String title = value == null ? "" : value.strip();
    if (title.isEmpty() || title.length() > MAX_TITLE_LENGTH || title.indexOf('\u0000') >= 0) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tarefa inválida.");
    }
    return title;
  }
}
