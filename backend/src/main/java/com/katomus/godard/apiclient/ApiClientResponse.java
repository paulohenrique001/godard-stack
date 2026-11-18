package com.katomus.godard.apiclient;

import java.util.List;

public record ApiClientResponse(
    int status,
    List<ApiClientHeader> headers,
    String body,
    String contentType,
    long elapsedMs,
    long sizeBytes,
    boolean truncated,
    boolean binary) {

  @Override
  public String toString() {
    return "ApiClientResponse[status="
        + status
        + ", headers="
        + headers.size()
        + ", body=<redacted>, contentType="
        + contentType
        + ", elapsedMs="
        + elapsedMs
        + ", sizeBytes="
        + sizeBytes
        + ", truncated="
        + truncated
        + ", binary="
        + binary
        + "]";
  }
}
