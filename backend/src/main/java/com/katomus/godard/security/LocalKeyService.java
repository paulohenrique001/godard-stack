package com.katomus.godard.security;

import com.katomus.godard.config.GodardProperties;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.SecureRandom;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class LocalKeyService {

  private static final Set<PosixFilePermission> OWNER_ONLY =
      PosixFilePermissions.fromString("rw-------");

  private final Path keyFile;

  public LocalKeyService(GodardProperties properties) {
    this.keyFile = Path.of(properties.dataDir(), "secrets", "connection.key");
  }

  @PostConstruct
  void ensureKey() throws IOException {
    if (!Files.exists(keyFile)) {
      byte[] key = new byte[32];
      new SecureRandom().nextBytes(key);
      Path temporary = Files.createTempFile(keyFile.getParent(), "connection", ".tmp");
      Files.write(temporary, key);
      setOwnerOnly(temporary);
      try {
        Files.move(temporary, keyFile, StandardCopyOption.ATOMIC_MOVE);
      } catch (AtomicMoveNotSupportedException ignored) {
        Files.move(temporary, keyFile);
      }
    }
    setOwnerOnly(keyFile);
  }

  public byte[] readKey() {
    try {
      byte[] key = Files.readAllBytes(keyFile);
      if (key.length != 32) {
        throw new IllegalStateException("A chave local de conexões é inválida.");
      }
      return key;
    } catch (IOException exception) {
      throw new IllegalStateException("Não foi possível ler a chave local de conexões.", exception);
    }
  }

  private void setOwnerOnly(Path file) {
    try {
      Files.setPosixFilePermissions(file, OWNER_ONLY);
    } catch (UnsupportedOperationException | IOException ignored) {
    }
  }
}
