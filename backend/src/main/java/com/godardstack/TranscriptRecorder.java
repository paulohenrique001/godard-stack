package com.godardstack;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class TranscriptRecorder {

    private static final long FLUSH_INTERVAL_MS = 2000;
    private static final String CLEAR_SCROLLBACK = "\u001B[3J";
    private static final String FULL_RESET = "\u001Bc";
    private static final Pattern DIRECTORY_REPORT = Pattern.compile("\u001B]7;([^\u0007]{1,1024})\u0007");

    private final TerminalTranscriptRepository repository;
    private final TerminalTabRepository tabRepository;
    private final long tabId;
    private final StringBuilder buffer = new StringBuilder();
    private long lastFlush = System.currentTimeMillis();
    private boolean recorded = false;
    private boolean cleared = false;
    private boolean detached = false;
    private boolean persistenceError = false;
    private String lastDirectory;

    TranscriptRecorder(TerminalTranscriptRepository repository, TerminalTabRepository tabRepository, long tabId) {
        this.repository = repository;
        this.tabRepository = tabRepository;
        this.tabId = tabId;
    }

    long tabId() {
        return tabId;
    }

    synchronized void startNewSession() {
        try {
            repository.closeOpenSession(tabId);
        } catch (RuntimeException e) {
            System.err.println("Início de sessão não registrado na aba " + tabId + ": " + e.getMessage());
            persistenceError = true;
        }
    }

    synchronized void discard() {
        buffer.setLength(0);
        cleared = false;
    }

    synchronized void detach() {
        flush();
        detached = true;
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
        if (!recorded || detached) {
            return;
        }
        try {
            repository.endSession(tabId);
        } catch (RuntimeException e) {
            System.err.println("Fim de sessão não salvo para a aba " + tabId + ": " + e.getMessage());
            persistenceError = true;
        }
    }

    synchronized boolean consumePersistenceError() {
        boolean failed = persistenceError;
        persistenceError = false;
        return failed;
    }

    private void saveDirectory(String output) {
        Matcher report = DIRECTORY_REPORT.matcher(output);
        String directory = null;
        while (report.find()) {
            directory = report.group(1);
        }
        if (directory == null || directory.equals(lastDirectory)) {
            return;
        }
        lastDirectory = directory;
        try {
            tabRepository.saveCwd(tabId, directory);
        } catch (RuntimeException e) {
            System.err.println("Pasta não salva para a aba " + tabId + ": " + e.getMessage());
            persistenceError = true;
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
        } catch (RuntimeException e) {
            System.err.println("Transcrição não salva para a aba " + tabId + ": " + e.getMessage());
            persistenceError = true;
        }
        buffer.setLength(0);
    }
}
