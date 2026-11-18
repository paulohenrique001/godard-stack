package com.katomus.godard.apiclient;

public record ApiClientRequestDraft(
    Long collectionId, Long folderId, String name, ApiClientRequest request) {}
