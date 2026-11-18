package com.katomus.godard.bootstrap;

import com.katomus.godard.config.GodardProperties;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class RuntimeReadyFile {

  private final GodardProperties properties;
  private final WebServerApplicationContext context;

  public RuntimeReadyFile(GodardProperties properties, WebServerApplicationContext context) {
    this.properties = properties;
    this.context = context;
  }

  @EventListener(ApplicationReadyEvent.class)
  void write() throws IOException {
    Path readyFile = Path.of(properties.readyFile());
    Files.createDirectories(readyFile.getParent());
    Path temporary = Files.createTempFile(readyFile.getParent(), "godard-ready", ".tmp");
    String content = "{\"port\":" + context.getWebServer().getPort() + "}";
    Files.writeString(temporary, content, StandardCharsets.UTF_8);
    try {
      Files.move(
          temporary,
          readyFile,
          StandardCopyOption.ATOMIC_MOVE,
          StandardCopyOption.REPLACE_EXISTING);
    } catch (AtomicMoveNotSupportedException exception) {
      Files.move(temporary, readyFile, StandardCopyOption.REPLACE_EXISTING);
    }
  }
}
