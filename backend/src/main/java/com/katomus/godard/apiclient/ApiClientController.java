package com.katomus.godard.apiclient;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/api/client", produces = MediaType.APPLICATION_JSON_VALUE)
public class ApiClientController {

  private final ApiClientService service;

  public ApiClientController(ApiClientService service) {
    this.service = service;
  }

  @PostMapping(value = "/execute", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ApiClientResponse execute(@RequestBody ApiClientRequest request) {
    return service.execute(request);
  }
}
