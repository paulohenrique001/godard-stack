package com.katomus.godard.security;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Service;

@Service
public class LocalValueCipher {

  private static final String PREFIX = "enc:v1:";
  private static final int IV_LENGTH = 12;
  private static final int TAG_LENGTH = 128;

  private final LocalKeyService keyService;
  private final SecureRandom random = new SecureRandom();

  public LocalValueCipher(LocalKeyService keyService) {
    this.keyService = keyService;
  }

  public String encrypt(String value) {
    if (value.isEmpty()) {
      return "";
    }
    try {
      byte[] iv = new byte[IV_LENGTH];
      random.nextBytes(iv);
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, key(), new GCMParameterSpec(TAG_LENGTH, iv));
      byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
      byte[] payload = Arrays.copyOf(iv, iv.length + encrypted.length);
      System.arraycopy(encrypted, 0, payload, iv.length, encrypted.length);
      return PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(payload);
    } catch (GeneralSecurityException exception) {
      throw new IllegalStateException("Não foi possível proteger o valor local.", exception);
    }
  }

  public String decrypt(String value) {
    if (value.isEmpty()) {
      return "";
    }
    if (!value.startsWith(PREFIX)) {
      throw new IllegalStateException("O valor local usa um formato desconhecido.");
    }
    try {
      byte[] payload = Base64.getUrlDecoder().decode(value.substring(PREFIX.length()));
      if (payload.length <= IV_LENGTH) {
        throw new GeneralSecurityException("payload inválido");
      }
      byte[] iv = Arrays.copyOfRange(payload, 0, IV_LENGTH);
      byte[] encrypted = Arrays.copyOfRange(payload, IV_LENGTH, payload.length);
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(TAG_LENGTH, iv));
      return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    } catch (IllegalArgumentException | GeneralSecurityException exception) {
      throw new IllegalStateException("Não foi possível abrir o valor local.", exception);
    }
  }

  private SecretKeySpec key() {
    return new SecretKeySpec(keyService.readKey(), "AES");
  }
}
