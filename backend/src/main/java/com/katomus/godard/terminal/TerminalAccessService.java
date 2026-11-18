package com.katomus.godard.terminal;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TerminalAccessService {

  public record Access(boolean available, boolean accepted, String shell, String reason) {}

  private final TerminalAvailability availability;
  private final TerminalPermissionRepository permissionRepository;

  public TerminalAccessService(
      TerminalAvailability availability, TerminalPermissionRepository permissionRepository) {
    this.availability = availability;
    this.permissionRepository = permissionRepository;
  }

  public Access access() {
    TerminalAvailability.Capability capability = availability.capability();
    return new Access(
        capability.available(),
        permissionRepository.accepted(),
        capability.shell(),
        capability.reason());
  }

  public Access accept() {
    TerminalAvailability.Capability capability = availability.capability();
    if (!capability.available()) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, capability.reason());
    }
    permissionRepository.accept();
    return access();
  }

  public void requireEnabled() {
    Access access = access();
    if (!access.available()) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, access.reason());
    }
    if (!access.accepted()) {
      throw new ResponseStatusException(
          HttpStatus.FORBIDDEN, "A autorização do terminal é necessária.");
    }
  }
}
