package com.katomus.godard.docker;

public record DockerServiceFolder(String path) {

  @Override
  public String toString() {
    return "DockerServiceFolder[path=<redacted>]";
  }
}
