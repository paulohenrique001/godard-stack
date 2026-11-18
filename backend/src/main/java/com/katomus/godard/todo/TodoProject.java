package com.katomus.godard.todo;

public record TodoProject(
    long id, String icon, String name, String description, int sortOrder, String createdAt) {}
