package com.katomus.godard.docker;

public record DockerComposeFilesRequest(String compose, String env) {

  @Override
  public String toString() {
    return "DockerComposeFilesRequest[compose=<redacted>, env=<redacted>]";
  }
}
