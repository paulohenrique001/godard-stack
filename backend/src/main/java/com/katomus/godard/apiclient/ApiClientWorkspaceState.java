package com.katomus.godard.apiclient;

import java.util.List;

public record ApiClientWorkspaceState(List<Long> openRequestIds, Long activeRequestId) {}
