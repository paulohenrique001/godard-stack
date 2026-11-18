package com.godardstack.agent;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.file.Path;

public final class AgentApplication {

    private AgentApplication() {
    }

    public static void main(String[] args) throws IOException {
        if (args.length != 1) {
            System.err.println("Uso: java -jar godard-stack-agent.jar <arquivo .env>");
            System.exit(1);
        }
        AgentConfig config = AgentConfig.load(Path.of(args[0]));
        if (config.token().isEmpty()) {
            System.err.println("AGENT_TOKEN não definido em " + args[0]);
            System.exit(1);
        }
        config.validateBind();
        TerminalServer server = new TerminalServer(new InetSocketAddress(config.bind(), config.port()), config.token(),
                config.maxSessions());
        Runtime.getRuntime().addShutdownHook(Thread.ofPlatform().unstarted(server::shutdown));
        server.start();
    }
}
