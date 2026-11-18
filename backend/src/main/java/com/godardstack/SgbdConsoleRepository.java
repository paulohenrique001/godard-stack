package com.godardstack;

import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class SgbdConsoleRepository {

    static final int DEFAULT_EDITOR_PERCENT = 30;
    static final int DEFAULT_PAGE_SIZE = 100;

    record SgbdConsole(long id, String label, String schemaName, String queryText, int editorPercent,
                       boolean active, int pageSize, String outputLog, String savedResults,
                       boolean resultsMinimized) {
    }

    record SchemaCache(String content, String syncedAt) {
    }

    private final JdbcClient jdbcClient;

    public SgbdConsoleRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    List<SgbdConsole> findByConnection(long connectionId) {
        return jdbcClient.sql("""
                        SELECT id, label, schema_name, query_text, editor_percent, active, page_size, output_log,
                               saved_results, results_minimized FROM sgbd_console
                        WHERE connection_id = :connection ORDER BY id
                        """)
                .param("connection", connectionId)
                .query(SgbdConsole.class)
                .list();
    }

    long nextConsoleNumber(long connectionId) {
        return jdbcClient.sql("SELECT COUNT(*) FROM sgbd_console WHERE connection_id = :connection")
                .param("connection", connectionId)
                .query(Long.class)
                .single() + 1;
    }

    long create(long connectionId, String label, String schema) {
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbcClient.sql("""
                        INSERT INTO sgbd_console (connection_id, label, schema_name, query_text, editor_percent)
                        VALUES (:connection, :label, :schema, '', :editorPercent)
                        """)
                .param("editorPercent", DEFAULT_EDITOR_PERCENT)
                .param("connection", connectionId)
                .param("label", label)
                .param("schema", schema)
                .update(keys, "id");
        return keys.getKey().longValue();
    }

    void updateLabel(long id, String label) {
        jdbcClient.sql("UPDATE sgbd_console SET label = :label WHERE id = :id")
                .param("id", id)
                .param("label", label)
                .update();
    }

    void updateSchema(long id, String schema) {
        jdbcClient.sql("UPDATE sgbd_console SET schema_name = :schema WHERE id = :id")
                .param("id", id)
                .param("schema", schema)
                .update();
    }

    void updateQuery(long id, String query) {
        jdbcClient.sql("UPDATE sgbd_console SET query_text = :query WHERE id = :id")
                .param("id", id)
                .param("query", query)
                .update();
    }

    void updateEditorPercent(long id, int editorPercent) {
        jdbcClient.sql("UPDATE sgbd_console SET editor_percent = :editorPercent WHERE id = :id")
                .param("id", id)
                .param("editorPercent", editorPercent)
                .update();
    }

    void updatePageSize(long id, int pageSize) {
        jdbcClient.sql("UPDATE sgbd_console SET page_size = :pageSize WHERE id = :id")
                .param("id", id)
                .param("pageSize", pageSize)
                .update();
    }

    void updateOutputLog(long id, String outputLog) {
        jdbcClient.sql("UPDATE sgbd_console SET output_log = :outputLog WHERE id = :id")
                .param("id", id)
                .param("outputLog", outputLog)
                .update();
    }

    void updateSavedResults(long id, String savedResults) {
        jdbcClient.sql("UPDATE sgbd_console SET saved_results = :savedResults WHERE id = :id")
                .param("id", id)
                .param("savedResults", savedResults)
                .update();
    }

    void updateResultsMinimized(long id, boolean resultsMinimized) {
        jdbcClient.sql("UPDATE sgbd_console SET results_minimized = :resultsMinimized WHERE id = :id")
                .param("id", id)
                .param("resultsMinimized", resultsMinimized)
                .update();
    }

    void saveActiveTab(long connectionId, long consoleId) {
        jdbcClient.sql("UPDATE sgbd_console SET active = (id = :console) WHERE connection_id = :connection")
                .param("connection", connectionId)
                .param("console", consoleId)
                .update();
        jdbcClient.sql("UPDATE sgbd_connection SET selected = (id = :connection)")
                .param("connection", connectionId)
                .update();
    }

    Optional<Long> findConnectionToResume() {
        return jdbcClient.sql("""
                        SELECT console.connection_id FROM sgbd_console console
                        JOIN sgbd_connection connection ON connection.id = console.connection_id
                        WHERE connection.selected AND console.active
                        """)
                .query(Long.class)
                .optional();
    }

    void clearConnectionToResume() {
        jdbcClient.sql("UPDATE sgbd_connection SET selected = FALSE").update();
    }

    void delete(long id) {
        jdbcClient.sql("DELETE FROM sgbd_console WHERE id = :id").param("id", id).update();
    }

    Optional<SchemaCache> findSchemas(long connectionId) {
        return jdbcClient.sql("SELECT content, synced_at FROM sgbd_schema_cache WHERE connection_id = :connection")
                .param("connection", connectionId)
                .query(SchemaCache.class)
                .optional();
    }

    Optional<String> findStructure(long connectionId) {
        return jdbcClient.sql("SELECT content FROM sgbd_structure_cache WHERE connection_id = :connection")
                .param("connection", connectionId)
                .query(String.class)
                .optional();
    }

    void saveStructure(long connectionId, String content, String syncedAt) {
        jdbcClient.sql("""
                        MERGE INTO sgbd_structure_cache (connection_id, content, synced_at)
                        KEY (connection_id) VALUES (:connection, :content, :syncedAt)
                        """)
                .param("connection", connectionId)
                .param("content", content)
                .param("syncedAt", syncedAt)
                .update();
    }

    void saveSchemas(long connectionId, String content, String syncedAt) {
        jdbcClient.sql("""
                        MERGE INTO sgbd_schema_cache (connection_id, content, synced_at)
                        KEY (connection_id) VALUES (:connection, :content, :syncedAt)
                        """)
                .param("connection", connectionId)
                .param("content", content)
                .param("syncedAt", syncedAt)
                .update();
    }
}
