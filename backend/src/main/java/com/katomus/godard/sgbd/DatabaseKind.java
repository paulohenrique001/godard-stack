package com.katomus.godard.sgbd;

import java.util.Arrays;
import java.util.Optional;

public enum DatabaseKind {
  MARIADB("mariadb", "MariaDB", 3306, "root", ""),
  MYSQL("mysql", "MySQL", 3306, "root", ""),
  REDIS("redis", "Redis", 6379, "", "0");

  private final String value;
  private final String label;
  private final int defaultPort;
  private final String defaultUsername;
  private final String defaultDatabase;

  DatabaseKind(
      String value, String label, int defaultPort, String defaultUsername, String defaultDatabase) {
    this.value = value;
    this.label = label;
    this.defaultPort = defaultPort;
    this.defaultUsername = defaultUsername;
    this.defaultDatabase = defaultDatabase;
  }

  public String value() {
    return value;
  }

  public String label() {
    return label;
  }

  public int defaultPort() {
    return defaultPort;
  }

  public String defaultUsername() {
    return defaultUsername;
  }

  public String defaultDatabase() {
    return defaultDatabase;
  }

  public static Optional<DatabaseKind> from(String value) {
    return Arrays.stream(values()).filter(kind -> kind.value.equals(value)).findFirst();
  }
}
