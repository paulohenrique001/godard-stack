package com.katomus.godard.sgbd;

public record SgbdConsoleDraft(String database) {

  @Override
  public String toString() {
    return "SgbdConsoleDraft[database=<redacted>]";
  }
}
