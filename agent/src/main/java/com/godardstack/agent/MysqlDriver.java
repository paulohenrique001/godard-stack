package com.godardstack.agent;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.Properties;

final class MysqlDriver extends MariadbDriver {

    private static final int CONNECT_TIMEOUT_MS = 5000;

    @Override
    protected Connection open(Target target, String database, String socketOptions) throws SQLException {
        String url = "jdbc:mariadb://" + target.host() + ":" + target.port() + "/" + database
                + "?connectTimeout=" + CONNECT_TIMEOUT_MS
                + "&socketTimeout=" + socketOptions
                + "&sslMode=" + (target.ssl() ? "trust" : "disable");
        Properties properties = new Properties();
        properties.setProperty("user", target.username());
        properties.setProperty("password", target.password());
        return new org.mariadb.jdbc.Driver().connect(url, properties);
    }
}
