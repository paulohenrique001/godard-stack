package com.katomus.godard.docker;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
class DockerStreamTicketService {

  enum Purpose {
    LOGS,
    SHELL,
    UPDATE
  }

  private static final SecureRandom RANDOM = new SecureRandom();
  private static final long LIFETIME_SECONDS = 30;
  private static final int MAX_PENDING_TICKETS = 128;

  private record Ticket(Purpose purpose, String containerId, Instant expiresAt) {}

  private final Map<String, Ticket> tickets = new ConcurrentHashMap<>();

  synchronized String issue(Purpose purpose, String containerId) {
    Instant now = Instant.now();
    tickets.entrySet().removeIf(entry -> !entry.getValue().expiresAt().isAfter(now));
    if (tickets.size() >= MAX_PENDING_TICKETS) {
      throw new ResponseStatusException(
          HttpStatus.TOO_MANY_REQUESTS, "Muitos fluxos Docker pendentes.");
    }
    byte[] bytes = new byte[24];
    RANDOM.nextBytes(bytes);
    String value = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    tickets.put(value, new Ticket(purpose, containerId, now.plusSeconds(LIFETIME_SECONDS)));
    return value;
  }

  boolean consume(Purpose purpose, String value, String containerId) {
    Ticket ticket = tickets.remove(value);
    return ticket != null
        && ticket.purpose() == purpose
        && ticket.containerId().equals(containerId)
        && ticket.expiresAt().isAfter(Instant.now());
  }
}
