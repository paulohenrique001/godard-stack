package com.godardstack;

import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Repository;

@Repository
public class SgbdConnectionRepository {

    record SgbdConnection(long id, String name, String kind, String host, int port, String username, String password,
                          String databaseName, boolean ssl, boolean autoPing, boolean showAllSchemas,
                          boolean showSystemSchemas, String selectedSchemas, int autoPingFailures) {
    }

    private static final String COLUMNS =
            "id, name, kind, host, port, username, password, database_name, ssl_enabled AS ssl, auto_ping, "
                    + "show_all_schemas, show_system_schemas, selected_schemas, auto_ping_failures";

    private final JdbcClient jdbcClient;
    private final ConnectionSecretCipher cipher;

    public SgbdConnectionRepository(JdbcClient jdbcClient, ConnectionSecretCipher cipher) {
        this.jdbcClient = jdbcClient;
        this.cipher = cipher;
    }

    @PostConstruct
    void migrateLegacyPasswords() {
        jdbcClient.sql("SELECT id, password FROM sgbd_connection")
                .query((resultSet, row) -> new Object[] { resultSet.getLong("id"), resultSet.getString("password") })
                .list()
                .forEach(row -> {
                    long id = (Long) row[0];
                    String password = (String) row[1];
                    if (cipher.needsMigration(password)) {
                        jdbcClient.sql("UPDATE sgbd_connection SET password = :password WHERE id = :id")
                                .param("id", id)
                                .param("password", cipher.encrypt(cipher.decrypt(password)))
                                .update();
                    }
                });
    }

    List<SgbdConnection> findAll() {
        return jdbcClient.sql("SELECT " + COLUMNS + " FROM sgbd_connection ORDER BY LOWER(name)")
                .query((resultSet, row) -> map(resultSet))
                .list();
    }

    Optional<SgbdConnection> find(long id) {
        return jdbcClient.sql("SELECT " + COLUMNS + " FROM sgbd_connection WHERE id = :id")
                .param("id", id)
                .query((resultSet, row) -> map(resultSet))
                .optional();
    }

    void create(SgbdConnection connection) {
        jdbcClient.sql("""
                        INSERT INTO sgbd_connection
                            (name, kind, host, port, username, password, database_name, ssl_enabled, auto_ping,
                             show_all_schemas, show_system_schemas, selected_schemas)
                        VALUES (:name, :kind, :host, :port, :username, :password, :database, :ssl, :autoPing,
                                :showAllSchemas, :showSystemSchemas, :selectedSchemas)
                        """)
                .param("name", connection.name())
                .param("kind", connection.kind())
                .param("host", connection.host())
                .param("port", connection.port())
                .param("username", connection.username())
                .param("password", cipher.encrypt(connection.password()))
                .param("database", connection.databaseName())
                .param("ssl", connection.ssl())
                .param("autoPing", connection.autoPing())
                .param("showAllSchemas", connection.showAllSchemas())
                .param("showSystemSchemas", connection.showSystemSchemas())
                .param("selectedSchemas", connection.selectedSchemas())
                .update();
    }

    void update(SgbdConnection connection) {
        jdbcClient.sql("""
                        UPDATE sgbd_connection
                        SET name = :name, kind = :kind, host = :host, port = :port, username = :username,
                            password = :password, database_name = :database, ssl_enabled = :ssl, auto_ping = :autoPing,
                            show_all_schemas = :showAllSchemas, show_system_schemas = :showSystemSchemas,
                            selected_schemas = :selectedSchemas
                        WHERE id = :id
                        """)
                .param("id", connection.id())
                .param("name", connection.name())
                .param("kind", connection.kind())
                .param("host", connection.host())
                .param("port", connection.port())
                .param("username", connection.username())
                .param("password", cipher.encrypt(connection.password()))
                .param("database", connection.databaseName())
                .param("ssl", connection.ssl())
                .param("autoPing", connection.autoPing())
                .param("showAllSchemas", connection.showAllSchemas())
                .param("showSystemSchemas", connection.showSystemSchemas())
                .param("selectedSchemas", connection.selectedSchemas())
                .update();
    }

    void delete(long id) {
        jdbcClient.sql("DELETE FROM sgbd_connection WHERE id = :id").param("id", id).update();
    }

    void recordAutomaticPingFailure(long id) {
        jdbcClient.sql("""
                        UPDATE sgbd_connection
                        SET auto_ping_failures = CASE
                            WHEN auto_ping_failures < 3 THEN auto_ping_failures + 1
                            ELSE 3
                        END
                        WHERE id = :id
                        """)
                .param("id", id)
                .update();
    }

    void resetAutomaticPingFailures(long id) {
        jdbcClient.sql("UPDATE sgbd_connection SET auto_ping_failures = 0 WHERE id = :id")
                .param("id", id)
                .update();
    }

    private SgbdConnection map(java.sql.ResultSet resultSet) throws java.sql.SQLException {
        return new SgbdConnection(resultSet.getLong("id"), resultSet.getString("name"), resultSet.getString("kind"),
                resultSet.getString("host"), resultSet.getInt("port"), resultSet.getString("username"),
                cipher.decrypt(resultSet.getString("password")), resultSet.getString("database_name"),
                resultSet.getBoolean("ssl"), resultSet.getBoolean("auto_ping"), resultSet.getBoolean("show_all_schemas"),
                resultSet.getBoolean("show_system_schemas"), resultSet.getString("selected_schemas"),
                resultSet.getInt("auto_ping_failures"));
    }
}
