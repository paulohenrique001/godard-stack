package com.katomus.godard.bootstrap;

import com.katomus.godard.dashboard.Activity;
import com.katomus.godard.dashboard.ModuleStatus;
import com.katomus.godard.persistence.ActivityRepository;
import com.katomus.godard.persistence.PreferencesRepository;
import com.katomus.godard.persistence.UserProfileRepository;
import com.katomus.godard.profile.UserProfile;
import com.katomus.godard.settings.UserPreferences;
import com.katomus.godard.system.SystemSnapshot;
import com.katomus.godard.system.SystemSnapshotService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class BootstrapController {

  public record BootstrapResponse(
      UserProfile user,
      UserPreferences preferences,
      SystemSnapshot system,
      List<Activity> activities,
      List<ModuleStatus> modules) {}

  public record DashboardResponse(SystemSnapshot system, List<Activity> activities) {}

  private final UserProfileRepository userProfileRepository;
  private final PreferencesRepository preferencesRepository;
  private final ActivityRepository activityRepository;
  private final SystemSnapshotService systemSnapshotService;

  public BootstrapController(
      UserProfileRepository userProfileRepository,
      PreferencesRepository preferencesRepository,
      ActivityRepository activityRepository,
      SystemSnapshotService systemSnapshotService) {
    this.userProfileRepository = userProfileRepository;
    this.preferencesRepository = preferencesRepository;
    this.activityRepository = activityRepository;
    this.systemSnapshotService = systemSnapshotService;
  }

  @GetMapping("/bootstrap")
  public BootstrapResponse bootstrap() {
    return new BootstrapResponse(
        userProfileRepository.find().orElse(null),
        preferencesRepository.find(),
        systemSnapshotService.snapshot(),
        activityRepository.latest(12),
        modules());
  }

  @GetMapping("/dashboard")
  public DashboardResponse dashboard() {
    return new DashboardResponse(systemSnapshotService.snapshot(), activityRepository.latest(12));
  }

  private List<ModuleStatus> modules() {
    return List.of(
        new ModuleStatus("terminal", "Terminal", "available", "Terminal local disponível."),
        new ModuleStatus(
            "sgbd", "Bancos de dados", "available", "Clientes locais para MariaDB, MySQL e Redis."),
        new ModuleStatus(
            "docker",
            "Contêineres",
            "available",
            "Disponível quando o Docker local estiver acessível."));
  }
}
