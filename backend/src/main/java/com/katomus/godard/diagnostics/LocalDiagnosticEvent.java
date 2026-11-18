package com.katomus.godard.diagnostics;

public record LocalDiagnosticEvent(
    long id, String eventType, String appVersion, String createdAt) {}
