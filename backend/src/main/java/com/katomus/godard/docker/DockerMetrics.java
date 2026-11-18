package com.katomus.godard.docker;

public record DockerMetrics(Double cpuPercent, String memoryUsage, Double memoryPercent) {}
