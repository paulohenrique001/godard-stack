# Plano de implementação

## Direção do produto

Godard Stack é uma central desktop local para ferramentas de desenvolvimento. A
primeira plataforma é Ubuntu 22.04+ `x86_64`; a publicação será feita pelo site do
projeto, sem lojas nesta etapa. A reconstrução preserva o estilo visual do Godard
Stack atual, mas não importa automaticamente dados H2, Docker ou instalações antigas.

## Arquitetura definida

- `frontend/`: React, TypeScript e Vite.
- `backend/`: uma aplicação Spring Boot em Java 21 e uma única JVM por execução.
- `src-tauri/`: janela Tauri, empacotamento e supervisão do processo Java.
- `backend/src/main/resources/db/migration/`: migrações versionadas do SQLite.
- `scripts/`: montagem do JAR, runtime Java reduzido e build desktop.
- `packaging/`: material de publicação, começando pelo futuro repositório APT.

O Tauri inicia o Java em `127.0.0.1` numa porta efêmera. Cada execução recebe um
token aleatório; a interface só usa a API local com esse token. Dados, logs, banco e
segredos ficam no diretório local da aplicação, nunca dentro do pacote instalado.

## Segurança e dados locais

- SQLite substitui H2 desde a primeira versão, com WAL e uma conexão de escrita.
- Flyway executa as migrações. A primeira é `V1__core.sql`.
- Uma chave aleatória local é criada com permissão `0600`; ela será a base da cifra
  AES-GCM das credenciais SGBD quando o módulo existir.
- Antes de migrações futuras que alterem dados de usuários, será implementado e
  testado um backup consistente do SQLite. A primeira instalação não tem banco legado
  para migrar.
- A interface Tauri não recebe acesso a comandos genéricos do sistema.

## Entrega incremental

| Fase | Entrega | Estado |
| --- | --- | --- |
| 1 | Casca desktop, splash, onboarding, perfil, preferências, dashboard e SQLite | Implementada |
| 2 | Terminal real: PTY, sessões, histórico e permissões explícitas | Implementada |
| 3 | SGBD: conexões, credenciais cifradas e MariaDB/MySQL/Redis | Implementada |
| 4 | Docker: containers, Compose, shell, criação e atualização segura | Implementada |
| 5 | Integrações, extensões, polimento, acessibilidade e testes de regressão | Implementada |
| 6 | Operação pública: canal estável, assinatura, APT, atualizações e telemetria local opt-in | Em andamento |

Terminal, SGBD e Docker aparecem na navegação desde a Fase 1 para preservar a
estrutura do produto. O Terminal é disponibilizado na Fase 2 após uma autorização
explícita; SGBD e Docker são ativados nas respectivas fases. Docker nunca será
requisito de inicialização.

### Terminal da Fase 2

- O único processo Java do aplicativo cria PTYs locais, sem um agente Java separado.
- A autorização é persistida no SQLite e cada conexão WebSocket usa um ticket aleatório,
  de uso único e válido por 30 segundos; o token principal da sessão não vai na URL.
- O shell só é aberto depois da autorização e com os privilégios da conta local. O módulo
  recusa execução como `root` ou administrador.
- Sessões, abas, diretório atual e transcritos são mantidos localmente. O histórico e a
  saída de sessões desconectadas têm limites para não crescerem sem controle.
- Comandos salvos são apenas inseridos na sessão ativa; o frontend Tauri continua sem
  uma interface de comando genérico ao sistema.

### SGBD da Fase 3

- O módulo guarda conexões MariaDB, MySQL e Redis no SQLite local. O driver MariaDB
  incluído no pacote atende os dois protocolos SQL; o cliente Redis fala RESP
  diretamente, sem exigir cliente ou servidor instalado na máquina local.
- A senha é cifrada com AES-GCM antes de entrar no SQLite, usando a chave aleatória
  local criada em `secrets/connection.key` com permissão `0600` quando suportada pelo
  sistema. Ela nunca é devolvida à interface depois de salva.
- Criar, editar, remover, selecionar e testar uma conexão são ações explícitas. O
  ping automático é opcional por conexão e segue o intervalo de atualização do usuário.
  A inicialização do Godard não toca em hosts remotos e não depende de nenhum SGBD.
- O teste faz `SELECT 1` nos bancos SQL e `PING` no Redis. A aba de schemas usa
  consultas somente de leitura para listar schemas SQL ou bancos Redis; ao abrir um
  deles, o console usa esse contexto validado. O console executa uma consulta SQL ou
  um comando Redis na conexão selecionada, aplica timeout e limites de visualização,
  e apresenta erros de conexão sem expor a senha ou a string de conexão.
- O editor usa realce de sintaxe e autocomplete. Em conexões SQL, carrega apenas os
  schemas, tabelas e colunas visíveis na configuração da conexão; em Redis, sugere
  comandos comuns. Essa leitura ocorre ao abrir um console, nunca na inicialização.
- A visibilidade de schemas é configurada na aba **Schemas** do diálogo da conexão:
  exibir todos, incluir schemas do sistema ou selecionar itens específicos. Essa
  preferência é local e não altera o banco remoto.
- Cada conexão restaura sua área de trabalho local ao reabrir o aplicativo: consoles
  abertos, aba ativa, nome do console, schema/banco de contexto, rascunho da query,
  divisão entre editor e resultado, estado minimizado, histórico recente e o último
  resultado. Esse estado fica somente no SQLite local, não cria atividades nem é
  enviado para logs. Histórico e resultado têm limites de tamanho para evitar o
  crescimento descontrolado do banco local.
- Objetos de API que possam conter credenciais, consultas ou resultados redigem seu
  texto de diagnóstico. Há um teste de regressão específico para esse contrato.

### Docker da Fase 4

- O Docker só é consultado quando a pessoa abre o módulo ou pede uma atualização. A
  ausência do binário, do daemon ou da permissão no socket não bloqueia a inicialização
  e aparece como um estado claro na interface.
- O backend executa apenas operações Docker fixas e validadas: listar containers,
  consultar métricas, acompanhar logs, iniciar, parar, reiniciar ou remover um
  container identificado pelo ID retornado pelo próprio Docker. Para serviços Compose,
  ele também valida a configuração, cria serviços, baixa imagens e recria o projeto.
  A interface não recebe um executor genérico de comandos do sistema.
- Remoções exigem confirmação. Quando a aplicação estiver dentro de um container, o
  container que a hospeda é marcado como protegido e não pode ser parado, reiniciado ou
  removido, editado, atualizado ou aberto em shell pelo módulo.
- Ao criar o primeiro serviço, a pessoa escolhe uma pasta local. O Godard prepara
  `.godard-stack/containers/<nome>/` dentro dela, grava `docker-compose.yml` e `.env`,
  valida a configuração e só então executa o `docker compose up -d`. Falhas removem
  apenas a pasta recém-criada.
- Serviços Compose existentes podem abrir e editar `docker-compose.yml` e `.env`.
  A gravação é atômica, roda `docker compose config --quiet` e restaura os dois arquivos
  se a validação falhar. O conteúdo e os caminhos desses arquivos não entram no SQLite,
  na atividade nem em textos de diagnóstico.
- A atualização executa `docker compose pull --ignore-buildable`; se o projeto estiver
  em execução, executa `docker compose up -d --remove-orphans`. A saída aparece numa aba
  temporária e não é persistida. O shell abre somente em containers ativos, com `docker
  exec` e um PTY; ele é encerrado quando a aba é fechada.
- Logs, shell e atualização usam WebSocket local com ticket aleatório de uso único,
  válido por 30 segundos. O token principal da sessão não vai para a URL. Logs e saída
  de atualização têm limite de 4 MiB e não são persistidos no SQLite.
- A última seleção de container e o filtro de containers parados são salvos no SQLite
  local, incluindo a aba de detalhes aberta. A criação seleciona automaticamente o
  container recém-criado quando ele aparece no Docker.

### Fase 5

- Os módulos opcionais são carregados somente ao abrir sua área, em chunks separados,
  e cada um tem uma fronteira de erro própria. Assim, uma falha de carregamento não
  derruba a dashboard nem os demais módulos; esta é a base de extensão sem permitir
  que uma extensão execute comandos arbitrários no sistema.
- A navegação principal tem atalho para pular ao conteúdo, anuncia a página aberta e
  leva o foco ao título da página nas mudanças de área. Abas de Terminal, SGBD e Docker
  (inclusive resultados de consulta, conexão e arquivos Compose) seguem o padrão de
  teclado com setas, Home e End, além de relacionarem tab e painel para leitores de tela.
- Diálogos prendem o foco, devolvem-no ao controle que os abriu e fecham com Escape,
  exceto enquanto uma operação não pode ser interrompida. A preferência de movimento
  pode seguir o sistema, reduzir animações ou mantê-las completas; ela é salva no
  SQLite e não depende do navegador.
- A regressão cobre as migrações até a preferência de acessibilidade e a validação da
  API de preferências, além dos contratos de segurança e de dados já cobertos nas
  fases anteriores.
- Integrações que pedem acesso a contas, tokens ou serviços remotos não são ativadas
  sem uma definição explícita de provedor e autorização da pessoa usuária. Nenhuma
  credencial ou conexão externa é criada nesta etapa inicial.

## Instalação e atualizações pelo site

1. Cada release publicará `.deb`, AppImage, checksum SHA-256, notas de release e uma
   versão imutável no site do projeto.
2. O `.deb` será o caminho recomendado para Ubuntu. No lançamento público será
   oferecido também um repositório APT assinado; instalações por APT atualizam apenas
   pelo APT. Um `.deb` baixado avulsamente é atualizado manualmente até a configuração
   desse repositório.
3. O AppImage será a alternativa portátil. Ele usará o atualizador assinado do Tauri
   e um manifesto estático hospedado no site; um AppImage nunca substituirá uma
   instalação `.deb`.
4. A chave privada de assinatura ficará no Proton Pass. Repositório, artefatos e site
   só recebem chaves públicas, checksums e assinaturas.
5. A configuração do endpoint público do updater, a chave de assinatura e a primeira
   publicação permanecem pendentes até existir domínio de download e autorização para
   publicar. Nenhum artefato foi enviado nesta fase.

O build local já produz os dois formatos. O runtime Java reduzido é incluído para que
usuários não precisem instalar JDK, Node.js, Maven ou Docker. O tamanho esperado é
maior que o de um front-end puro por essa escolha deliberada.

### Fase 6

- O `release:build` valida a versão comum do projeto, exige a chave privada do updater
  somente no ambiente da sessão de release e gera o AppImage assinado. A configuração
  pública do canal estável é criada em `build/`, nunca no repositório.
- O `release:stage` prepara uma árvore estática com AppImage, `.deb`, assinatura,
  `SHA256SUMS`, notas de release e `updates/stable/latest.json`. O `release:verify`
  confere a integridade e o vínculo entre manifesto, assinatura e artefatos antes do
  upload manual.
- O updater interno é ativado apenas no AppImage e usa HTTPS, assinatura obrigatória,
  comparação sem downgrade e versão vinculada à assinatura. Instalações `.deb` usam APT;
  uma instalação não tenta substituir a outra.
- O `release:apt` monta e assina localmente o repositório estático `stable` quando a chave
  GPG está disponível no keyring da pessoa operadora. Nenhuma chave privada entra no
  projeto, no site ou nos artefatos de release.
- O diagnóstico de atualização é opt-in, inicia desligado e fica exclusivamente no SQLite
  local. Ele aceita somente estados predefinidos do updater e versões SemVer; não armazena
  consultas, credenciais, URLs, mensagens de erro, host ou identificadores da máquina.
- Permanecem pendentes a escolha do domínio HTTPS de downloads, a criação e guarda das
  chaves de produção, a primeira assinatura e os testes em uma instalação Ubuntu limpa.

## Critérios para cada módulo futuro

- Não iniciar processos ou tocar dados fora de uma ação explícita do usuário.
- Degradar de forma clara quando a dependência local não existir.
- Persistir apenas o necessário e manter operações destrutivas atrás de confirmação.
- Cobrir a API, a UI e o fluxo de atualização com testes antes de declarar a fase
  concluída.

