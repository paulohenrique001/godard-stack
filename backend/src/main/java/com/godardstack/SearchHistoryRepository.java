package com.godardstack;

import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class SearchHistoryRepository {

    private static final int MAX_RECENTS = 10;

    private final JdbcClient jdbcClient;

    public SearchHistoryRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    List<String> findFavorites() {
        return jdbcClient.sql("SELECT item_id FROM search_favorite ORDER BY created_at")
                .query(String.class)
                .list();
    }

    List<String> findRecents() {
        return jdbcClient.sql("SELECT item_id FROM search_recent ORDER BY used_at DESC")
                .query(String.class)
                .list();
    }

    void addFavorite(String itemId) {
        jdbcClient.sql("MERGE INTO search_favorite (item_id, created_at) KEY (item_id) VALUES (:id, CURRENT_TIMESTAMP)")
                .param("id", itemId)
                .update();
        removeRecent(itemId);
    }

    void removeFavorite(String itemId) {
        jdbcClient.sql("DELETE FROM search_favorite WHERE item_id = :id").param("id", itemId).update();
    }

    void addRecent(String itemId) {
        jdbcClient.sql("MERGE INTO search_recent (item_id, used_at) KEY (item_id) VALUES (:id, CURRENT_TIMESTAMP)")
                .param("id", itemId)
                .update();
        jdbcClient.sql("""
                        DELETE FROM search_recent WHERE item_id NOT IN (
                            SELECT item_id FROM search_recent ORDER BY used_at DESC FETCH FIRST :limit ROWS ONLY
                        )
                        """)
                .param("limit", MAX_RECENTS)
                .update();
    }

    void removeRecent(String itemId) {
        jdbcClient.sql("DELETE FROM search_recent WHERE item_id = :id").param("id", itemId).update();
    }
}
