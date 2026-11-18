package com.katomus.godard.todo;

public record TodoItem(
    long id, String title, boolean completed, String createdAt, String completedAt) {}
