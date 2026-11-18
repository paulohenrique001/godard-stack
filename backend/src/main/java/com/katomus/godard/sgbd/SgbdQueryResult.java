package com.katomus.godard.sgbd;

import java.util.List;

public record SgbdQueryResult(
    String message,
    List<String> columns,
    List<List<String>> rows,
    Long affectedRows,
    boolean truncated,
    long elapsedMs) {

  @Override
  public String toString() {
    return "SgbdQueryResult[columns="
        + columns.size()
        + ", rows=<redacted>, affectedRows="
        + affectedRows
        + ", truncated="
        + truncated
        + ", elapsedMs="
        + elapsedMs
        + "]";
  }
}
