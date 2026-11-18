package com.katomus.godard.todo;

import java.util.List;

public record TodoPage(
    long id,
    long projectId,
    String icon,
    String title,
    String content,
    List<Long> labelIds,
    int sortOrder,
    String dueDate,
    String createdAt,
    String updatedAt) {}
