package com.katomus.godard.docker;

import java.io.IOException;

interface DockerClient {

  DockerCommandResult containers();

  DockerCommandResult metrics(String containerId);

  DockerCommandResult action(DockerAction action, String containerId);

  Process followLogs(String containerId) throws IOException;
}
