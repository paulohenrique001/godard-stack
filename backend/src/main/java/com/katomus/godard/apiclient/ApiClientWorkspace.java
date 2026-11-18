package com.katomus.godard.apiclient;

import java.util.List;

public record ApiClientWorkspace(
    List<ApiClientCollection> collections,
    List<ApiClientFolder> folders,
    List<ApiClientRequestSummary> requests,
    List<ApiClientVariable> variables,
    ApiClientWorkspaceState viewState) {}
