package com.katomus.godard.persistence;

import com.katomus.godard.profile.UserProfile;
import java.util.Locale;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class UserProfileRepository {

  private final JdbcClient jdbcClient;

  public UserProfileRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public Optional<UserProfile> find() {
    return jdbcClient
        .sql("SELECT name, avatar_seed, email, language FROM app_user WHERE id = 1")
        .query(
            (resultSet, row) ->
                new UserProfile(
                    resultSet.getString("name"),
                    resultSet.getString("avatar_seed"),
                    resultSet.getString("email"),
                    resultSet.getString("language")))
        .optional();
  }

  public UserProfile save(String name, String avatarSeed, String email, String language) {
    String normalized = name.strip().toUpperCase(Locale.ROOT);
    jdbcClient
        .sql(
            """
                        INSERT INTO app_user (id, name, avatar_seed, email, language)
                        VALUES (1, :name, :avatarSeed, :email, :language)
                        ON CONFLICT(id) DO UPDATE SET
                            name = excluded.name,
                            avatar_seed = excluded.avatar_seed,
                            email = excluded.email,
                            language = excluded.language
                        """)
        .param("name", normalized)
        .param("avatarSeed", avatarSeed)
        .param("email", email)
        .param("language", language)
        .update();
    return new UserProfile(normalized, avatarSeed, email, language);
  }
}
