package com.katomus.godard.sgbd;

public record SgbdConsoleUpdate(
    String label,
    String database,
    String query,
    Integer editorPercent,
    String outputLog,
    String savedResult,
    Boolean resultsMinimized) {

  @Override
  public String toString() {
    return "SgbdConsoleUpdate[label=<redacted>, database=<redacted>, query=<redacted>, editorPercent="
        + editorPercent
        + ", outputLog=<redacted>, savedResult=<redacted>, resultsMinimized="
        + resultsMinimized
        + "]";
  }
}
