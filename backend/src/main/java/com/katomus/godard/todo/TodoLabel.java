package com.katomus.godard.todo;

public record TodoLabel(
    long id,
    long projectId,
    String name,
    String color,
    int sortOrder,
    boolean system,
    String createdAt) {}
