package com.katomus.godard.terminal;

import com.katomus.godard.persistence.ActivityRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/terminal/access")
public class TerminalAccessController {

  private final TerminalAccessService accessService;
  private final ActivityRepository activityRepository;

  public TerminalAccessController(
      TerminalAccessService accessService, ActivityRepository activityRepository) {
    this.accessService = accessService;
    this.activityRepository = activityRepository;
  }

  @GetMapping
  public TerminalAccessService.Access access() {
    return accessService.access();
  }

  @PutMapping
  public TerminalAccessService.Access accept() {
    TerminalAccessService.Access access = accessService.accept();
    activityRepository.create("console", "primary", "Terminal local autorizado");
    return access;
  }
}
