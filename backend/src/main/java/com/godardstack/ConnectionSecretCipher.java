package com.godardstack;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
class ConnectionSecretCipher {

    private static final String LEGACY_PREFIX = "enc:v1:";
    private static final String PREFIX = "enc:v2:";
    private static final int IV_LENGTH = 12;
    private static final int TAG_LENGTH = 128;

    private final SecretKeySpec key;
    private final SecretKeySpec legacyKey;
    private final SecureRandom random = new SecureRandom();

    ConnectionSecretCipher(@Value("${connection.encryption.key}") String encryptionKey,
                           @Value("${agent.token}") String agentToken) {
        try {
            this.key = keyFor(encryptionKey);
            this.legacyKey = keyFor(agentToken);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Não foi possível preparar a criptografia local.", exception);
        }
    }

    String encrypt(String value) {
        if (value.isEmpty()) {
            return value;
        }
        try {
            byte[] iv = new byte[IV_LENGTH];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH, iv));
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] payload = Arrays.copyOf(iv, iv.length + encrypted.length);
            System.arraycopy(encrypted, 0, payload, iv.length, encrypted.length);
            return PREFIX + Base64.getEncoder().encodeToString(payload);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Não foi possível criptografar a senha local.", exception);
        }
    }

    String decrypt(String value) {
        if (value.isEmpty() || (!value.startsWith(PREFIX) && !value.startsWith(LEGACY_PREFIX))) {
            return value;
        }
        try {
            boolean legacy = value.startsWith(LEGACY_PREFIX);
            byte[] payload = Base64.getDecoder().decode(value.substring((legacy ? LEGACY_PREFIX : PREFIX).length()));
            byte[] iv = Arrays.copyOfRange(payload, 0, IV_LENGTH);
            byte[] encrypted = Arrays.copyOfRange(payload, IV_LENGTH, payload.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, legacy ? legacyKey : key, new GCMParameterSpec(TAG_LENGTH, iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException | GeneralSecurityException exception) {
            throw new IllegalStateException("Não foi possível ler uma senha salva.", exception);
        }
    }

    boolean needsMigration(String value) {
        return !value.isEmpty() && !value.startsWith(PREFIX);
    }

    private SecretKeySpec keyFor(String value) throws GeneralSecurityException {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        return new SecretKeySpec(digest, "AES");
    }
}
