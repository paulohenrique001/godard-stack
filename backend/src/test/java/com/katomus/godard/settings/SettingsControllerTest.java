package com.katomus.godard.settings;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.katomus.godard.persistence.PreferencesRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;

class SettingsControllerTest {

  @Test
  void rejectsMissingOrUnsupportedPreferences() {
    CapturingPreferencesRepository repository = new CapturingPreferencesRepository();
    SettingsController controller = new SettingsController(repository);

    assertEquals(HttpStatus.BAD_REQUEST, controller.save(null).getStatusCode());
    assertEquals(
        HttpStatus.BAD_REQUEST,
        controller
            .save(new SettingsController.PreferencesRequest("invalid", "dashboard", 0))
            .getStatusCode());
    assertEquals(
        HttpStatus.BAD_REQUEST,
        controller
            .save(new SettingsController.PreferencesRequest("system", "dashboard", 0))
            .getStatusCode());
    assertEquals(
        HttpStatus.BAD_REQUEST,
        controller
            .save(new SettingsController.PreferencesRequest("dark", "unknown", 0))
            .getStatusCode());
    assertEquals(
        HttpStatus.BAD_REQUEST,
        controller
            .save(new SettingsController.PreferencesRequest("dark", "dashboard", -1))
            .getStatusCode());

    assertEquals(0, repository.saves);
  }

  @Test
  void savesValidPreferences() {
    CapturingPreferencesRepository repository = new CapturingPreferencesRepository();
    UserPreferences saved = new UserPreferences("dark", "todo", 8);
    repository.saved = saved;
    SettingsController controller = new SettingsController(repository);

    var response = controller.save(new SettingsController.PreferencesRequest("dark", "todo", 8));

    assertEquals(HttpStatus.OK, response.getStatusCode());
    assertEquals(saved, response.getBody());
    assertEquals(1, repository.saves);
    assertEquals(saved, repository.lastSaved);
  }

  private static final class CapturingPreferencesRepository extends PreferencesRepository {

    private int saves;
    private UserPreferences saved;
    private UserPreferences lastSaved;

    private CapturingPreferencesRepository() {
      super((JdbcClient) null);
    }

    @Override
    public UserPreferences save(String theme, String lastPage, long notificationsReadId) {
      saves++;
      lastSaved = new UserPreferences(theme, lastPage, notificationsReadId);
      return saved;
    }
  }
}
