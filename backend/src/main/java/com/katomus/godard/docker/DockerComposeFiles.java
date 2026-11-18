package com.katomus.godard.docker;

public record DockerComposeFiles(String composePath, String envPath, String compose, String env) {

  @Override
  public String toString() {
    return "DockerComposeFiles[composePath=<redacted>, envPath=<redacted>, compose=<redacted>, env=<redacted>]";
  }
}
