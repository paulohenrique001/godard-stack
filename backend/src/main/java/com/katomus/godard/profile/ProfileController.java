package com.katomus.godard.profile;

import com.katomus.godard.persistence.ActivityRepository;
import com.katomus.godard.persistence.UserProfileRepository;
import java.util.Objects;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/profile")
public class ProfileController {

  public record ProfileRequest(String name, String avatarSeed, String email, String language) {}

  private final UserProfileRepository userProfileRepository;
  private final ActivityRepository activityRepository;

  public ProfileController(
      UserProfileRepository userProfileRepository, ActivityRepository activityRepository) {
    this.userProfileRepository = userProfileRepository;
    this.activityRepository = activityRepository;
  }

  @PutMapping
  public ResponseEntity<UserProfile> save(@RequestBody ProfileRequest request) {
    String name = Objects.requireNonNullElse(request.name(), "").strip();
    if (name.length() < 3
        || name.length() > 25
        || name.codePoints().anyMatch(Character::isISOControl)) {
      return ResponseEntity.badRequest().build();
    }
    String avatarSeed =
        request.avatarSeed() == null || request.avatarSeed().isBlank()
            ? null
            : request.avatarSeed().strip();
    String email =
        request.email() == null || request.email().isBlank() ? null : request.email().strip();
    String language =
        request.language() == null || request.language().isBlank()
            ? null
            : request.language().strip();
    UserProfile profile = userProfileRepository.save(name, avatarSeed, email, language);
    activityRepository.create("system", "primary", "Perfil atualizado");
    return ResponseEntity.ok(profile);
  }
}
