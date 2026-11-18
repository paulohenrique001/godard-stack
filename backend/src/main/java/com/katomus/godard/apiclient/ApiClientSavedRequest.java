package com.katomus.godard.apiclient;

public record ApiClientSavedRequest(
    long id, Long collectionId, Long folderId, String name, ApiClientRequest request) {}
