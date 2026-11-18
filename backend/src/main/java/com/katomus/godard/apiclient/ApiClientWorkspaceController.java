package com.katomus.godard.apiclient;

import java.util.List;
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
@RequestMapping(value = "/api/client", produces = MediaType.APPLICATION_JSON_VALUE)
public class ApiClientWorkspaceController {

  public record CollectionInput(String name, String description) {}

  public record FolderInput(long collectionId, Long parentId, String name) {}

  public record FolderUpdateInput(String name) {}

  public record VariableInput(long collectionId, String name, String value) {}

  public record VariableUpdateInput(String name, String value) {}

  public record ReorderInput(List<Long> ids) {}

  public record MoveRequestInput(Long collectionId, Long folderId) {}

  private final ApiClientWorkspaceService service;

  public ApiClientWorkspaceController(ApiClientWorkspaceService service) {
    this.service = service;
  }

  @GetMapping("/workspace")
  public ApiClientWorkspace workspace() {
    return service.workspace();
  }

  @PostMapping(value = "/collections", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ApiClientCollection createCollection(@RequestBody CollectionInput input) {
    return service.createCollection(
        input == null ? null : input.name(), input == null ? null : input.description());
  }

  @PutMapping(value = "/collections/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ApiClientCollection updateCollection(
      @PathVariable long id, @RequestBody CollectionInput input) {
    return service.updateCollection(
        id, input == null ? null : input.name(), input == null ? null : input.description());
  }

  @DeleteMapping("/collections/{id}")
  public ResponseEntity<Void> deleteCollection(@PathVariable long id) {
    service.deleteCollection(id);
    return ResponseEntity.noContent().build();
  }

  @PutMapping(value = "/collections/order", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Void> reorderCollections(@RequestBody ReorderInput input) {
    service.reorderCollections(input == null ? null : input.ids());
    return ResponseEntity.noContent().build();
  }

  @PutMapping(value = "/folders/order", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Void> reorderFolders(@RequestBody ReorderInput input) {
    service.reorderFolders(input == null ? null : input.ids());
    return ResponseEntity.noContent().build();
  }

  @PutMapping(value = "/requests/order", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Void> reorderRequests(@RequestBody ReorderInput input) {
    service.reorderRequests(input == null ? null : input.ids());
    return ResponseEntity.noContent().build();
  }

  @PutMapping(value = "/requests/{id}/move", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ApiClientSavedRequest moveRequest(
      @PathVariable long id, @RequestBody MoveRequestInput input) {
    if (input == null) return service.moveRequest(id, null, null);
    return service.moveRequest(id, input.collectionId(), input.folderId());
  }

  @PostMapping(value = "/folders", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ApiClientFolder createFolder(@RequestBody FolderInput input) {
    if (input == null) {
      return service.createFolder(0, null, null);
    }
    return service.createFolder(input.collectionId(), input.parentId(), input.name());
  }

  @PutMapping(value = "/folders/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ApiClientFolder updateFolder(@PathVariable long id, @RequestBody FolderUpdateInput input) {
    return service.updateFolder(id, input == null ? null : input.name());
  }

  @DeleteMapping("/folders/{id}")
  public ResponseEntity<Void> deleteFolder(@PathVariable long id) {
    service.deleteFolder(id);
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/requests/{id}")
  public ApiClientSavedRequest request(@PathVariable long id) {
    return service.request(id);
  }

  @PostMapping(value = "/requests", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ApiClientSavedRequest createRequest(@RequestBody ApiClientRequestDraft input) {
    return service.createRequest(input);
  }

  @PutMapping(value = "/requests/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ApiClientSavedRequest updateRequest(
      @PathVariable long id, @RequestBody ApiClientRequestDraft input) {
    return service.updateRequest(id, input);
  }

  @DeleteMapping("/requests/{id}")
  public ResponseEntity<Void> deleteRequest(@PathVariable long id) {
    service.deleteRequest(id);
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/collections/{id}/variables")
  public List<ApiClientVariable> variables(@PathVariable long id) {
    return service.variables(id);
  }

  @PostMapping(value = "/variables", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ApiClientVariable createVariable(@RequestBody VariableInput input) {
    if (input == null) return service.createVariable(0, null, null);
    return service.createVariable(input.collectionId(), input.name(), input.value());
  }

  @PutMapping(value = "/variables/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ApiClientVariable updateVariable(
      @PathVariable long id, @RequestBody VariableUpdateInput input) {
    if (input == null) return service.updateVariable(id, null, null);
    return service.updateVariable(id, input.name(), input.value());
  }

  @DeleteMapping("/variables/{id}")
  public ResponseEntity<Void> deleteVariable(@PathVariable long id) {
    service.deleteVariable(id);
    return ResponseEntity.noContent().build();
  }

  @PutMapping(value = "/workspace/state", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ApiClientWorkspaceState saveViewState(@RequestBody ApiClientWorkspaceState input) {
    return service.saveViewState(input);
  }
}
