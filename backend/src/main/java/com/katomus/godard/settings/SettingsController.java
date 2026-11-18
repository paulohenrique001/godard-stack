package com.katomus.godard.settings;

import com.katomus.godard.persistence.PreferencesRepository;
import java.util.Set;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/preferences")
public class SettingsController {

  public record PreferencesRequest(String theme, String lastPage, long notificationsReadId) {}

  private static final Set<String> THEMES = Set.of("light", "dark");
  private static final Set<String> PAGES =
      Set.of(
          "dashboard", "todo", "api-client", "terminal", "sgbd", "docker", "settings", "activity");

  private final PreferencesRepository preferencesRepository;

  public SettingsController(PreferencesRepository preferencesRepository) {
    this.preferencesRepository = preferencesRepository;
  }

  @PutMapping
  public ResponseEntity<UserPreferences> save(@RequestBody PreferencesRequest request) {
    if (request == null
        || request.theme() == null
        || request.lastPage() == null
        || !THEMES.contains(request.theme())
        || !PAGES.contains(request.lastPage())
        || request.notificationsReadId() < 0) {
      return ResponseEntity.badRequest().build();
    }
    return ResponseEntity.ok(
        preferencesRepository.save(
            request.theme(), request.lastPage(), request.notificationsReadId()));
  }
}
