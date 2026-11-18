package com.katomus.godard.bootstrap;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.katomus.godard.config.GodardProperties;
import com.katomus.godard.dashboard.Activity;
import com.katomus.godard.persistence.ActivityRepository;
import com.katomus.godard.system.SystemSnapshot;
import com.katomus.godard.system.SystemSnapshotService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;

class BootstrapControllerTest {

  @Test
  void returnsOnlyDashboardDataForIncrementalRefreshes() {
    SystemSnapshot snapshot =
        new SystemSnapshot("host", "user", "Ubuntu", 4, 0.5, 16, 8, 100, 50, List.of("git"));
    List<Activity> activities =
        List.of(new Activity(1, "system", "success", "Pronto", "2026-11-10T00:00:00Z"));
    BootstrapController controller =
        new BootstrapController(
            null,
            null,
            new FixedActivityRepository(activities),
            new FixedSystemSnapshotService(snapshot));

    BootstrapController.DashboardResponse response = controller.dashboard();

    assertEquals(snapshot, response.system());
    assertEquals(activities, response.activities());
  }

  private static final class FixedActivityRepository extends ActivityRepository {

    private final List<Activity> activities;

    private FixedActivityRepository(List<Activity> activities) {
      super((JdbcClient) null);
      this.activities = activities;
    }

    @Override
    public List<Activity> latest(int limit) {
      return activities;
    }
  }

  private static final class FixedSystemSnapshotService extends SystemSnapshotService {

    private final SystemSnapshot snapshot;

    private FixedSystemSnapshotService(SystemSnapshot snapshot) {
      super(new GodardProperties(".", "test", "test"));
      this.snapshot = snapshot;
    }

    @Override
    public SystemSnapshot snapshot() {
      return snapshot;
    }
  }
}
