package com.katomus.godard.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "godard")
public record GodardProperties(String dataDir, String sessionToken, String readyFile) {}
