package com.katomus.godard.dashboard;

import com.katomus.godard.persistence.ActivityRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/activities")
public class ActivityController {

  private final ActivityRepository activityRepository;

  public ActivityController(ActivityRepository activityRepository) {
    this.activityRepository = activityRepository;
  }

  @DeleteMapping
  public ResponseEntity<Void> clear() {
    activityRepository.clear();
    return ResponseEntity.noContent().build();
  }
}
