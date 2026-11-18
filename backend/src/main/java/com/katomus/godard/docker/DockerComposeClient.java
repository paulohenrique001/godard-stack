package com.katomus.godard.docker;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

interface DockerComposeClient {

  DockerCommandResult inspectComposeProject(String containerId);

  DockerCommandResult validateCompose(String projectName, List<Path> files);

  DockerCommandResult startCompose(String projectName, List<Path> files);

  DockerCommandResult stopCompose(String projectName, List<Path> files);

  DockerCommandResult projectContainers(String projectName);

  Process pullCompose(String projectName, List<Path> files) throws IOException;

  Process recreateCompose(String projectName, List<Path> files) throws IOException;
}
