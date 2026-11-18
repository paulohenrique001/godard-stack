package com.katomus.godard.docker;

record DockerCommandResult(
    int exitCode, boolean timedOut, boolean outputLimitReached, String output) {

  boolean successful() {
    return exitCode == 0 && !timedOut && !outputLimitReached;
  }

  static DockerCommandResult failed(String message) {
    return new DockerCommandResult(-1, false, false, message);
  }
}
