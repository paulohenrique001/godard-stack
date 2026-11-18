package com.godardstack;

import java.util.Locale;
import java.util.regex.Pattern;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/api/user", produces = MediaType.TEXT_PLAIN_VALUE)
public class UserController {

    private static final int MIN_NAME_LENGTH = 3;
    private static final int MAX_NAME_LENGTH = 25;
    private static final Pattern AVATAR_SEED = Pattern.compile("[A-Za-z0-9]{8}");

    private final UserRepository userRepository;

    public UserController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<String> getName() {
        return userRepository.findName()
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping(consumes = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> saveName(@RequestBody String body) {
        String name = body.strip().toUpperCase(Locale.ROOT);
        if (!isValid(name)) {
            return ResponseEntity.badRequest().build();
        }
        userRepository.saveName(name);
        return ResponseEntity.ok(name);
    }

    @GetMapping("/avatar-seed")
    public ResponseEntity<String> getAvatarSeed() {
        return userRepository.findAvatarSeed()
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping(value = "/avatar-seed", consumes = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<Void> saveAvatarSeed(@RequestBody String seed) {
        if (!AVATAR_SEED.matcher(seed).matches()) {
            return ResponseEntity.badRequest().build();
        }
        userRepository.saveAvatarSeed(seed);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/avatar-seed")
    public ResponseEntity<Void> clearAvatarSeed() {
        userRepository.saveAvatarSeed(null);
        return ResponseEntity.noContent().build();
    }

    private boolean isValid(String name) {
        return name.length() >= MIN_NAME_LENGTH
                && name.length() <= MAX_NAME_LENGTH
                && name.codePoints().noneMatch(Character::isISOControl);
    }
}
