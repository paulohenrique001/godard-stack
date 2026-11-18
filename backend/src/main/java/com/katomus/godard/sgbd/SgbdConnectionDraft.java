package com.katomus.godard.sgbd;

import java.util.List;

public record SgbdConnectionDraft(
    String name,
    String kind,
    String host,
    Integer port,
    String username,
    String password,
    boolean passwordChanged,
    String database,
    boolean ssl,
    boolean autoPing,
    boolean showAllSchemas,
    boolean showSystemSchemas,
    List<String> selectedSchemas) {

  @Override
  public String toString() {
    return "SgbdConnectionDraft[password=<redacted>, passwordChanged=" + passwordChanged + "]";
  }
}
