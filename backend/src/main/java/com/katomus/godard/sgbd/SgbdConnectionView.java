package com.katomus.godard.sgbd;

import java.util.List;

public record SgbdConnectionView(
    long id,
    String name,
    String kind,
    String label,
    String host,
    int port,
    String username,
    boolean hasPassword,
    String database,
    boolean ssl,
    boolean autoPing,
    boolean showAllSchemas,
    boolean showSystemSchemas,
    List<String> selectedSchemas,
    boolean selected) {

  @Override
  public String toString() {
    return "SgbdConnectionView[id="
        + id
        + ", kind="
        + kind
        + ", hasPassword="
        + hasPassword
        + ", selected="
        + selected
        + "]";
  }
}
