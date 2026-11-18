package com.katomus.godard.bootstrap;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication(scanBasePackages = "com.katomus.godard")
@ConfigurationPropertiesScan(basePackages = "com.katomus.godard")
public class GodardStackApplication {

  public static void main(String[] args) throws IOException {
    String dataDirectory = requiredEnvironment("GODARD_DATA_DIR");
    requiredEnvironment("GODARD_SESSION_TOKEN");
    requiredEnvironment("GODARD_READY_FILE");
    Files.createDirectories(Path.of(dataDirectory, "data"));
    Files.createDirectories(Path.of(dataDirectory, "logs"));
    Files.createDirectories(Path.of(dataDirectory, "secrets"));
    SpringApplication.run(GodardStackApplication.class, args);
  }

  private static String requiredEnvironment(String name) {
    String value = System.getenv(name);
    if (value == null || value.isBlank()) {
      throw new IllegalStateException(name + " não definido");
    }
    return value;
  }
}
