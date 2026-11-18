package com.godardstack.agent;

import java.io.File;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

final class InstalledTools {

    private static final Map<String, String> COMMANDS = Map.of(
            "git", "git",
            "docker", "docker",
            "aws", "aws");
    private static final List<String> SUFFIXES = List.of("", ".exe", ".cmd", ".bat");

    private InstalledTools() {
    }

    static String report() {
        List<String> directories = List.of(
                Objects.requireNonNullElse(System.getenv("PATH"), "").split(File.pathSeparator));
        return COMMANDS.entrySet().stream()
                .filter(tool -> isOnPath(directories, tool.getValue()))
                .map(Map.Entry::getKey)
                .collect(Collectors.joining(","));
    }

    private static boolean isOnPath(List<String> directories, String command) {
        return directories.stream()
                .flatMap(directory -> SUFFIXES.stream().map(suffix -> new File(directory, command + suffix)))
                .anyMatch(file -> file.isFile() && file.canExecute());
    }
}
