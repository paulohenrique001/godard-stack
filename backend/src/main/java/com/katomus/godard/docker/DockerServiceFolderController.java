package com.katomus.godard.docker;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/api/docker", produces = MediaType.APPLICATION_JSON_VALUE)
class DockerServiceFolderController {

  record ConfigureServiceFolderRequest(String parentPath) {

    @Override
    public String toString() {
      return "ConfigureServiceFolderRequest[parentPath=<redacted>]";
    }
  }

  private final DockerServiceFolderService serviceFolderService;

  DockerServiceFolderController(DockerServiceFolderService serviceFolderService) {
    this.serviceFolderService = serviceFolderService;
  }

  @GetMapping("/service-folder")
  DockerServiceFolder current() {
    return serviceFolderService.current();
  }

  @GetMapping("/folders")
  DockerFolderListing folders(@RequestParam(name = "path", defaultValue = "") String path) {
    return serviceFolderService.folders(path);
  }

  @PutMapping(value = "/service-folder", consumes = MediaType.APPLICATION_JSON_VALUE)
  ResponseEntity<Void> configure(@RequestBody ConfigureServiceFolderRequest request) {
    serviceFolderService.configure(request == null ? null : request.parentPath());
    return ResponseEntity.noContent().build();
  }
}
