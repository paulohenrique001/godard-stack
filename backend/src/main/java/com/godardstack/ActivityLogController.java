package com.godardstack;

import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.godardstack.ActivityLogRepository.ActivityLog;

@RestController
@RequestMapping(value = "/api/activities", produces = MediaType.APPLICATION_JSON_VALUE)
public class ActivityLogController {

    private static final Set<String> KINDS = Set.of("container", "connection", "console", "command", "system");
    private static final Set<String> TONES = Set.of("success", "primary", "muted", "warning");
    private static final Set<Integer> PAGE_SIZES = Set.of(5, 10, 25, 50);
    private static final int MAX_MESSAGE_LENGTH = 500;
    private static final int MAX_QUERY_LENGTH = 100;

    private final ActivityLogRepository repository;

    public ActivityLogController(ActivityLogRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<String> list(@RequestParam(name = "query", defaultValue = "") String query,
                                       @RequestParam(name = "page", defaultValue = "0") int page,
                                       @RequestParam(name = "size", defaultValue = "10") int size) {
        String term = query.strip();
        if (page < 0 || !PAGE_SIZES.contains(size) || term.length() > MAX_QUERY_LENGTH) {
            return ResponseEntity.badRequest().build();
        }
        int offset;
        try {
            offset = Math.multiplyExact(page, size);
        } catch (ArithmeticException e) {
            return ResponseEntity.badRequest().build();
        }
        var activities = repository.find(term, offset, size);
        long total = repository.count(term);
        return ResponseEntity.ok(toJson(activities, total));
    }

    @PostMapping(consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<Void> create(@RequestParam("kind") String kind,
                                       @RequestParam("tone") String tone,
                                       @RequestParam("message") String message) {
        String text = message.strip();
        if (!KINDS.contains(kind) || !TONES.contains(tone) || text.isEmpty() || text.length() > MAX_MESSAGE_LENGTH
                || text.codePoints().anyMatch(Character::isISOControl)) {
            return ResponseEntity.badRequest().build();
        }
        repository.create(kind, tone, text);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    public ResponseEntity<Void> clear() {
        repository.clear();
        return ResponseEntity.noContent().build();
    }

    private String toJson(java.util.List<ActivityLog> activities, long total) {
        String items = activities.stream().map(this::toJson).collect(Collectors.joining(",", "[", "]"));
        return "{\"items\":" + items + ",\"total\":" + total + "}";
    }

    private String toJson(ActivityLog activity) {
        return "{\"id\":" + activity.id()
                + ",\"kind\":" + JsonStrings.quote(activity.kind())
                + ",\"tone\":" + JsonStrings.quote(activity.tone())
                + ",\"message\":" + JsonStrings.quote(activity.message())
                + ",\"createdAt\":" + JsonStrings.quote(activity.createdAt()) + "}";
    }
}
