package com.katomus.godard.terminal;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TerminalTicketService {

  private static final SecureRandom RANDOM = new SecureRandom();
  private static final long LIFETIME_SECONDS = 30;
  private static final int MAX_PENDING_TICKETS = 128;

  private record Ticket(long tabId, Instant expiresAt) {}

  private final Map<String, Ticket> tickets = new ConcurrentHashMap<>();

  public synchronized String issue(long tabId) {
    Instant now = Instant.now();
    tickets.entrySet().removeIf(entry -> !entry.getValue().expiresAt().isAfter(now));
    if (tickets.size() >= MAX_PENDING_TICKETS) {
      throw new ResponseStatusException(
          HttpStatus.TOO_MANY_REQUESTS, "Muitas conexões de terminal pendentes.");
    }
    byte[] bytes = new byte[24];
    RANDOM.nextBytes(bytes);
    String value = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    tickets.put(value, new Ticket(tabId, now.plusSeconds(LIFETIME_SECONDS)));
    return value;
  }

  public boolean consume(String value, long tabId) {
    Ticket ticket = tickets.remove(value);
    return ticket != null && ticket.tabId() == tabId && ticket.expiresAt().isAfter(Instant.now());
  }
}
