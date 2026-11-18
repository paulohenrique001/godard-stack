package com.katomus.godard.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfiguration implements WebMvcConfigurer {

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry
        .addMapping("/**")
        .allowedOrigins(
            "http://tauri.localhost",
            "tauri://localhost",
            "http://127.0.0.1:1420",
            "http://localhost:1420")
        .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
        .allowedHeaders("Content-Type", "X-Godard-Session")
        .exposedHeaders("Content-Type")
        .maxAge(3600);
  }
}
