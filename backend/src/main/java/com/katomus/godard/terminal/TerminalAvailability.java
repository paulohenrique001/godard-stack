package com.katomus.godard.terminal;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class TerminalAvailability {

  private static final Set<String> PRIVILEGED_USERS = Set.of("root", "SYSTEM");

  public record Capability(boolean available, String shell, String reason) {}

  public Capability capability() {
    String shell = shellCommand();
    if (PRIVILEGED_USERS.contains(System.getProperty("user.name", ""))) {
      return new Capability(false, shell, "O terminal não é executado como root ou administrador.");
    }
    if (!Files.isExecutable(Path.of(shell))) {
      return new Capability(false, shell, "O shell configurado nesta máquina não está disponível.");
    }
    return new Capability(true, shell, null);
  }

  public String shellCommand() {
    String shell = System.getenv("SHELL");
    if (shell == null || shell.isBlank()) {
      return "/bin/bash";
    }
    Path path = Path.of(shell);
    return path.isAbsolute() ? shell : "/bin/bash";
  }
}
