package com.godardstack;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class DockerShellHandler extends DockerStreamHandler {

    private final String selfId;

    public DockerShellHandler(@Value("${agent.url}") String agentUrl,
                              @Value("${agent.token}") String agentToken,
                              @Value("${HOSTNAME:}") String selfId) {
        super(agentUrl, agentToken, "/docker/shell");
        this.selfId = selfId;
    }

    @Override
    boolean isAllowed(String container) {
        return selfId.isEmpty() || !container.startsWith(selfId);
    }
}
