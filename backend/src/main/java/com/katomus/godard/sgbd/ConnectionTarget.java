package com.katomus.godard.sgbd;

record ConnectionTarget(
    DatabaseKind kind,
    String host,
    int port,
    String username,
    String password,
    String databaseName,
    boolean ssl) {

  @Override
  public String toString() {
    return "ConnectionTarget[kind=" + kind + ", password=<redacted>]";
  }
}
