package com.katomus.godard.sgbd;

public record SgbdConsoleView(
    long id,
    String label,
    String database,
    String query,
    int editorPercent,
    boolean active,
    String outputLog,
    String savedResult,
    boolean resultsMinimized) {

  @Override
  public String toString() {
    return "SgbdConsoleView[id="
        + id
        + ", editorPercent="
        + editorPercent
        + ", active="
        + active
        + ", resultsMinimized="
        + resultsMinimized
        + "]";
  }
}
