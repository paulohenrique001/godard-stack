package com.katomus.godard.diagnostics;

import com.katomus.godard.persistence.LocalDiagnosticsRepository;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/diagnostics")
public class LocalDiagnosticsController {

  private static final Set<String> ALLOWED_TYPES =
      Set.of(
          "update_check",
          "update_available",
          "update_install_started",
          "update_install_completed",
          "update_error");

  private static final Pattern VERSION_PATTERN = Pattern.compile("\\d+\\.\\d+\\.\\d+");

  public record DiagnosticEventRequest(String type, String appVersion) {}

  private final LocalDiagnosticsRepository diagnosticsRepository;

  public LocalDiagnosticsController(LocalDiagnosticsRepository diagnosticsRepository) {
    this.diagnosticsRepository = diagnosticsRepository;
  }

  @PostMapping("/events")
  public ResponseEntity<Void> record(@RequestBody DiagnosticEventRequest request) {
    if (request == null
        || request.type() == null
        || !ALLOWED_TYPES.contains(request.type())
        || request.appVersion() == null
        || !VERSION_PATTERN.matcher(request.appVersion()).matches()) {
      return ResponseEntity.badRequest().build();
    }
    diagnosticsRepository.record(request.type(), request.appVersion());
    return ResponseEntity.noContent().build();
  }

  @DeleteMapping("/events")
  public ResponseEntity<Void> clear() {
    diagnosticsRepository.clear();
    return ResponseEntity.noContent().build();
  }

  public List<LocalDiagnosticEvent> latest() {
    return diagnosticsRepository.latest();
  }
}
