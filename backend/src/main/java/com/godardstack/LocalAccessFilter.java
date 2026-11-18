package com.godardstack;

import java.io.IOException;
import java.net.URI;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class LocalAccessFilter extends OncePerRequestFilter {

    private final String allowedOrigin;
    private final String allowedHost;

    public LocalAccessFilter(@Value("${allowed.origin}") String allowedOrigin) {
        this.allowedOrigin = allowedOrigin;
        this.allowedHost = URI.create(allowedOrigin).getAuthority();
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String origin = request.getHeader(HttpHeaders.ORIGIN);
        boolean allowed = allowedHost.equals(request.getHeader(HttpHeaders.HOST))
                && (origin == null || allowedOrigin.equals(origin));
        if (allowed) {
            chain.doFilter(request, response);
        } else {
            response.sendError(HttpServletResponse.SC_FORBIDDEN);
        }
    }
}
