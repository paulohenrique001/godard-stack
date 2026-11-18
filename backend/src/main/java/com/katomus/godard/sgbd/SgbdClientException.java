package com.katomus.godard.sgbd;

final class SgbdClientException extends Exception {

  SgbdClientException(String message) {
    super(message);
  }

  SgbdClientException(String message, Throwable cause) {
    super(message, cause);
  }
}
