package com.katomus.godard.apiclient;

import com.katomus.godard.security.LocalValueCipher;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

@Repository
class ApiClientWorkspaceRepository {

  private static final String REQUEST_COLUMNS =
      "id, collection_id, folder_id, name, method, payload_encrypted";

  private final JdbcClient jdbcClient;
  private final ObjectMapper objectMapper;
  private final LocalValueCipher cipher;

  ApiClientWorkspaceRepository(
      JdbcClient jdbcClient, ObjectMapper objectMapper, LocalValueCipher cipher) {
    this.jdbcClient = jdbcClient;
    this.objectMapper = objectMapper;
    this.cipher = cipher;
  }

  List<ApiClientVariable> variables() {
    return jdbcClient
        .sql(
            """
            SELECT id, collection_id, name, value
            FROM api_client_collection_variable
            ORDER BY collection_id, sort_order, LOWER(name), id
            """)
        .query((resultSet, row) -> variable(resultSet))
        .list();
  }

  List<ApiClientVariable> variablesByCollection(long collectionId) {
    return jdbcClient
        .sql(
            """
            SELECT id, collection_id, name, value
            FROM api_client_collection_variable
            WHERE collection_id = :collectionId
            ORDER BY sort_order, LOWER(name), id
            """)
        .param("collectionId", collectionId)
        .query((resultSet, row) -> variable(resultSet))
        .list();
  }

  Optional<ApiClientVariable> variable(long id) {
    return jdbcClient
        .sql(
            "SELECT id, collection_id, name, value FROM api_client_collection_variable WHERE id = :id")
        .param("id", id)
        .query((resultSet, row) -> variable(resultSet))
        .optional();
  }

  ApiClientVariable createVariable(long collectionId, String name, String value) {
    String now = Instant.now().toString();
    long id =
        jdbcClient
            .sql(
                """
                INSERT INTO api_client_collection_variable (collection_id, name, value, created_at, updated_at)
                VALUES (:collectionId, :name, :value, :createdAt, :updatedAt)
                RETURNING id
                """)
            .param("collectionId", collectionId)
            .param("name", name)
            .param("value", value)
            .param("createdAt", now)
            .param("updatedAt", now)
            .query((resultSet, row) -> resultSet.getLong("id"))
            .single();
    return variable(id).orElseThrow();
  }

  ApiClientVariable updateVariable(long id, String name, String value) {
    jdbcClient
        .sql(
            """
            UPDATE api_client_collection_variable
            SET name = :name, value = :value, updated_at = :updatedAt
            WHERE id = :id
            """)
        .param("id", id)
        .param("name", name)
        .param("value", value)
        .param("updatedAt", Instant.now().toString())
        .update();
    return variable(id).orElseThrow();
  }

  void deleteVariable(long id) {
    jdbcClient
        .sql("DELETE FROM api_client_collection_variable WHERE id = :id")
        .param("id", id)
        .update();
  }

  List<ApiClientCollection> collections() {
    return jdbcClient
        .sql(
            "SELECT id, name, description FROM api_client_collection ORDER BY sort_order, LOWER(name), id")
        .query((resultSet, row) -> collection(resultSet))
        .list();
  }

  Optional<ApiClientCollection> collection(long id) {
    return jdbcClient
        .sql("SELECT id, name, description FROM api_client_collection WHERE id = :id")
        .param("id", id)
        .query((resultSet, row) -> collection(resultSet))
        .optional();
  }

  ApiClientCollection createCollection(String name, String description) {
    String now = Instant.now().toString();
    long id =
        jdbcClient
            .sql(
                """
                INSERT INTO api_client_collection (name, description, created_at, updated_at)
                VALUES (:name, :description, :createdAt, :updatedAt)
                RETURNING id
                """)
            .param("name", name)
            .param("description", description)
            .param("createdAt", now)
            .param("updatedAt", now)
            .query((resultSet, row) -> resultSet.getLong("id"))
            .single();
    return collection(id).orElseThrow();
  }

  ApiClientCollection updateCollection(long id, String name, String description) {
    jdbcClient
        .sql(
            """
            UPDATE api_client_collection
            SET name = :name, description = :description, updated_at = :updatedAt
            WHERE id = :id
            """)
        .param("id", id)
        .param("name", name)
        .param("description", description)
        .param("updatedAt", Instant.now().toString())
        .update();
    return collection(id).orElseThrow();
  }

  void deleteCollection(long id) {
    jdbcClient.sql("DELETE FROM api_client_collection WHERE id = :id").param("id", id).update();
  }

  List<ApiClientFolder> folders() {
    return jdbcClient
        .sql(
            """
            SELECT id, collection_id, parent_id, name
            FROM api_client_folder
            ORDER BY collection_id, parent_id, sort_order, LOWER(name), id
            """)
        .query((resultSet, row) -> folder(resultSet))
        .list();
  }

  Optional<ApiClientFolder> folder(long id) {
    return jdbcClient
        .sql("SELECT id, collection_id, parent_id, name FROM api_client_folder WHERE id = :id")
        .param("id", id)
        .query((resultSet, row) -> folder(resultSet))
        .optional();
  }

  ApiClientFolder createFolder(long collectionId, Long parentId, String name) {
    String now = Instant.now().toString();
    long id =
        jdbcClient
            .sql(
                """
                INSERT INTO api_client_folder (collection_id, parent_id, name, created_at, updated_at)
                VALUES (:collectionId, :parentId, :name, :createdAt, :updatedAt)
                RETURNING id
                """)
            .param("collectionId", collectionId)
            .param("parentId", parentId)
            .param("name", name)
            .param("createdAt", now)
            .param("updatedAt", now)
            .query((resultSet, row) -> resultSet.getLong("id"))
            .single();
    return folder(id).orElseThrow();
  }

  ApiClientFolder updateFolder(long id, String name) {
    jdbcClient
        .sql("UPDATE api_client_folder SET name = :name, updated_at = :updatedAt WHERE id = :id")
        .param("id", id)
        .param("name", name)
        .param("updatedAt", Instant.now().toString())
        .update();
    return folder(id).orElseThrow();
  }

  void deleteFolder(long id) {
    jdbcClient.sql("DELETE FROM api_client_folder WHERE id = :id").param("id", id).update();
  }

  List<ApiClientRequestSummary> requests() {
    return jdbcClient
        .sql(
            """
            SELECT id, collection_id, folder_id, name, method
            FROM api_client_request
            ORDER BY collection_id, folder_id, sort_order, LOWER(name), id
            """)
        .query((resultSet, row) -> summary(resultSet))
        .list();
  }

  Optional<ApiClientSavedRequest> request(long id) {
    return jdbcClient
        .sql("SELECT " + REQUEST_COLUMNS + " FROM api_client_request WHERE id = :id")
        .param("id", id)
        .query((resultSet, row) -> savedRequest(resultSet))
        .optional();
  }

  ApiClientSavedRequest createRequest(ApiClientRequestDraft draft) {
    String now = Instant.now().toString();
    long id =
        jdbcClient
            .sql(
                """
                INSERT INTO api_client_request
                    (collection_id, folder_id, name, method, payload_encrypted, sort_order, created_at, updated_at)
                VALUES
                    (:collectionId, :folderId, :name, :method, :payload,
                     (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM api_client_request
                      WHERE (collection_id = :collectionId OR (collection_id IS NULL AND :collectionId IS NULL))
                        AND (folder_id = :folderId OR (folder_id IS NULL AND :folderId IS NULL))),
                     :createdAt, :updatedAt)
                RETURNING id
                """)
            .param("collectionId", draft.collectionId())
            .param("folderId", draft.folderId())
            .param("name", draft.name())
            .param("method", draft.request().method())
            .param("payload", encryptedPayload(draft.request()))
            .param("createdAt", now)
            .param("updatedAt", now)
            .query((resultSet, row) -> resultSet.getLong("id"))
            .single();
    return request(id).orElseThrow();
  }

  ApiClientSavedRequest updateRequest(long id, ApiClientRequestDraft draft) {
    jdbcClient
        .sql(
            """
            UPDATE api_client_request
            SET collection_id = :collectionId, folder_id = :folderId, name = :name, method = :method,
                payload_encrypted = :payload, updated_at = :updatedAt
            WHERE id = :id
            """)
        .param("id", id)
        .param("collectionId", draft.collectionId())
        .param("folderId", draft.folderId())
        .param("name", draft.name())
        .param("method", draft.request().method())
        .param("payload", encryptedPayload(draft.request()))
        .param("updatedAt", Instant.now().toString())
        .update();
    return request(id).orElseThrow();
  }

  void deleteRequest(long id) {
    jdbcClient.sql("DELETE FROM api_client_request WHERE id = :id").param("id", id).update();
  }

  ApiClientWorkspaceState viewState() {
    return jdbcClient
        .sql("SELECT open_request_ids, active_request_id FROM api_client_view_state WHERE id = 1")
        .query(
            (resultSet, row) ->
                new ApiClientWorkspaceState(
                    requestIds(resultSet.getString("open_request_ids")),
                    nullableLong(resultSet, "active_request_id")))
        .single();
  }

  void saveViewState(ApiClientWorkspaceState state) {
    jdbcClient
        .sql(
            """
            UPDATE api_client_view_state
            SET open_request_ids = :openRequestIds, active_request_id = :activeRequestId
            WHERE id = 1
            """)
        .param("openRequestIds", requestIds(state.openRequestIds()))
        .param("activeRequestId", state.activeRequestId())
        .update();
  }

  private ApiClientVariable variable(ResultSet resultSet) throws SQLException {
    return new ApiClientVariable(
        resultSet.getLong("id"),
        resultSet.getLong("collection_id"),
        resultSet.getString("name"),
        resultSet.getString("value"));
  }

  private ApiClientCollection collection(ResultSet resultSet) throws SQLException {
    return new ApiClientCollection(
        resultSet.getLong("id"), resultSet.getString("name"), resultSet.getString("description"));
  }

  private ApiClientFolder folder(ResultSet resultSet) throws SQLException {
    return new ApiClientFolder(
        resultSet.getLong("id"),
        resultSet.getLong("collection_id"),
        nullableLong(resultSet, "parent_id"),
        resultSet.getString("name"));
  }

  void reorderCollections(java.util.List<Long> ids) {
    for (int i = 0; i < ids.size(); i++) {
      jdbcClient
          .sql("UPDATE api_client_collection SET sort_order = :order WHERE id = :id")
          .param("order", i)
          .param("id", ids.get(i))
          .update();
    }
  }

  void reorderFolders(java.util.List<Long> ids) {
    for (int i = 0; i < ids.size(); i++) {
      jdbcClient
          .sql("UPDATE api_client_folder SET sort_order = :order WHERE id = :id")
          .param("order", i)
          .param("id", ids.get(i))
          .update();
    }
  }

  void reorderRequests(java.util.List<Long> ids) {
    for (int i = 0; i < ids.size(); i++) {
      jdbcClient
          .sql("UPDATE api_client_request SET sort_order = :order WHERE id = :id")
          .param("order", i)
          .param("id", ids.get(i))
          .update();
    }
  }

  ApiClientSavedRequest moveRequest(long id, Long collectionId, Long folderId) {
    jdbcClient
        .sql(
            """
            UPDATE api_client_request
            SET collection_id = :collectionId, folder_id = :folderId, updated_at = :updatedAt
            WHERE id = :id
            """)
        .param("id", id)
        .param("collectionId", collectionId)
        .param("folderId", folderId)
        .param("updatedAt", Instant.now().toString())
        .update();
    return request(id).orElseThrow();
  }

  private ApiClientRequestSummary summary(ResultSet resultSet) throws SQLException {
    return new ApiClientRequestSummary(
        resultSet.getLong("id"),
        nullableLong(resultSet, "collection_id"),
        nullableLong(resultSet, "folder_id"),
        resultSet.getString("name"),
        resultSet.getString("method"));
  }

  private ApiClientSavedRequest savedRequest(ResultSet resultSet) throws SQLException {
    return new ApiClientSavedRequest(
        resultSet.getLong("id"),
        nullableLong(resultSet, "collection_id"),
        nullableLong(resultSet, "folder_id"),
        resultSet.getString("name"),
        decryptedPayload(resultSet.getString("payload_encrypted")));
  }

  private String encryptedPayload(ApiClientRequest payload) {
    try {
      return cipher.encrypt(objectMapper.writeValueAsString(payload));
    } catch (Exception exception) {
      throw new IllegalStateException("Não foi possível proteger o request local.", exception);
    }
  }

  private ApiClientRequest decryptedPayload(String payload) {
    try {
      return objectMapper.readValue(cipher.decrypt(payload), ApiClientRequest.class);
    } catch (Exception exception) {
      throw new IllegalStateException("Não foi possível abrir o request local.", exception);
    }
  }

  private static Long nullableLong(ResultSet resultSet, String column) throws SQLException {
    long value = resultSet.getLong(column);
    return resultSet.wasNull() ? null : value;
  }

  private static List<Long> requestIds(String serialized) {
    if (serialized == null || serialized.length() < 3) {
      return List.of();
    }
    try {
      String value = serialized.substring(1, serialized.length() - 1);
      LinkedHashSet<Long> ids = new LinkedHashSet<>();
      for (String item : value.split(",")) {
        if (!item.isBlank()) {
          ids.add(Long.parseLong(item.strip()));
        }
      }
      return List.copyOf(ids);
    } catch (IllegalArgumentException exception) {
      return List.of();
    }
  }

  private static String requestIds(List<Long> ids) {
    return ids.stream()
        .map(String::valueOf)
        .collect(java.util.stream.Collectors.joining(",", "[", "]"));
  }
}
