package com.katomus.godard.docker;

import java.util.List;

public record DockerContainer(
    String id,
    String name,
    String image,
    String createdAt,
    String state,
    boolean running,
    String status,
    String health,
    List<String> ports,
    boolean protectedContainer,
    boolean composeManaged,
    String composeFile) {

  @Override
  public String toString() {
    return "DockerContainer[id=<redacted>, name=<redacted>, image=<redacted>, composeFile=<redacted>]";
  }
}
