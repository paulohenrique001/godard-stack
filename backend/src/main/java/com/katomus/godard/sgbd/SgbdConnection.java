package com.katomus.godard.sgbd;

record SgbdConnection(
    long id,
    String name,
    DatabaseKind kind,
    String host,
    int port,
    String username,
    String password,
    String databaseName,
    boolean ssl,
    boolean autoPing,
    boolean showAllSchemas,
    boolean showSystemSchemas,
    String selectedSchemas,
    boolean selected) {

  @Override
  public String toString() {
    return "SgbdConnection[id=" + id + ", kind=" + kind + ", password=<redacted>]";
  }
}
