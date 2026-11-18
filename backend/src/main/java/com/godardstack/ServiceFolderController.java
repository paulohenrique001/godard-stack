package com.godardstack;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ServiceFolderController {

    private static final int MAX_PATH_LENGTH = 1024;
    private static final int UNPROCESSABLE = 422;
    private static final String OK = "ok";
    private static final String LISTING_PREFIX = OK + "\n";

    private final AgentHealthClient agentHealthClient;
    private final ServiceFolderRepository serviceFolderRepository;

    public ServiceFolderController(AgentHealthClient agentHealthClient,
                                   ServiceFolderRepository serviceFolderRepository) {
        this.agentHealthClient = agentHealthClient;
        this.serviceFolderRepository = serviceFolderRepository;
    }

    @GetMapping(value = "/api/folders", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> folders(@RequestParam(name = "path", defaultValue = "") String path) {
        return agentHealthClient.listFolders(path)
                .filter(listing -> listing.startsWith(LISTING_PREFIX))
                .map(listing -> ResponseEntity.ok(listing.substring(LISTING_PREFIX.length())))
                .orElseGet(() -> ResponseEntity.status(UNPROCESSABLE).build());
    }

    @PutMapping(value = "/api/service-folder", consumes = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<Void> save(@RequestBody String body) {
        String path = body.strip();
        if (!isValid(path)) {
            return ResponseEntity.badRequest().build();
        }
        if (!agentHealthClient.createServiceFolder(path).filter(OK::equals).isPresent()) {
            return ResponseEntity.status(UNPROCESSABLE).build();
        }
        serviceFolderRepository.save(path);
        return ResponseEntity.noContent().build();
    }

    private boolean isValid(String path) {
        return !path.isEmpty()
                && path.length() <= MAX_PATH_LENGTH
                && path.codePoints().noneMatch(Character::isISOControl);
    }
}
