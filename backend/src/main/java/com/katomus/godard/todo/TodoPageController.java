package com.katomus.godard.todo;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class TodoPageController {

  private static final int MAX_ICON_LENGTH = 64;
  private static final int MAX_TITLE_LENGTH = 60;
  private static final int MAX_CONTENT_LENGTH = 100_000;

  public record PageRequest(
      String icon, String title, String content, List<Long> labelIds, String dueDate) {}

  public record LabelAssignRequest(List<Long> labelIds) {}

  public record ReorderRequest(List<Long> ids) {}

  private final TodoProjectRepository projectRepository;
  private final TodoLabelRepository labelRepository;
  private final TodoPageRepository pageRepository;

  public TodoPageController(
      TodoProjectRepository projectRepository,
      TodoLabelRepository labelRepository,
      TodoPageRepository pageRepository) {
    this.projectRepository = projectRepository;
    this.labelRepository = labelRepository;
    this.pageRepository = pageRepository;
  }

  @GetMapping(
      value = "/api/todo/projects/{projectId}/pages",
      produces = MediaType.APPLICATION_JSON_VALUE)
  public List<TodoPage> listByProject(@PathVariable long projectId) {
    requireProject(projectId);
    return pageRepository.findByProject(projectId);
  }

  @PostMapping(
      value = "/api/todo/projects/{projectId}/pages",
      consumes = MediaType.APPLICATION_JSON_VALUE,
      produces = MediaType.APPLICATION_JSON_VALUE)
  public TodoPage createPage(@PathVariable long projectId, @RequestBody PageRequest request) {
    requireProject(projectId);
    if (request == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Página inválida.");
    }
    var page =
        pageRepository.create(
            projectId,
            validatedIcon(request.icon()),
            validatedTitle(request.title()),
            validatedContent(request.content()),
            validatedDueDate(request.dueDate()));
    var labelIds = validatedLabelIds(projectId, request.labelIds());
    if (!labelIds.isEmpty()) {
      pageRepository.setLabels(page.id(), labelIds);
    }
    return pageRepository.find(page.id()).orElseThrow();
  }

  @PutMapping(
      value = "/api/todo/pages/{id}",
      consumes = MediaType.APPLICATION_JSON_VALUE,
      produces = MediaType.APPLICATION_JSON_VALUE)
  public TodoPage updatePage(@PathVariable long id, @RequestBody PageRequest request) {
    TodoPage page = requirePage(id);
    if (request == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Página inválida.");
    }
    var updated =
        pageRepository.update(
            page,
            validatedIcon(request.icon()),
            validatedTitle(request.title()),
            validatedContent(request.content()),
            validatedDueDate(request.dueDate()));
    var labelIds = validatedLabelIds(page.projectId(), request.labelIds());
    pageRepository.setLabels(updated.id(), labelIds);
    return pageRepository.find(updated.id()).orElseThrow();
  }

  @PatchMapping(
      value = "/api/todo/pages/{id}/labels",
      consumes = MediaType.APPLICATION_JSON_VALUE,
      produces = MediaType.APPLICATION_JSON_VALUE)
  public TodoPage assignLabels(@PathVariable long id, @RequestBody LabelAssignRequest request) {
    TodoPage page = requirePage(id);
    if (request == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Requisição inválida.");
    }
    var labelIds = validatedLabelIds(page.projectId(), request.labelIds());
    pageRepository.setLabels(id, labelIds);
    return pageRepository.find(id).orElseThrow();
  }

  @PutMapping(value = "/api/todo/pages/reorder", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Void> reorder(@RequestBody ReorderRequest request) {
    if (request == null || request.ids() == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Lista de IDs inválida.");
    }
    pageRepository.reorder(request.ids());
    return ResponseEntity.ok().build();
  }

  @DeleteMapping("/api/todo/pages/{id}")
  public ResponseEntity<Void> deletePage(@PathVariable long id) {
    requirePage(id);
    pageRepository.delete(id);
    return ResponseEntity.noContent().build();
  }

  private void requireProject(long projectId) {
    projectRepository
        .find(projectId)
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Projeto não encontrado."));
  }

  private TodoPage requirePage(long id) {
    return pageRepository
        .find(id)
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Página não encontrada."));
  }

  private List<Long> validatedLabelIds(long projectId, List<Long> labelIds) {
    if (labelIds == null || labelIds.isEmpty()) return List.of();
    Set<Long> projectLabelIds =
        labelRepository.findByProject(projectId).stream()
            .map(TodoLabel::id)
            .collect(Collectors.toSet());
    for (long labelId : labelIds) {
      if (!projectLabelIds.contains(labelId)) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Label inválida.");
      }
    }
    return labelIds;
  }

  private static String validatedIcon(String value) {
    String icon = value == null ? "" : value.strip();
    if (icon.isEmpty() || icon.length() > MAX_ICON_LENGTH) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ícone inválido.");
    }
    return icon;
  }

  private static String validatedTitle(String value) {
    String title = value == null ? "" : value.strip();
    if (title.isEmpty() || title.length() > MAX_TITLE_LENGTH || title.indexOf('\u0000') >= 0) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Título inválido.");
    }
    return title;
  }

  private static String validatedContent(String value) {
    String content = value == null ? "" : value;
    if (content.length() > MAX_CONTENT_LENGTH) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Conteúdo muito longo.");
    }
    return content;
  }

  private static String validatedDueDate(String value) {
    if (value == null || value.isBlank()) return null;
    String date = value.strip();
    if (!date.matches("\\d{4}-\\d{2}-\\d{2}")) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Data inválida.");
    }
    return date;
  }
}
