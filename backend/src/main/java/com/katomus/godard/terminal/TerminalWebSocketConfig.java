package com.katomus.godard.terminal;

import com.katomus.godard.docker.DockerLogHandshakeInterceptor;
import com.katomus.godard.docker.DockerLogsSocketHandler;
import com.katomus.godard.docker.DockerShellHandshakeInterceptor;
import com.katomus.godard.docker.DockerShellSocketHandler;
import com.katomus.godard.docker.DockerUpdateHandshakeInterceptor;
import com.katomus.godard.docker.DockerUpdateSocketHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

@Configuration
@EnableWebSocket
public class TerminalWebSocketConfig implements WebSocketConfigurer {

  private static final int MAX_MESSAGE_BYTES = 1024 * 1024;
  private static final String[] ALLOWED_ORIGINS = {
    "http://tauri.localhost", "tauri://localhost", "http://127.0.0.1:1420", "http://localhost:1420"
  };

  private final TerminalSocketHandler socketHandler;
  private final TerminalHandshakeInterceptor handshakeInterceptor;
  private final DockerLogsSocketHandler dockerLogsSocketHandler;
  private final DockerLogHandshakeInterceptor dockerLogHandshakeInterceptor;
  private final DockerShellSocketHandler dockerShellSocketHandler;
  private final DockerShellHandshakeInterceptor dockerShellHandshakeInterceptor;
  private final DockerUpdateSocketHandler dockerUpdateSocketHandler;
  private final DockerUpdateHandshakeInterceptor dockerUpdateHandshakeInterceptor;

  public TerminalWebSocketConfig(
      TerminalSocketHandler socketHandler,
      TerminalHandshakeInterceptor handshakeInterceptor,
      DockerLogsSocketHandler dockerLogsSocketHandler,
      DockerLogHandshakeInterceptor dockerLogHandshakeInterceptor,
      DockerShellSocketHandler dockerShellSocketHandler,
      DockerShellHandshakeInterceptor dockerShellHandshakeInterceptor,
      DockerUpdateSocketHandler dockerUpdateSocketHandler,
      DockerUpdateHandshakeInterceptor dockerUpdateHandshakeInterceptor) {
    this.socketHandler = socketHandler;
    this.handshakeInterceptor = handshakeInterceptor;
    this.dockerLogsSocketHandler = dockerLogsSocketHandler;
    this.dockerLogHandshakeInterceptor = dockerLogHandshakeInterceptor;
    this.dockerShellSocketHandler = dockerShellSocketHandler;
    this.dockerShellHandshakeInterceptor = dockerShellHandshakeInterceptor;
    this.dockerUpdateSocketHandler = dockerUpdateSocketHandler;
    this.dockerUpdateHandshakeInterceptor = dockerUpdateHandshakeInterceptor;
  }

  @Override
  public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
    registry
        .addHandler(socketHandler, "/api/terminal")
        .addInterceptors(handshakeInterceptor)
        .setAllowedOrigins(ALLOWED_ORIGINS);
    registry
        .addHandler(dockerLogsSocketHandler, "/api/docker/logs")
        .addInterceptors(dockerLogHandshakeInterceptor)
        .setAllowedOrigins(ALLOWED_ORIGINS);
    registry
        .addHandler(dockerShellSocketHandler, "/api/docker/shell")
        .addInterceptors(dockerShellHandshakeInterceptor)
        .setAllowedOrigins(ALLOWED_ORIGINS);
    registry
        .addHandler(dockerUpdateSocketHandler, "/api/docker/update")
        .addInterceptors(dockerUpdateHandshakeInterceptor)
        .setAllowedOrigins(ALLOWED_ORIGINS);
  }

  @Bean
  public ServletServerContainerFactoryBean webSocketContainer() {
    ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
    container.setMaxTextMessageBufferSize(MAX_MESSAGE_BYTES);
    return container;
  }
}
