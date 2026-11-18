package com.katomus.godard.persistence;

import com.katomus.godard.settings.UserPreferences;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class PreferencesRepository {

  private final JdbcClient jdbcClient;

  public PreferencesRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public UserPreferences find() {
    return jdbcClient
        .sql(
            """
                        SELECT theme, last_page, notifications_read_id
                        FROM app_preference WHERE id = 1
                        """)
        .query(
            (resultSet, row) ->
                new UserPreferences(
                    resultSet.getString("theme"),
                    resultSet.getString("last_page"),
                    resultSet.getLong("notifications_read_id")))
        .single();
  }

  public UserPreferences save(String theme, String lastPage, long notificationsReadId) {
    jdbcClient
        .sql(
            """
                        UPDATE app_preference
                        SET theme = :theme, last_page = :lastPage,
                            notifications_read_id = :notificationsReadId
                        WHERE id = 1
                        """)
        .param("theme", theme)
        .param("lastPage", lastPage)
        .param("notificationsReadId", notificationsReadId)
        .update();
    return find();
  }
}
