package com.katomus.godard.docker;

import org.springframework.http.HttpStatus;

class DockerException extends RuntimeException {

  private final HttpStatus status;

  DockerException(HttpStatus status, String message) {
    super(message);
    this.status = status;
  }

  HttpStatus status() {
    return status;
  }
}
