package com.godardstack.agent;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.Semaphore;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.function.UnaryOperator;

import org.java_websocket.WebSocket;
import org.java_websocket.drafts.Draft;
import org.java_websocket.exceptions.InvalidDataException;
import org.java_websocket.exceptions.WebsocketNotConnectedException;
import org.java_websocket.framing.CloseFrame;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.handshake.ServerHandshakeBuilder;
import org.java_websocket.server.WebSocketServer;

final class TerminalServer extends WebSocketServer {

    private static final String TERMINAL_PATH = "/terminal";
    private static final String CLOSE_PATH = "/close";
    private static final String TAB_HEADER = "X-Terminal-Tab";
    private static final String DIRECTORY_HEADER = "X-Terminal-Cwd";
    private static final String FOLDER_HEADER = "X-Folder-Path";
    private static final String DOCKER_CONTAINERS_PATH = "/docker/containers";
    private static final String DOCKER_STATS_PATH = "/docker/stats";
    private static final String DOCKER_ACTION_PATH = "/docker/action";
    private static final String DOCKER_LOGS_PATH = "/docker/logs";
    private static final String DOCKER_FILES_PATH = "/docker/files";
    private static final String DOCKER_SAVE_PATH = "/docker/files/save";
    private static final String DOCKER_CREATE_PATH = "/docker/create";
    private static final String DOCKER_UPDATE_PATH = "/docker/update";
    private static final String DOCKER_SHELL_PATH = "/docker/shell";
    private static final String SGBD_TEST_PATH = "/sgbd/test";
    private static final String SGBD_SCHEMAS_PATH = "/sgbd/schemas";
    private static final String SGBD_STRUCTURE_PATH = "/sgbd/structure";
    private static final String SGBD_EXECUTE_PATH = "/sgbd/execute";
    private static final String SGBD_CANCEL_PATH = "/sgbd/execute/cancel";
    private static final String SGBD_CREATE_SCHEMA_PATH = "/sgbd/schema/create";
    private static final String SGBD_DROP_SCHEMA_PATH = "/sgbd/schema/drop";
    private static final String SGBD_SCHEMA_HEADER = "X-Sgbd-Schema";
    private static final String SGBD_REQUEST_HEADER = "X-Sgbd-Request";
    private static final String DOCKER_NAME_HEADER = "X-Docker-Name";
    private static final String DOCKER_ACTION_HEADER = "X-Docker-Action";
    private static final String DOCKER_CONTAINER_HEADER = "X-Docker-Container";
    private static final int LOG_BUFFER_CHARS = 8192;
    private static final int MAX_TERMINAL_INPUT_CHARS = 64 * 1024;
    private static final int MAX_BODY_CHARS = 3 * 1024 * 1024;
    private static final long BODY_TIMEOUT_SECONDS = 20;
    private static final int SESSION_LIMIT_CODE = 4001;
    private static final String NEW_SESSION_CONTROL = "\u0001new";
    private static final String ATTACHED_SESSION_CONTROL = "\u0001attached";
    private static final String UPDATE_OK_CONTROL = "\u0001ok";
    private static final String UPDATE_FAILED_CONTROL = "\u0001failed";
    private static final char INPUT_MESSAGE = 'i';
    private static final char RESIZE_MESSAGE = 'r';
    private static final int DECODER_THREADS = 2;
    private static final long DETACHED_SECONDS = 60;

    private record PendingBody(Function<String, String> handler, ScheduledFuture<?> timeout) {
    }

    private final byte[] token;
    private final Semaphore ptySlots;
    private final Object sessionLock = new Object();
    private final Map<String, TerminalSession> sessions = new ConcurrentHashMap<>();
    private final Set<TerminalSession> activePtys = ConcurrentHashMap.newKeySet();
    private final Map<WebSocket, Process> logStreams = new ConcurrentHashMap<>();
    private final Map<WebSocket, Runnable> dockerShells = new ConcurrentHashMap<>();
    private final Map<WebSocket, PendingBody> pendingBodies = new ConcurrentHashMap<>();
    private final Map<String, Supplier<String>> reports = Map.of(
            "/health", TerminalSession::healthReport,
            "/info", MachineInfo::report,
            "/tools", InstalledTools::report,
            "/sessions", () -> String.join(",", sessions.keySet()));
    private final Map<String, UnaryOperator<String>> folderReports = Map.of(
            "/folders", ServiceFolder::browse,
            "/service/create", ServiceFolder::create,
            "/service/check", ServiceFolder::check);
    private final ScheduledExecutorService expirations = Executors.newSingleThreadScheduledExecutor(runnable ->
            Thread.ofPlatform().daemon().unstarted(runnable));

    TerminalServer(InetSocketAddress address, String token, int maxSessions) {
        super(address, DECODER_THREADS);
        this.token = token.getBytes(StandardCharsets.UTF_8);
        this.ptySlots = new Semaphore(maxSessions);
        setReuseAddr(true);
    }

    @Override
    public ServerHandshakeBuilder onWebsocketHandshakeReceivedAsServer(
            WebSocket connection, Draft draft, ClientHandshake request) throws InvalidDataException {
        if (!isAllowed(request)) {
            throw new InvalidDataException(CloseFrame.POLICY_VALIDATION, "conexão recusada");
        }
        return super.onWebsocketHandshakeReceivedAsServer(connection, draft, request);
    }

    @Override
    public void onStart() {
        System.out.println("Agente escutando em " + getAddress());
    }

    @Override
    public void onOpen(WebSocket connection, ClientHandshake handshake) {
        String path = handshake.getResourceDescriptor();
        Supplier<String> report = reports.get(path);
        UnaryOperator<String> folderReport = folderReports.get(path);
        if (report != null) {
            connection.send(report.get());
            connection.close(CloseFrame.NORMAL);
        } else if (folderReport != null) {
            connection.send(folderReport.apply(decoded(handshake, FOLDER_HEADER)));
            connection.close(CloseFrame.NORMAL);
        } else if (DOCKER_CONTAINERS_PATH.equals(path)) {
            Thread.ofVirtual().start(() -> sendReport(connection, DockerCommands.containers()));
        } else if (DOCKER_STATS_PATH.equals(path)) {
            String container = handshake.getFieldValue(DOCKER_CONTAINER_HEADER);
            Thread.ofVirtual().start(() -> sendReport(connection, DockerCommands.stats(container)));
        } else if (DOCKER_ACTION_PATH.equals(path)) {
            String action = handshake.getFieldValue(DOCKER_ACTION_HEADER);
            String container = handshake.getFieldValue(DOCKER_CONTAINER_HEADER);
            Thread.ofVirtual().start(() -> sendReport(connection, DockerCommands.action(action, container)));
        } else if (DOCKER_FILES_PATH.equals(path)) {
            String container = handshake.getFieldValue(DOCKER_CONTAINER_HEADER);
            Thread.ofVirtual().start(() -> sendReport(connection, DockerFiles.read(container)));
        } else if (DOCKER_SAVE_PATH.equals(path)) {
            String container = handshake.getFieldValue(DOCKER_CONTAINER_HEADER);
            awaitBody(connection, body -> DockerFiles.save(container, body));
        } else if (DOCKER_CREATE_PATH.equals(path)) {
            String name = handshake.getFieldValue(DOCKER_NAME_HEADER);
            String folder = decoded(handshake, FOLDER_HEADER);
            awaitBody(connection, body -> DockerFiles.create(name, folder, body));
        } else if (DOCKER_UPDATE_PATH.equals(path)) {
            String container = handshake.getFieldValue(DOCKER_CONTAINER_HEADER);
            Thread.ofVirtual().start(() -> streamUpdate(connection, container));
        } else if (SGBD_TEST_PATH.equals(path)) {
            awaitBody(connection, SgbdConnections::test);
        } else if (SGBD_SCHEMAS_PATH.equals(path)) {
            awaitBody(connection, SgbdConnections::schemas);
        } else if (SGBD_STRUCTURE_PATH.equals(path)) {
            awaitBody(connection, SgbdConnections::structure);
        } else if (SGBD_EXECUTE_PATH.equals(path)) {
            String request = handshake.getFieldValue(SGBD_REQUEST_HEADER);
            awaitBody(connection, body -> SgbdConnections.execute(request, body));
        } else if (SGBD_CANCEL_PATH.equals(path)) {
            String request = handshake.getFieldValue(SGBD_REQUEST_HEADER);
            Thread.ofVirtual().start(() -> sendReport(connection, SgbdConnections.cancel(request)));
        } else if (SGBD_CREATE_SCHEMA_PATH.equals(path)) {
            String schema = handshake.getFieldValue(SGBD_SCHEMA_HEADER);
            awaitBody(connection, body -> SgbdConnections.createSchema(schema, body));
        } else if (SGBD_DROP_SCHEMA_PATH.equals(path)) {
            String schema = handshake.getFieldValue(SGBD_SCHEMA_HEADER);
            awaitBody(connection, body -> SgbdConnections.dropSchema(schema, body));
        } else if (DOCKER_SHELL_PATH.equals(path)) {
            openDockerShell(connection, handshake.getFieldValue(DOCKER_CONTAINER_HEADER));
        } else if (DOCKER_LOGS_PATH.equals(path)) {
            String container = handshake.getFieldValue(DOCKER_CONTAINER_HEADER);
            Thread.ofVirtual().start(() -> streamLogs(connection, container));
        } else if (CLOSE_PATH.equals(path)) {
            closeSession(connection, handshake.getFieldValue(TAB_HEADER));
        } else {
            openSession(connection, handshake);
        }
    }

    @Override
    public void onMessage(WebSocket connection, String message) {
        PendingBody pending = pendingBodies.remove(connection);
        if (pending != null) {
            pending.timeout().cancel(false);
            if (message.length() > MAX_BODY_CHARS) {
                connection.close(CloseFrame.TOOBIG, "pedido muito grande");
                return;
            }
            Thread.ofVirtual().start(() -> sendReport(connection, pending.handler().apply(message)));
            return;
        }
        TerminalSession session = connection.getAttachment();
        if (session == null || message.isEmpty()) {
            return;
        }
        if (message.length() > MAX_TERMINAL_INPUT_CHARS) {
            connection.close(CloseFrame.TOOBIG, "entrada muito grande");
            return;
        }
        String payload = message.substring(1);
        try {
            switch (message.charAt(0)) {
                case INPUT_MESSAGE -> session.write(payload);
                case RESIZE_MESSAGE -> session.resize(payload);
                default -> System.err.println("Mensagem ignorada: tipo desconhecido");
            }
        } catch (IOException | RuntimeException e) {
            System.err.println("Mensagem recusada: " + e);
        }
    }

    @Override
    public void onClose(WebSocket connection, int code, String reason, boolean remote) {
        PendingBody pending = pendingBodies.remove(connection);
        if (pending != null) {
            pending.timeout().cancel(false);
        }
        Process logs = logStreams.remove(connection);
        if (logs != null) {
            logs.destroyForcibly();
        }
        TerminalSession session = connection.getAttachment();
        if (session == null || !session.detach(connection)) {
            return;
        }
        Runnable endDockerShell = dockerShells.remove(connection);
        if (endDockerShell != null) {
            session.close();
            Thread.ofVirtual().start(endDockerShell);
        } else {
            session.expireAfter(expirations, DETACHED_SECONDS);
        }
    }

    @Override
    public void onError(WebSocket connection, Exception error) {
        System.err.println("Erro no agente: " + error);
        if (connection == null) {
            System.exit(1);
        }
    }

    private void openSession(WebSocket connection, ClientHandshake handshake) {
        String tab = handshake.getFieldValue(TAB_HEADER);
        synchronized (sessionLock) {
            TerminalSession current = sessions.get(tab);
            if (current != null) {
                connection.setAttachment(current);
                current.attach(connection, ATTACHED_SESSION_CONTROL);
                return;
            }
            if (!ptySlots.tryAcquire()) {
                connection.close(SESSION_LIMIT_CODE, "capacidade de sessões atingida");
                return;
            }
            try {
                String directory = decoded(handshake, DIRECTORY_HEADER);
                String serviceFolder = decoded(handshake, FOLDER_HEADER);
                TerminalSession[] created = new TerminalSession[1];
                created[0] = new TerminalSession(directory, () -> {
                    synchronized (sessionLock) {
                        TerminalSession ended = created[0];
                        if (ended != null) {
                            sessions.remove(tab, ended);
                            activePtys.remove(ended);
                        }
                        ptySlots.release();
                    }
                    ServiceFolder.log(serviceFolder, "Sessão encerrada no terminal " + tab);
                });
                sessions.put(tab, created[0]);
                activePtys.add(created[0]);
                ServiceFolder.log(serviceFolder, "Sessão iniciada no terminal " + tab);
                connection.setAttachment(created[0]);
                created[0].attach(connection, NEW_SESSION_CONTROL);
            } catch (IOException | RuntimeException e) {
                ptySlots.release();
                System.err.println("Falha ao abrir o shell: " + e);
                connection.close(CloseFrame.UNEXPECTED_CONDITION);
            }
        }
    }

    private void openDockerShell(WebSocket connection, String container) {
        if (!DockerCommands.isContainerId(container)) {
            connection.close(CloseFrame.POLICY_VALIDATION);
            return;
        }
        synchronized (sessionLock) {
            if (!ptySlots.tryAcquire()) {
                connection.close(SESSION_LIMIT_CODE, "capacidade de sessões atingida");
                return;
            }
            try {
                String marker = UUID.randomUUID().toString();
                TerminalSession[] created = new TerminalSession[1];
                created[0] = new TerminalSession(DockerCommands.shellCommand(container, marker), "", () -> {
                    synchronized (sessionLock) {
                        if (created[0] != null) {
                            activePtys.remove(created[0]);
                        }
                        ptySlots.release();
                    }
                    dockerShells.remove(connection);
                });
                activePtys.add(created[0]);
                dockerShells.put(connection, () -> DockerCommands.endShell(container, marker));
                connection.setAttachment(created[0]);
                created[0].attach(connection, NEW_SESSION_CONTROL);
            } catch (IOException | RuntimeException e) {
                ptySlots.release();
                System.err.println("Falha ao abrir o shell do container: " + e);
                connection.close(CloseFrame.UNEXPECTED_CONDITION);
            }
        }
    }

    private void streamUpdate(WebSocket connection, String container) {
        boolean updated = DockerFiles.update(container, text -> sendStreamIfOpen(connection, text));
        sendStreamIfOpen(connection, updated ? UPDATE_OK_CONTROL : UPDATE_FAILED_CONTROL);
        if (connection.isOpen()) {
            connection.close(CloseFrame.NORMAL);
        }
    }

    private boolean sendStreamIfOpen(WebSocket connection, String text) {
        if (!connection.isOpen()) {
            return false;
        }
        try {
            connection.send(text);
            while (connection.isOpen() && connection.hasBufferedData()) {
                Thread.sleep(1);
            }
            return connection.isOpen();
        } catch (WebsocketNotConnectedException e) {
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private void sendReport(WebSocket connection, String report) {
        try {
            connection.send(report);
            connection.close(CloseFrame.NORMAL);
        } catch (WebsocketNotConnectedException e) {
            System.err.println("Relatório descartado: conexão encerrada");
        }
    }

    private void streamLogs(WebSocket connection, String container) {
        if (!DockerCommands.isContainerId(container)) {
            connection.close(CloseFrame.POLICY_VALIDATION);
            return;
        }
        try {
            Process process = DockerCommands.followLogs(container);
            logStreams.put(connection, process);
            try (Reader reader = new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8)) {
                char[] buffer = new char[LOG_BUFFER_CHARS];
                int read = reader.read(buffer);
                boolean connected = true;
                while (read >= 0) {
                    if (connected) {
                        connected = sendStreamIfOpen(connection, new String(buffer, 0, read));
                    }
                    read = reader.read(buffer);
                }
            }
            connection.close(CloseFrame.NORMAL);
        } catch (IOException | WebsocketNotConnectedException e) {
            Process process = logStreams.remove(connection);
            if (process != null) {
                process.destroy();
            }
        }
    }

    void shutdown() {
        activePtys.forEach(TerminalSession::close);
        logStreams.values().forEach(Process::destroyForcibly);
        dockerShells.values().forEach(Runnable::run);
        expirations.shutdownNow();
        try {
            stop(1000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private void awaitBody(WebSocket connection, Function<String, String> handler) {
        ScheduledFuture<?> timeout = expirations.schedule(
                () -> connection.close(CloseFrame.POLICY_VALIDATION, "corpo não recebido"),
                BODY_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        pendingBodies.put(connection, new PendingBody(handler, timeout));
    }

    private String decoded(ClientHandshake handshake, String header) {
        return URLDecoder.decode(handshake.getFieldValue(header), StandardCharsets.UTF_8);
    }

    private void closeSession(WebSocket connection, String tab) {
        TerminalSession session = sessions.get(tab);
        if (session != null) {
            session.close();
        }
        connection.send("ok");
        connection.close(CloseFrame.NORMAL);
    }

    private boolean isAllowed(ClientHandshake request) {
        byte[] received = request.getFieldValue("X-Agent-Token").getBytes(StandardCharsets.UTF_8);
        String path = request.getResourceDescriptor();
        boolean knownPath = TERMINAL_PATH.equals(path) || CLOSE_PATH.equals(path)
                || DOCKER_CONTAINERS_PATH.equals(path) || DOCKER_ACTION_PATH.equals(path)
                || DOCKER_STATS_PATH.equals(path)
                || DOCKER_LOGS_PATH.equals(path) || DOCKER_FILES_PATH.equals(path)
                || DOCKER_SAVE_PATH.equals(path) || DOCKER_CREATE_PATH.equals(path)
                || DOCKER_UPDATE_PATH.equals(path) || DOCKER_SHELL_PATH.equals(path)
                || SGBD_TEST_PATH.equals(path) || SGBD_SCHEMAS_PATH.equals(path)
                || SGBD_STRUCTURE_PATH.equals(path) || SGBD_CREATE_SCHEMA_PATH.equals(path)
                || SGBD_DROP_SCHEMA_PATH.equals(path) || SGBD_EXECUTE_PATH.equals(path)
                || SGBD_CANCEL_PATH.equals(path)
                || reports.containsKey(path) || folderReports.containsKey(path);
        return knownPath && !request.hasFieldValue("Origin") && MessageDigest.isEqual(token, received);
    }
}
