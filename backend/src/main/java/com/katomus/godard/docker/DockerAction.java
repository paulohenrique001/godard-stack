package com.katomus.godard.docker;

import java.util.Arrays;
import java.util.Optional;

enum DockerAction {
  START("start", "iniciado"),
  STOP("stop", "parado"),
  RESTART("restart", "reiniciado"),
  REMOVE("remove", "removido");

  private final String command;
  private final String activity;

  DockerAction(String command, String activity) {
    this.command = command;
    this.activity = activity;
  }

  String command() {
    return command;
  }

  String activity() {
    return activity;
  }

  boolean blocksProtectedContainer() {
    return this != START;
  }

  static Optional<DockerAction> from(String value) {
    return Arrays.stream(values()).filter(action -> action.command.equals(value)).findFirst();
  }
}
