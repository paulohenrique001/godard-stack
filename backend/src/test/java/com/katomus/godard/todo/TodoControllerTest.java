package com.katomus.godard.todo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.server.ResponseStatusException;

class TodoControllerTest {

  @Test
  void createsNormalizedLocalTask() {
    CapturingTodoRepository repository = new CapturingTodoRepository();
    TodoController controller = new TodoController(repository);

    TodoItem created =
        controller.create(new TodoController.CreateTodoRequest("  Revisar migração  "));

    assertEquals("Revisar migração", repository.createdTitle);
    assertEquals(repository.item, created);
  }

  @Test
  void rejectsInvalidTasksAndMissingItems() {
    CapturingTodoRepository repository = new CapturingTodoRepository();
    TodoController controller = new TodoController(repository);

    ResponseStatusException invalid =
        assertThrows(
            ResponseStatusException.class,
            () -> controller.create(new TodoController.CreateTodoRequest("  ")));
    ResponseStatusException missing =
        assertThrows(
            ResponseStatusException.class,
            () -> controller.update(99, new TodoController.UpdateTodoRequest("Tarefa", false)));

    assertEquals(HttpStatus.BAD_REQUEST, invalid.getStatusCode());
    assertEquals(HttpStatus.NOT_FOUND, missing.getStatusCode());
  }

  private static final class CapturingTodoRepository extends TodoItemRepository {

    private final TodoItem item =
        new TodoItem(1, "Revisar migração", false, "2026-11-11T00:00:00Z", null);
    private String createdTitle;

    private CapturingTodoRepository() {
      super((JdbcClient) null);
    }

    @Override
    public List<TodoItem> findAll() {
      return List.of(item);
    }

    @Override
    public Optional<TodoItem> find(long id) {
      return id == item.id() ? Optional.of(item) : Optional.empty();
    }

    @Override
    public TodoItem create(String title) {
      createdTitle = title;
      return item;
    }
  }
}
