# Godard Stack

Godard Stack é uma central desktop local para ferramentas de desenvolvimento.

O aplicativo usa Tauri, React, Java 21, Spring Boot e SQLite. A distribuição final
inclui um runtime Java reduzido, portanto não exige JDK, Node.js, Maven ou Docker na
máquina do usuário.

## Desenvolvimento

Pré-requisitos: Node.js 22+, Java 21, Maven 3.9+, Rust e dependências do Tauri para
Ubuntu.

```bash
npm install
npm --prefix frontend install
npm run desktop:dev
```

## Verificações

```bash
npm run backend:verify
npm run frontend:build
npm run desktop:build
```

## Estado atual

O núcleo desktop, o Terminal, o módulo SGBD e o módulo Docker estão funcionais. O
SGBD guarda conexões MariaDB, MySQL e Redis no SQLite local, cifra senhas com a chave
local, exibe os schemas ou bancos disponíveis e executa consultas ou comandos
diretamente no servidor selecionado. Docker continua opcional: o aplicativo lista
containers, exibe status, métricas e logs, permite iniciar, parar, reiniciar ou remover
containers com confirmação, abrir shell e editar projetos Compose. Também cria novos
serviços em uma pasta local escolhida, valida `docker-compose.yml` e `.env` antes de
gravar e atualiza imagens com saída acompanhável na interface.

To-do e API Client complementam o workspace local. O API Client organiza requests em
coleções e pastas, mantém as abas abertas, suporta parâmetros, headers, JSON e
autenticação Basic ou Bearer. URLs, corpo e credenciais ficam cifrados no SQLite local;
uma chamada HTTP só ocorre por ação explícita e suas respostas não são persistidas.

A Fase 5 está concluída no escopo definido: os módulos opcionais são carregados sob
demanda e isolam falhas de carregamento; navegação, diálogos e abas receberam melhorias
de acessibilidade; e a preferência de movimento pode seguir o sistema, reduzir animações
ou mantê-las completas. Integrações com contas ou serviços externos continuam dependentes
de uma definição explícita de provedor e autorização.

A Fase 6 está em andamento. O projeto já prepara releases estáticas assinadas, manifesto
de atualização do AppImage, checksums, um repositório APT assinado e diagnóstico local
opt-in. A primeira publicação continua pendente do domínio de downloads e das chaves de
produção. O procedimento está em [packaging/release/README.md](packaging/release/README.md).

