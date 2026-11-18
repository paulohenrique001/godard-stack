package com.katomus.godard.bootstrap;

import java.util.Map;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal")
public class InternalController {

  private final JdbcClient jdbcClient;
  private final ConfigurableApplicationContext applicationContext;

  public InternalController(
      JdbcClient jdbcClient, ConfigurableApplicationContext applicationContext) {
    this.jdbcClient = jdbcClient;
    this.applicationContext = applicationContext;
  }

  @GetMapping("/health")
  public Map<String, String> health() {
    jdbcClient.sql("SELECT 1").query(Integer.class).single();
    return Map.of("status", "ok");
  }

  @PostMapping("/shutdown")
  public ResponseEntity<Void> shutdown() {
    Thread.ofVirtual().start(applicationContext::close);
    return ResponseEntity.accepted().build();
  }
}
