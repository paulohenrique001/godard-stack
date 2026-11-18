package com.katomus.godard.apiclient;

import java.util.List;

public record ApiClientRequest(
    String method,
    String url,
    List<ApiClientHeader> headers,
    String body,
    ApiClientAuthentication authentication) {

  @Override
  public String toString() {
    return "ApiClientRequest[method="
        + method
        + ", url=<redacted>, headers="
        + (headers == null ? 0 : headers.size())
        + ", body=<redacted>]";
  }
}
