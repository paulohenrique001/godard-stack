package com.katomus.godard.docker;

import java.util.List;

public record DockerFolderListing(String path, String parent, String target, List<String> folders) {

  @Override
  public String toString() {
    return "DockerFolderListing[path=<redacted>, parent=<redacted>, target=<redacted>, folders=<redacted>]";
  }
}
