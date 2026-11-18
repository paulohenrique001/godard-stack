package com.katomus.godard.system;

import com.katomus.godard.config.GodardProperties;
import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.net.InetAddress;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class SystemSnapshotService {

  private final java.lang.management.OperatingSystemMXBean operatingSystemBean;
  private final com.sun.management.OperatingSystemMXBean extendedOperatingSystemBean;
  private final String hostname;
  private final String user;
  private final String operatingSystem;
  private final int processors;
  private final long memoryTotal;
  private final long diskTotal;
  private final FileStore dataStore;
  private final List<String> installedTools;

  public SystemSnapshotService(GodardProperties properties) {
    operatingSystemBean = ManagementFactory.getOperatingSystemMXBean();
    extendedOperatingSystemBean =
        operatingSystemBean instanceof com.sun.management.OperatingSystemMXBean value
            ? value
            : null;
    hostname = hostname();
    user = System.getProperty("user.name", "—");
    operatingSystem =
        System.getProperty("os.name", "—") + " " + System.getProperty("os.version", "");
    processors = operatingSystemBean.getAvailableProcessors();
    memoryTotal =
        extendedOperatingSystemBean == null ? 0 : extendedOperatingSystemBean.getTotalMemorySize();
    installedTools = installedTools();
    FileStore store = null;
    long total = 0;
    try {
      store = Files.getFileStore(Path.of(properties.dataDir()));
      total = store.getTotalSpace();
    } catch (IOException ignored) {
    }
    dataStore = store;
    diskTotal = total;
  }

  public SystemSnapshot snapshot() {
    long memoryAvailable =
        extendedOperatingSystemBean == null ? 0 : extendedOperatingSystemBean.getFreeMemorySize();
    long diskAvailable = 0;
    try {
      if (dataStore != null) {
        diskAvailable = dataStore.getUsableSpace();
      }
    } catch (IOException ignored) {
    }
    return new SystemSnapshot(
        hostname,
        user,
        operatingSystem,
        processors,
        operatingSystemBean.getSystemLoadAverage(),
        memoryTotal,
        memoryAvailable,
        diskTotal,
        diskAvailable,
        installedTools);
  }

  private List<String> installedTools() {
    return List.of("git", "docker", "aws").stream().filter(this::isAvailable).toList();
  }

  private boolean isAvailable(String command) {
    String path = System.getenv("PATH");
    if (path == null || path.isBlank()) {
      return false;
    }
    return Arrays.stream(path.split(java.io.File.pathSeparator))
        .map(Path::of)
        .map(directory -> directory.resolve(command))
        .anyMatch(Files::isExecutable);
  }

  private String hostname() {
    try {
      return InetAddress.getLocalHost().getHostName();
    } catch (IOException exception) {
      return "localhost";
    }
  }
}
