package com.katomus.godard.system;

import java.util.List;

public record SystemSnapshot(
    String hostname,
    String user,
    String operatingSystem,
    int processors,
    double loadAverage,
    long memoryTotal,
    long memoryAvailable,
    long diskTotal,
    long diskAvailable,
    List<String> tools) {}
