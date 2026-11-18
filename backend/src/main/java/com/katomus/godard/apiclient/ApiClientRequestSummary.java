package com.katomus.godard.apiclient;

public record ApiClientRequestSummary(
    long id, Long collectionId, Long folderId, String name, String method) {}
