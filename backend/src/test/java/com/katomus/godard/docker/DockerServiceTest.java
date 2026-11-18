package com.katomus.godard.docker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class DockerServiceTest {

  private static final String CONTAINER_ID = "a".repeat(64);

  @Test
  void normalizesContainerStatusAndPorts() {
    FakeDockerClient client = new FakeDockerClient();
    client.containers =
        new DockerCommandResult(
            0,
            false,
            false,
            """
                {"ID":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","Names":"web","Image":"nginx:latest","CreatedAt":"2026-11-09 10:30:00 -0300","State":"running","Status":"Up 2 hours (healthy)","Ports":"0.0.0.0:8080->80/tcp, [::]:8080->80/tcp","Labels":"com.docker.compose.project=web,com.docker.compose.project.config_files=/tmp/docker-compose.yml"}
                """);
    DockerService service = service(client, "");

    List<DockerContainer> containers = service.containers();

    assertEquals(1, containers.size());
    DockerContainer container = containers.getFirst();
    assertEquals("09/11/2026 10:30", container.createdAt());
    assertEquals("Ativo há 2 horas (saudável)", container.status());
    assertEquals("healthy", container.health());
    assertEquals(List.of("0.0.0.0:8080 → 80"), container.ports());
    assertTrue(container.running());
    assertTrue(container.composeManaged());
    assertEquals("/tmp/docker-compose.yml", container.composeFile());
  }

  @Test
  void blocksDestructiveActionsForTheApplicationContainer() {
    FakeDockerClient client = new FakeDockerClient();
    DockerService service = service(client, CONTAINER_ID.substring(0, 12));

    DockerException exception =
        assertThrows(DockerException.class, () -> service.action(CONTAINER_ID, "stop"));

    assertEquals(403, exception.status().value());
    assertTrue(client.actions.isEmpty());
  }

  @Test
  void onlyAllowsFixedActionsAndRecordsSuccessfulOnes() {
    FakeDockerClient client = new FakeDockerClient();
    List<String> activities = new ArrayList<>();
    DockerService service = new DockerService(client, new ObjectMapper(), activities::add, "");

    assertThrows(DockerException.class, () -> service.action(CONTAINER_ID, "exec"));
    service.action(CONTAINER_ID, "start");

    assertEquals(List.of("start:" + CONTAINER_ID), client.actions);
    assertEquals(List.of("Container iniciado"), activities);
  }

  @Test
  void streamTicketIsSingleUseAndBoundToItsPurposeAndContainer() {
    DockerStreamTicketService tickets = new DockerStreamTicketService();
    String ticket = tickets.issue(DockerStreamTicketService.Purpose.LOGS, CONTAINER_ID);

    assertFalse(tickets.consume(DockerStreamTicketService.Purpose.LOGS, ticket, "b".repeat(64)));
    assertFalse(tickets.consume(DockerStreamTicketService.Purpose.LOGS, ticket, CONTAINER_ID));

    String nextTicket = tickets.issue(DockerStreamTicketService.Purpose.SHELL, CONTAINER_ID);
    assertFalse(tickets.consume(DockerStreamTicketService.Purpose.LOGS, nextTicket, CONTAINER_ID));

    String lastTicket = tickets.issue(DockerStreamTicketService.Purpose.UPDATE, CONTAINER_ID);
    assertTrue(tickets.consume(DockerStreamTicketService.Purpose.UPDATE, lastTicket, CONTAINER_ID));
    assertFalse(
        tickets.consume(DockerStreamTicketService.Purpose.UPDATE, lastTicket, CONTAINER_ID));
  }

  @Test
  void doesNotIncludeLogTicketsInDiagnosticText() {
    String ticket = "must-not-appear-in-logs";

    assertFalse(new DockerController.DockerStreamTicket(ticket).toString().contains(ticket));
  }

  @Test
  void doesNotIncludeComposeFilesOrPathsInDiagnosticText() {
    String secret = "must-not-appear-in-logs";

    assertFalse(
        new DockerComposeFiles("/private/" + secret, "/private/.env", secret, secret)
            .toString()
            .contains(secret));
    assertFalse(new DockerComposeFilesRequest(secret, secret).toString().contains(secret));
    assertFalse(new DockerServiceFolder("/private/" + secret).toString().contains(secret));
    assertFalse(
        new DockerFolderListing("/private/" + secret, "/", "/private", List.of(secret))
            .toString()
            .contains(secret));
    assertFalse(
        new DockerContainer(
                secret,
                secret,
                secret,
                secret,
                secret,
                false,
                secret,
                null,
                List.of(),
                false,
                true,
                "/private/" + secret)
            .toString()
            .contains(secret));
  }

  private static DockerService service(FakeDockerClient client, String hostname) {
    return new DockerService(client, new ObjectMapper(), ignored -> {}, hostname);
  }

  private static final class FakeDockerClient implements DockerClient {

    private DockerCommandResult containers = new DockerCommandResult(0, false, false, "");
    private final List<String> actions = new ArrayList<>();

    @Override
    public DockerCommandResult containers() {
      return containers;
    }

    @Override
    public DockerCommandResult metrics(String containerId) {
      return new DockerCommandResult(0, false, false, containerId + "\t0.00%\t0B / 0B\t0.00%");
    }

    @Override
    public DockerCommandResult action(DockerAction action, String containerId) {
      actions.add(action.command() + ":" + containerId);
      return new DockerCommandResult(0, false, false, "");
    }

    @Override
    public Process followLogs(String containerId) throws IOException {
      throw new IOException("not used in this test");
    }
  }
}
