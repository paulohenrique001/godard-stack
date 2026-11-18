package com.godardstack;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

    private static final long MIN_FREE_BYTES = 10L * 1024 * 1024;
    private static final String OK = "ok";
    private static final String FAIL = "fail";
    private static final String WARN = "warn";
    private static final String UNKNOWN = "unknown";
    private static final String UNSET = "unset";

    private final UserRepository userRepository;
    private final ServiceFolderRepository serviceFolderRepository;
    private final AgentHealthClient agentHealthClient;
    private final Path dataDir;

    public HealthController(UserRepository userRepository,
                            ServiceFolderRepository serviceFolderRepository,
                            AgentHealthClient agentHealthClient,
                            @Value("${data.dir}") String dataDir) {
        this.userRepository = userRepository;
        this.serviceFolderRepository = serviceFolderRepository;
        this.agentHealthClient = agentHealthClient;
        this.dataDir = Path.of(dataDir);
    }

    @GetMapping(value = "/api/health", produces = MediaType.APPLICATION_JSON_VALUE)
    public String health() {
        AgentHealthClient.AgentHealth agent = agentHealthClient.check();
        boolean online = agent.connection() == AgentHealthClient.Connection.ONLINE;

        Map<String, String> checks = new LinkedHashMap<>();
        checks.put("database", checkDatabase());
        checks.put("storage", checkStorage());
        checks.put("agent", agent.connection().name().toLowerCase());
        checks.put("shell", online ? (agent.shellAvailable() ? OK : FAIL) : UNKNOWN);
        checks.put("agentUser", online ? (agent.privileged() ? WARN : OK) : UNKNOWN);

        Optional<String> serviceFolder = configuredServiceFolder();
        checks.put("serviceFolder", online ? checkServiceFolder(serviceFolder) : UNKNOWN);
        serviceFolder.ifPresent(path -> checks.put("serviceFolderPath", path));

        return checks.entrySet().stream()
                .map(check -> JsonStrings.quote(check.getKey()) + ":" + JsonStrings.quote(check.getValue()))
                .collect(Collectors.joining(",", "{", "}"));
    }

    private Optional<String> configuredServiceFolder() {
        try {
            return serviceFolderRepository.find();
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    private String checkServiceFolder(Optional<String> serviceFolder) {
        return serviceFolder
                .map(path -> agentHealthClient.checkServiceFolder(path).orElse(UNKNOWN))
                .orElse(UNSET);
    }

    private String checkDatabase() {
        try {
            userRepository.findName();
            return OK;
        } catch (RuntimeException e) {
            return FAIL;
        }
    }

    private String checkStorage() {
        try {
            Files.delete(Files.createTempFile(dataDir, "health", null));
            return Files.getFileStore(dataDir).getUsableSpace() >= MIN_FREE_BYTES ? OK : FAIL;
        } catch (IOException e) {
            return FAIL;
        }
    }
}
