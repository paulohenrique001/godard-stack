# AGENTS.md — Godard Stack

## Escopo

Godard Stack é um aplicativo desktop local. A primeira plataforma é Ubuntu 22.04+
`x86_64`; distribuição por lojas não faz parte do escopo atual.

## Arquitetura

- `frontend/`: React e Vite.
- `backend/`: uma aplicação Spring Boot e uma JVM em produção.
- `src-tauri/`: shell desktop Tauri e ciclo de vida do backend.
- SQLite é o banco local. Migrações ficam em `backend/src/main/resources/db/migration/`.
- Terminal, SGBD e Docker são módulos independentes e não podem bloquear o núcleo.

## Convenções

- Conversas e documentação em português; código, arquivos, variáveis e commits em inglês.
- Pacotes Java iniciam em `com.katomus.godard` e são organizados por domínio.
- Não expor comandos genéricos do sistema ao frontend Tauri.
- Não registrar senhas, tokens ou strings de conexão.
- Não rodar como root ou administrador.
- Não executar `git commit` ou `git push`.

## Verificação

Antes de concluir uma alteração de código, executar os comandos aplicáveis:

```bash
npm run backend:verify
npm run frontend:build
npm run desktop:build
```

