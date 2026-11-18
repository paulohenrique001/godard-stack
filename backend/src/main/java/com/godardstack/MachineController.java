package com.godardstack;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MachineController {

    private final AgentHealthClient agentHealthClient;

    public MachineController(AgentHealthClient agentHealthClient) {
        this.agentHealthClient = agentHealthClient;
    }

    @GetMapping(value = "/api/machine", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> machine() {
        return agentHealthClient.machineInfo()
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build());
    }

    @GetMapping(value = "/api/tools", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> tools() {
        return agentHealthClient.installedTools()
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build());
    }
}
