package com.godardstack;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class DockerLogsHandler extends DockerStreamHandler {

    public DockerLogsHandler(@Value("${agent.url}") String agentUrl,
                             @Value("${agent.token}") String agentToken) {
        super(agentUrl, agentToken, "/docker/logs");
    }
}
