package com.katomus.godard.sgbd;

import com.katomus.godard.security.LocalValueCipher;
import org.springframework.stereotype.Service;

@Service
class ConnectionSecretCipher {

  private final LocalValueCipher cipher;

  ConnectionSecretCipher(LocalValueCipher cipher) {
    this.cipher = cipher;
  }

  String encrypt(String value) {
    return cipher.encrypt(value);
  }

  String decrypt(String value) {
    return cipher.decrypt(value);
  }
}
