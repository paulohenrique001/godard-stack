package com.godardstack;

import java.time.Duration;
import java.time.Instant;
import java.util.stream.Collectors;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/api/dashboard/resources", produces = MediaType.APPLICATION_JSON_VALUE)
public class DashboardResourceController {

    private static final int MAX_MINUTES = 7 * 24 * 60;

    private final DashboardResourceRepository repository;

    public DashboardResourceController(DashboardResourceRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<String> history(@RequestParam(name = "minutes", defaultValue = "30") int minutes) {
        if (minutes < 1 || minutes > MAX_MINUTES) {
            return ResponseEntity.badRequest().build();
        }
        String samples = repository.findSince(Instant.now().minus(Duration.ofMinutes(minutes))).stream()
                .map(sample -> "{\"at\":" + JsonStrings.quote(sample.capturedAt())
                        + ",\"memory\":" + sample.memory()
                        + ",\"disk\":" + (sample.disk() == null ? "null" : sample.disk()) + "}")
                .collect(Collectors.joining(",", "[", "]"));
        return ResponseEntity.ok(samples);
    }

    @PostMapping(consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<Void> save(@RequestParam("memory") int memory,
                                     @RequestParam(name = "disk", required = false) Integer disk) {
        if (!isPercentage(memory) || (disk != null && !isPercentage(disk))) {
            return ResponseEntity.badRequest().build();
        }
        repository.save(memory, disk);
        return ResponseEntity.noContent().build();
    }

    private boolean isPercentage(int value) {
        return value >= 0 && value <= 100;
    }
}
