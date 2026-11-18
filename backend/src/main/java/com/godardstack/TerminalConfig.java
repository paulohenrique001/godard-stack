package com.godardstack;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

@Configuration
@EnableWebSocket
public class TerminalConfig implements WebSocketConfigurer {

    private static final int MAX_MESSAGE_BYTES = 1024 * 1024;

    private final TerminalHandler terminalHandler;
    private final DockerLogsHandler dockerLogsHandler;
    private final DockerShellHandler dockerShellHandler;
    private final DockerUpdateHandler dockerUpdateHandler;
    private final String allowedOrigin;

    public TerminalConfig(TerminalHandler terminalHandler,
                          DockerLogsHandler dockerLogsHandler,
                          DockerShellHandler dockerShellHandler,
                          DockerUpdateHandler dockerUpdateHandler,
                          @Value("${allowed.origin}") String allowedOrigin) {
        this.terminalHandler = terminalHandler;
        this.dockerLogsHandler = dockerLogsHandler;
        this.dockerShellHandler = dockerShellHandler;
        this.dockerUpdateHandler = dockerUpdateHandler;
        this.allowedOrigin = allowedOrigin;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(terminalHandler, "/api/terminal")
                .addInterceptors(new StrictOriginInterceptor(allowedOrigin))
                .setAllowedOrigins(allowedOrigin);
        registry.addHandler(dockerLogsHandler, "/api/docker/logs")
                .addInterceptors(new StrictOriginInterceptor(allowedOrigin))
                .setAllowedOrigins(allowedOrigin);
        registry.addHandler(dockerShellHandler, "/api/docker/shell")
                .addInterceptors(new StrictOriginInterceptor(allowedOrigin))
                .setAllowedOrigins(allowedOrigin);
        registry.addHandler(dockerUpdateHandler, "/api/docker/update")
                .addInterceptors(new StrictOriginInterceptor(allowedOrigin))
                .setAllowedOrigins(allowedOrigin);
    }

    @Bean
    public ServletServerContainerFactoryBean webSocketContainer() {
        ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
        container.setMaxTextMessageBufferSize(MAX_MESSAGE_BYTES);
        return container;
    }
}
