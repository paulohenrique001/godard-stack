package com.katomus.godard.sgbd;

import org.springframework.http.HttpStatus;

final class SgbdException extends RuntimeException {

  private final HttpStatus status;

  SgbdException(HttpStatus status, String message) {
    super(message);
    this.status = status;
  }

  HttpStatus status() {
    return status;
  }
}
