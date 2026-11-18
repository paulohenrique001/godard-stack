package com.katomus.godard.terminal;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class TranscriptRecorder {

  private static final long FLUSH_INTERVAL_MS = 2_000;
  private static final String CLEAR_SCROLLBACK = "\u001B[3J";
  private static final String FULL_RESET = "\u001Bc";
  private static final Pattern DIRECTORY_REPORT =
      Pattern.compile("\u001B]7;([^\u0007]{1,1024})\u0007");

  private final TerminalTranscriptRepository repository;
  private final TerminalTabRepository tabRepository;
  private final long tabId;
  private final Runnable onPersistenceError;
  private final StringBuilder buffer = new StringBuilder();
  private long lastFlush = System.currentTimeMillis();
  private boolean recorded;
  private boolean cleared;
  private String lastDirectory;

  TranscriptRecorder(
      TerminalTranscriptRepository repository,
      TerminalTabRepository tabRepository,
      long tabId,
      Runnable onPersistenceError) {
    this.repository = repository;
    this.tabRepository = tabRepository;
    this.tabId = tabId;
    this.onPersistenceError = onPersistenceError;
  }

  synchronized void startNewSession() {
    try {
      repository.closeOpenSession(tabId);
    } catch (RuntimeException exception) {
      onPersistenceError.run();
    }
  }

  synchronized void discard() {
    buffer.setLength(0);
    cleared = false;
  }

  synchronized void record(String output) {
    recorded = true;
    saveDirectory(output);
    buffer.append(output);
    discardBeforeClear();
    if (buffer.length() > TerminalTranscriptRepository.MAX_CHARS) {
      String tail = TerminalTranscriptRepository.tail(buffer.toString());
      buffer.setLength(0);
      buffer.append(tail);
    }
    if (System.currentTimeMillis() - lastFlush >= FLUSH_INTERVAL_MS) {
      flush();
    }
  }

  synchronized void endSession() {
    flush();
    if (!recorded) {
      return;
    }
    try {
      repository.endSession(tabId);
    } catch (RuntimeException exception) {
      onPersistenceError.run();
    }
  }

  private void saveDirectory(String output) {
    Matcher matcher = DIRECTORY_REPORT.matcher(output);
    String directory = null;
    while (matcher.find()) {
      directory = matcher.group(1);
    }
    if (directory == null || directory.equals(lastDirectory)) {
      return;
    }
    lastDirectory = directory;
    try {
      tabRepository.saveCwd(tabId, directory);
    } catch (RuntimeException exception) {
      onPersistenceError.run();
    }
  }

  private void discardBeforeClear() {
    int clear = Math.max(lastEnd(CLEAR_SCROLLBACK), lastEnd(FULL_RESET));
    if (clear >= 0) {
      buffer.delete(0, clear);
      cleared = true;
    }
  }

  private int lastEnd(String sequence) {
    int index = buffer.lastIndexOf(sequence);
    return index < 0 ? -1 : index + sequence.length();
  }

  private void flush() {
    lastFlush = System.currentTimeMillis();
    if (buffer.isEmpty() && !cleared) {
      return;
    }
    try {
      if (cleared) {
        repository.replace(tabId, buffer.toString());
        cleared = false;
      } else {
        repository.append(tabId, buffer.toString());
      }
    } catch (RuntimeException exception) {
      onPersistenceError.run();
    }
    buffer.setLength(0);
  }
}
