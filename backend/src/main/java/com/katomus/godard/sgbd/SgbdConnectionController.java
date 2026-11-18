package com.katomus.godard.sgbd;

import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/api/sgbd", produces = MediaType.APPLICATION_JSON_VALUE)
public class SgbdConnectionController {

  public record TestRequest(SgbdConnectionDraft connection, Long existingId) {}

  public record ExecuteRequest(String command, String database) {

    @Override
    public String toString() {
      return "ExecuteRequest[command=<redacted>, database=<redacted>]";
    }
  }

  private final SgbdConnectionService connectionService;

  public SgbdConnectionController(SgbdConnectionService connectionService) {
    this.connectionService = connectionService;
  }

  @GetMapping("/connections")
  public List<SgbdConnectionView> connections() {
    return connectionService.list();
  }

  @PostMapping(value = "/connections", consumes = MediaType.APPLICATION_JSON_VALUE)
  public SgbdConnectionView create(@RequestBody SgbdConnectionDraft connection) {
    return connectionService.create(connection);
  }

  @PutMapping(value = "/connections/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
  public SgbdConnectionView update(
      @PathVariable long id, @RequestBody SgbdConnectionDraft connection) {
    return connectionService.update(id, connection);
  }

  @DeleteMapping("/connections/{id}")
  public ResponseEntity<Void> delete(@PathVariable long id) {
    connectionService.delete(id);
    return ResponseEntity.noContent().build();
  }

  @PutMapping("/connections/{id}/selected")
  public ResponseEntity<Void> select(@PathVariable long id) {
    connectionService.select(id);
    return ResponseEntity.noContent().build();
  }

  @PostMapping(value = "/test", consumes = MediaType.APPLICATION_JSON_VALUE)
  public SgbdHealth testDraft(@RequestBody TestRequest request) {
    return connectionService.test(request.connection(), request.existingId());
  }

  @PostMapping("/connections/{id}/test")
  public SgbdHealth testSaved(@PathVariable long id) {
    return connectionService.testSaved(id);
  }

  @GetMapping("/connections/{id}/structure")
  public SgbdStructure structure(@PathVariable long id) {
    return connectionService.structure(id);
  }

  @GetMapping("/connections/{id}/consoles")
  public List<SgbdConsoleView> consoles(@PathVariable long id) {
    return connectionService.consoles(id);
  }

  @PostMapping(value = "/connections/{id}/consoles", consumes = MediaType.APPLICATION_JSON_VALUE)
  public SgbdConsoleView createConsole(
      @PathVariable long id, @RequestBody(required = false) SgbdConsoleDraft console) {
    return connectionService.createConsole(id, console);
  }

  @PutMapping(value = "/connections/{id}/active-tab", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Void> selectConsole(
      @PathVariable long id, @RequestBody(required = false) SgbdActiveConsole active) {
    connectionService.selectConsole(id, active == null ? null : active.consoleId());
    return ResponseEntity.noContent().build();
  }

  @PutMapping(value = "/consoles/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
  public SgbdConsoleView updateConsole(
      @PathVariable long id, @RequestBody SgbdConsoleUpdate console) {
    return connectionService.updateConsole(id, console);
  }

  @DeleteMapping("/consoles/{id}")
  public ResponseEntity<Void> deleteConsole(@PathVariable long id) {
    connectionService.deleteConsole(id);
    return ResponseEntity.noContent().build();
  }

  @PostMapping(value = "/connections/{id}/execute", consumes = MediaType.APPLICATION_JSON_VALUE)
  public SgbdQueryResult execute(@PathVariable long id, @RequestBody ExecuteRequest request) {
    return connectionService.execute(id, request.command(), request.database());
  }

  @ExceptionHandler(SgbdException.class)
  public ResponseEntity<String> failure(SgbdException exception) {
    return ResponseEntity.status(exception.status())
        .contentType(MediaType.TEXT_PLAIN)
        .body(exception.getMessage());
  }
}
