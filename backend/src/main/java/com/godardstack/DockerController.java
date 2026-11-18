package com.godardstack;

import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/api/docker/containers", produces = MediaType.TEXT_PLAIN_VALUE)
public class DockerController {

    private static final Pattern CONTAINER_ID = Pattern.compile("[a-f0-9]{12,64}");
    private static final Pattern PROJECT_NAME = Pattern.compile("[a-z0-9][a-z0-9_-]{0,62}");
    private static final int MAX_BODY_CHARS = 2 * 1024 * 1024;
    private static final String MISSING = "missing";
    private static final String SELF_MESSAGE = "Este é o container da própria aplicação.";
    private static final Set<String> ACTIONS = Set.of("start", "stop", "restart", "remove");
    private static final Set<String> BLOCKED_ON_SELF = Set.of("stop", "remove");
    private static final String OK_PREFIX = "ok\n";
    private static final String FAILED_PREFIX = "failed\n";
    private static final int UNPROCESSABLE = 422;

    private final AgentHealthClient agentHealthClient;
    private final ServiceFolderRepository serviceFolderRepository;
    private final String selfId;

    public DockerController(AgentHealthClient agentHealthClient,
                            ServiceFolderRepository serviceFolderRepository,
                            @Value("${HOSTNAME:}") String selfId) {
        this.agentHealthClient = agentHealthClient;
        this.serviceFolderRepository = serviceFolderRepository;
        this.selfId = selfId;
    }

    @GetMapping
    public ResponseEntity<String> containers() {
        return agentHealthClient.dockerContainers()
                .filter(report -> report.startsWith(OK_PREFIX))
                .map(report -> ResponseEntity.ok(selfId + "\n" + report.substring(OK_PREFIX.length())))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build());
    }

    @PostMapping("/{id}/{action}")
    public ResponseEntity<String> action(@PathVariable("id") String id, @PathVariable("action") String action) {
        if (!CONTAINER_ID.matcher(id).matches() || !ACTIONS.contains(action)) {
            return ResponseEntity.badRequest().build();
        }
        if (BLOCKED_ON_SELF.contains(action) && isSelf(id)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(SELF_MESSAGE);
        }
        return agentHealthClient.dockerAction(action, id)
                .map(this::actionResponse)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build());
    }

    @GetMapping("/{id}/metrics")
    public ResponseEntity<String> metrics(@PathVariable("id") String id) {
        if (!CONTAINER_ID.matcher(id).matches()) {
            return ResponseEntity.badRequest().build();
        }
        return agentHealthClient.dockerStats(id)
                .filter(report -> report.startsWith(OK_PREFIX))
                .map(report -> ResponseEntity.ok(report.substring(OK_PREFIX.length())))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build());
    }

    @GetMapping("/{id}/files")
    public ResponseEntity<String> files(@PathVariable("id") String id) {
        if (!CONTAINER_ID.matcher(id).matches()) {
            return ResponseEntity.badRequest().build();
        }
        return agentHealthClient.dockerFiles(id)
                .map(this::filesResponse)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build());
    }

    @PutMapping(value = "/{id}/files", consumes = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> saveFiles(@PathVariable("id") String id, @RequestBody String body) {
        if (!CONTAINER_ID.matcher(id).matches() || body.length() > MAX_BODY_CHARS) {
            return ResponseEntity.badRequest().build();
        }
        if (isSelf(id)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(SELF_MESSAGE);
        }
        return agentHealthClient.saveDockerFiles(id, body)
                .map(this::actionResponse)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build());
    }

    @PostMapping(consumes = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> create(@RequestParam("name") String name, @RequestBody String body) {
        if (!PROJECT_NAME.matcher(name).matches() || body.length() > MAX_BODY_CHARS) {
            return ResponseEntity.badRequest().build();
        }
        return serviceFolderRepository.find()
                .flatMap(folder -> agentHealthClient.createDockerContainer(name, folder, body))
                .map(this::actionResponse)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build());
    }

    private ResponseEntity<String> filesResponse(String report) {
        if (MISSING.equals(report)) {
            return ResponseEntity.notFound().build();
        }
        if (report.startsWith(OK_PREFIX)) {
            return ResponseEntity.ok(report.substring(OK_PREFIX.length()));
        }
        return ResponseEntity.status(UNPROCESSABLE).body(report.substring(FAILED_PREFIX.length()));
    }

    private ResponseEntity<String> actionResponse(String report) {
        if (report.startsWith(FAILED_PREFIX)) {
            return ResponseEntity.status(UNPROCESSABLE).body(report.substring(FAILED_PREFIX.length()));
        }
        return ResponseEntity.noContent().build();
    }

    private boolean isSelf(String id) {
        return !selfId.isEmpty() && id.startsWith(selfId);
    }
}
