package com.katomus.godard.apiclient;

public record ApiClientAuthentication(String type, String token, String username, String password) {

  @Override
  public String toString() {
    return "ApiClientAuthentication[type=" + type + ", credentials=<redacted>]";
  }
}
