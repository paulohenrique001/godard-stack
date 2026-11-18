package com.katomus.godard.apiclient;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
class ApiClientWorkspaceService {

  private static final Set<String> METHODS = Set.of("GET", "POST", "PUT", "PATCH", "DELETE");
  private static final int MAX_COLLECTION_NAME_LENGTH = 80;
  private static final int MAX_COLLECTION_DESCRIPTION_LENGTH = 500;
  private static final int MAX_FOLDER_NAME_LENGTH = 80;
  private static final int MAX_REQUEST_NAME_LENGTH = 100;
  private static final int MAX_VARIABLE_NAME_LENGTH = 80;
  private static final int MAX_VARIABLE_VALUE_LENGTH = 4_096;
  private static final int MAX_URL_LENGTH = 8_192;
  private static final int MAX_HEADERS = 30;
  private static final int MAX_HEADER_NAME_LENGTH = 128;
  private static final int MAX_HEADER_VALUE_LENGTH = 4_096;
  private static final int MAX_BODY_BYTES = 1_024 * 1_024;
  private static final int MAX_OPEN_REQUESTS = 12;

  private final ApiClientWorkspaceRepository repository;

  ApiClientWorkspaceService(ApiClientWorkspaceRepository repository) {
    this.repository = repository;
  }

  synchronized ApiClientWorkspace workspace() {
    List<ApiClientCollection> collections = repository.collections();
    List<ApiClientFolder> folders = repository.folders();
    List<ApiClientRequestSummary> requests = repository.requests();
    List<ApiClientVariable> variables = repository.variables();
    return new ApiClientWorkspace(
        collections,
        folders,
        requests,
        variables,
        normalizeState(repository.viewState(), requests));
  }

  ApiClientSavedRequest request(long id) {
    return requiredRequest(id);
  }

  @Transactional
  synchronized ApiClientCollection createCollection(String name, String description) {
    return repository.createCollection(
        requiredText(name, MAX_COLLECTION_NAME_LENGTH, "Informe o nome da coleção."),
        optionalText(description, MAX_COLLECTION_DESCRIPTION_LENGTH));
  }

  @Transactional
  synchronized ApiClientCollection updateCollection(long id, String name, String description) {
    requiredCollection(id);
    return repository.updateCollection(
        id,
        requiredText(name, MAX_COLLECTION_NAME_LENGTH, "Informe o nome da coleção."),
        optionalText(description, MAX_COLLECTION_DESCRIPTION_LENGTH));
  }

  @Transactional
  synchronized void deleteCollection(long id) {
    requiredCollection(id);
    repository.deleteCollection(id);
    reconcileViewState();
  }

  @Transactional
  synchronized ApiClientFolder createFolder(long collectionId, Long parentId, String name) {
    requiredCollection(collectionId);
    if (parentId != null && requiredFolder(parentId).collectionId() != collectionId) {
      throw invalid("A pasta selecionada não pertence a esta coleção.");
    }
    return repository.createFolder(
        collectionId,
        parentId,
        requiredText(name, MAX_FOLDER_NAME_LENGTH, "Informe o nome da pasta."));
  }

  @Transactional
  synchronized ApiClientFolder updateFolder(long id, String name) {
    requiredFolder(id);
    return repository.updateFolder(
        id, requiredText(name, MAX_FOLDER_NAME_LENGTH, "Informe o nome da pasta."));
  }

  @Transactional
  synchronized void deleteFolder(long id) {
    requiredFolder(id);
    repository.deleteFolder(id);
  }

  @Transactional
  synchronized ApiClientSavedRequest createRequest(ApiClientRequestDraft input) {
    return repository.createRequest(normalizedDraft(input));
  }

  @Transactional
  synchronized ApiClientSavedRequest updateRequest(long id, ApiClientRequestDraft input) {
    requiredRequest(id);
    return repository.updateRequest(id, normalizedDraft(input));
  }

  @Transactional
  synchronized void deleteRequest(long id) {
    requiredRequest(id);
    repository.deleteRequest(id);
    reconcileViewState();
  }

  synchronized List<ApiClientVariable> variables(long collectionId) {
    requiredCollection(collectionId);
    return repository.variablesByCollection(collectionId);
  }

  @Transactional
  synchronized ApiClientVariable createVariable(long collectionId, String name, String value) {
    requiredCollection(collectionId);
    String n = requiredVariableName(name);
    String v = optionalText(value, MAX_VARIABLE_VALUE_LENGTH);
    return repository.createVariable(collectionId, n, v);
  }

  @Transactional
  synchronized ApiClientVariable updateVariable(long id, String name, String value) {
    ApiClientVariable existing = requiredVariable(id);
    String n = requiredVariableName(name);
    String v = optionalText(value, MAX_VARIABLE_VALUE_LENGTH);
    if (!n.equals(existing.name())) {
      boolean duplicate =
          repository.variablesByCollection(existing.collectionId()).stream()
              .anyMatch(var -> var.name().equals(n) && var.id() != id);
      if (duplicate) {
        throw invalid("Já existe uma variável com este nome nesta coleção.");
      }
    }
    return repository.updateVariable(id, n, v);
  }

  @Transactional
  synchronized void deleteVariable(long id) {
    requiredVariable(id);
    repository.deleteVariable(id);
  }

  @Transactional
  synchronized ApiClientWorkspaceState saveViewState(ApiClientWorkspaceState input) {
    if (input == null) {
      throw invalid("Estado do workspace inválido.");
    }
    ApiClientWorkspaceState state = normalizeState(input, repository.requests());
    repository.saveViewState(state);
    return state;
  }

  @Transactional
  synchronized void reorderCollections(java.util.List<Long> ids) {
    if (ids == null || ids.isEmpty()) return;
    repository.reorderCollections(ids);
  }

  @Transactional
  synchronized void reorderFolders(java.util.List<Long> ids) {
    if (ids == null || ids.isEmpty()) return;
    repository.reorderFolders(ids);
  }

  @Transactional
  synchronized void reorderRequests(java.util.List<Long> ids) {
    if (ids == null || ids.isEmpty()) return;
    repository.reorderRequests(ids);
  }

  @Transactional
  synchronized ApiClientSavedRequest moveRequest(long id, Long collectionId, Long folderId) {
    requiredRequest(id);
    if (collectionId != null) {
      requiredCollection(collectionId);
      if (folderId != null && requiredFolder(folderId).collectionId() != collectionId) {
        throw invalid("A pasta selecionada não pertence a esta coleção.");
      }
    }
    return repository.moveRequest(id, collectionId, folderId);
  }

  private ApiClientRequestDraft normalizedDraft(ApiClientRequestDraft input) {
    if (input == null || input.request() == null) {
      throw invalid("Informe os dados do request.");
    }
    if (input.collectionId() != null) {
      requiredCollection(input.collectionId());
      if (input.folderId() != null
          && requiredFolder(input.folderId()).collectionId() != input.collectionId()) {
        throw invalid("A pasta selecionada não pertence a esta coleção.");
      }
    }
    ApiClientRequest request = normalizedRequest(input.request());
    return new ApiClientRequestDraft(
        input.collectionId(),
        input.collectionId() == null ? null : input.folderId(),
        requiredText(input.name(), MAX_REQUEST_NAME_LENGTH, "Informe o nome do request."),
        request);
  }

  private static ApiClientRequest normalizedRequest(ApiClientRequest input) {
    String method = input.method() == null ? "" : input.method().strip().toUpperCase(Locale.ROOT);
    if (!METHODS.contains(method)) {
      throw invalid("Método HTTP inválido.");
    }
    String url = optionalText(input.url(), MAX_URL_LENGTH);
    List<ApiClientHeader> headers = input.headers() == null ? List.of() : input.headers();
    if (headers.size() > MAX_HEADERS) {
      throw invalid("O request aceita no máximo 30 headers.");
    }
    List<ApiClientHeader> normalizedHeaders =
        headers.stream().map(ApiClientWorkspaceService::normalizedHeader).toList();
    String body = input.body() == null ? "" : input.body();
    if (body.getBytes(StandardCharsets.UTF_8).length > MAX_BODY_BYTES) {
      throw invalid("O corpo do request excede 1 MB.");
    }
    return new ApiClientRequest(
        method, url, normalizedHeaders, body, normalizedAuthentication(input.authentication()));
  }

  private static ApiClientHeader normalizedHeader(ApiClientHeader input) {
    if (input == null) {
      throw invalid("Header inválido.");
    }
    String name =
        requiredText(input.name(), MAX_HEADER_NAME_LENGTH, "Todo header precisa ter um nome.");
    String value = optionalText(input.value(), MAX_HEADER_VALUE_LENGTH);
    if (value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) {
      throw invalid("Header inválido.");
    }
    return new ApiClientHeader(name, value);
  }

  private static ApiClientAuthentication normalizedAuthentication(ApiClientAuthentication input) {
    if (input == null || input.type() == null || input.type().isBlank()) {
      return new ApiClientAuthentication("none", "", "", "");
    }
    String type = input.type().strip().toLowerCase(Locale.ROOT);
    if (!Set.of("none", "bearer", "basic").contains(type)) {
      throw invalid("Tipo de autenticação inválido.");
    }
    String token = optionalText(input.token(), MAX_HEADER_VALUE_LENGTH);
    String username = optionalText(input.username(), MAX_HEADER_VALUE_LENGTH);
    String password = input.password() == null ? "" : input.password();
    if (password.getBytes(StandardCharsets.UTF_8).length > MAX_HEADER_VALUE_LENGTH) {
      throw invalid("Credencial inválida.");
    }
    if (type.equals("bearer") && token.isEmpty()) {
      throw invalid("Informe o token Bearer.");
    }
    if (type.equals("basic") && username.isEmpty()) {
      throw invalid("Informe o usuário da autenticação básica.");
    }
    return new ApiClientAuthentication(type, token, username, password);
  }

  private void reconcileViewState() {
    repository.saveViewState(normalizeState(repository.viewState(), repository.requests()));
  }

  private static ApiClientWorkspaceState normalizeState(
      ApiClientWorkspaceState input, List<ApiClientRequestSummary> requests) {
    Set<Long> available =
        requests.stream()
            .map(ApiClientRequestSummary::id)
            .collect(java.util.stream.Collectors.toSet());
    LinkedHashSet<Long> open = new LinkedHashSet<>();
    List<Long> requested = input.openRequestIds() == null ? List.of() : input.openRequestIds();
    for (Long id : requested) {
      if (id != null && available.contains(id)) {
        open.add(id);
      }
      if (open.size() == MAX_OPEN_REQUESTS) {
        break;
      }
    }
    Long active = input.activeRequestId();
    if (active == null || !open.contains(active)) {
      active =
          open.isEmpty() ? null : open.stream().reduce((first, second) -> second).orElseThrow();
    }
    return new ApiClientWorkspaceState(List.copyOf(open), active);
  }

  private ApiClientVariable requiredVariable(long id) {
    return repository
        .variable(id)
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Variável não encontrada."));
  }

  private static String requiredVariableName(String name) {
    String n = requiredText(name, MAX_VARIABLE_NAME_LENGTH, "Informe o nome da variável.");
    if (!n.matches("[A-Za-z_][A-Za-z0-9_\\-]*")) {
      throw invalid("Nome de variável inválido. Use letras, números, _ e -.");
    }
    return n;
  }

  private ApiClientCollection requiredCollection(long id) {
    return repository
        .collection(id)
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Coleção não encontrada."));
  }

  private ApiClientFolder requiredFolder(long id) {
    return repository
        .folder(id)
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Pasta não encontrada."));
  }

  private ApiClientSavedRequest requiredRequest(long id) {
    return repository
        .request(id)
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Request não encontrado."));
  }

  private static String requiredText(String value, int maximum, String message) {
    String text = optionalText(value, maximum);
    if (text.isEmpty()) {
      throw invalid(message);
    }
    return text;
  }

  private static String optionalText(String value, int maximum) {
    String text = value == null ? "" : value.strip();
    if (text.length() > maximum || text.codePoints().anyMatch(Character::isISOControl)) {
      throw invalid("Valor inválido.");
    }
    return text;
  }

  private static ResponseStatusException invalid(String message) {
    return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
  }
}
