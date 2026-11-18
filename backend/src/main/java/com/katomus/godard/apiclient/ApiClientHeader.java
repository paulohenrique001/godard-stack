package com.katomus.godard.apiclient;

public record ApiClientHeader(String name, String value) {

  @Override
  public String toString() {
    return "ApiClientHeader[name=" + name + ", value=<redacted>]";
  }
}
