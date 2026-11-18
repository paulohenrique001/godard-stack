package com.katomus.godard.todo;

public record TodoList(
    long id, long projectId, long labelId, String description, int sortOrder, String createdAt) {}
