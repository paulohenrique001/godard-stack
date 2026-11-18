package com.katomus.godard.security;

import com.katomus.godard.config.GodardProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class SessionTokenFilter extends OncePerRequestFilter {

  private static final String SESSION_HEADER = "X-Godard-Session";

  private final byte[] expectedToken;

  public SessionTokenFilter(GodardProperties properties) {
    this.expectedToken = properties.sessionToken().getBytes(StandardCharsets.UTF_8);
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    if ("GET".equalsIgnoreCase(request.getMethod())
        && ("/api/terminal".equals(request.getRequestURI())
            || "/api/docker/logs".equals(request.getRequestURI())
            || "/api/docker/shell".equals(request.getRequestURI())
            || "/api/docker/update".equals(request.getRequestURI()))) {
      return true;
    }
    return !(request.getRequestURI().startsWith("/api/")
        || request.getRequestURI().startsWith("/internal/"));
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
      chain.doFilter(request, response);
      return;
    }
    String received = request.getHeader(SESSION_HEADER);
    boolean valid =
        received != null
            && MessageDigest.isEqual(expectedToken, received.getBytes(StandardCharsets.UTF_8));
    if (!valid) {
      response.sendError(HttpStatus.FORBIDDEN.value());
      return;
    }
    response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
    chain.doFilter(request, response);
  }
}
