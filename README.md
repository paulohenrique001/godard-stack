# Godard Stack

POC de terminal web: a página abre um shell real na máquina host, passando pelo backend. Funciona como um terminal comum, inclusive com programas interativos como `vim` e `top`.

A interface é uma SPA sem rotas. Ao abrir, aparece o splash, que verifica o ambiente. No primeiro acesso, ele leva ao onboarding, em três etapas: boas-vindas, perfil (foto e nome, sempre em maiúsculas, com 3 a 25 caracteres) e sistema (pasta de serviço e ferramentas encontradas no host). O tema começa igual ao do dispositivo, ou claro se ele não informar, e pode ser trocado já no onboarding. A escolha manual fica salva no navegador. Nos seguintes, vai direto para a aplicação, que abre com uma barra de ícones à esquerda (Dashboard, Terminal e troca de tema), navbar no topo, conteúdo no centro e um painel à direita que muda conforme a página.

> **Atenção:** este projeto dá acesso a um shell completo com as permissões do usuário que roda o agente. Comandos destrutivos executam de verdade, sem confirmação. Use apenas na sua máquina.

## Licença e contribuições

O Godard Stack é **source-available**, e não open source no sentido da Open Source
Initiative. Seu código-fonte é público para estudo, uso pessoal e uso comercial
interno, mas o software não pode ser vendido, sublicenciado, oferecido como SaaS ou
serviço gerenciado, nem ter instalação, suporte ou customização cobrados de terceiros.

Os termos completos estão em [LICENSE](LICENSE). O copyright do código da Katomus é
da Katomus Software; componentes de terceiros mantêm suas próprias licenças, listadas
em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Contribuições são bem-vindas. Leia [CONTRIBUTING.md](CONTRIBUTING.md) e aceite a
[CLA.md](CLA.md) antes de abrir um pull request. A licença permite forks e
redistribuições sem cobrança, desde que preservem os avisos e estes mesmos termos.

## Como funciona

```text
Navegador (xterm.js)
   │ WebSocket /api/terminal, em http://localhost:9373
   ▼
container godard-stack: Spring Boot serve as telas, valida o Origin e repassa as mensagens
   │ WebSocket com X-Agent-Token, em host.docker.internal:9374
   ▼
agente (no host, fora do Docker): valida o token e abre o shell em um PTY
```

Um container não executa comandos no host, por isso o agente roda direto na máquina. O Docker Compose sobe um único container, `godard-stack`, com frontend e backend. O agente precisa ser iniciado à parte.

| Pasta | Conteúdo | Versões |
|---|---|---|
| `frontend/` | Interface da aplicação | Vite 8, React 19, TypeScript, Tailwind 4, shadcn/ui, React Icons, Inter, xterm.js 6 |
| `backend/` | Repasse entre navegador e agente, e dados locais | Java 21, Spring Boot 4.1, H2 |
| `agent/` | Serviço que abre o shell no host | Java 21, pty4j, Java-WebSocket |

## Requisitos

- Docker com Docker Compose
- Java 21 ou superior e Maven 3.9 ou superior, para compilar e rodar o agente
- Node 22 ou superior, apenas para desenvolver

## Desenvolvimento

Na raiz do projeto, instale as ferramentas uma vez e suba tudo:

```bash
npm install
npm run dev
```

Se o `.env` não existir, ele é criado com um token gerado. Abra **http://localhost:9373** e edite o código normalmente:

| Parte | Onde roda | Ao salvar |
|---|---|---|
| `frontend/` | Container `godard-stack`, com o servidor do Vite | Atualiza na hora, sem recarregar a página |
| `backend/` | Container `godard-stack`, com o Spring Boot | Recompila e reinicia só o Spring Boot, com o Vite no ar |
| `agent/` | Host, com `scripts/agent.mjs` | Recompila e reinicia o agente |
| `pom.xml` do backend ou `package-lock.json` do frontend | Container | Reconstrói a imagem |

O agente fica no host porque, dentro de um container, o shell seria o do container. Quando o backend ou o agente reiniciam, a sessão do terminal cai: use o botão "Reconectar".

`Ctrl+C` no `npm run dev` para o agente e a atualização automática, mas os containers continuam no ar. Para derrubá-los, use `npm run stop`.

| Comando | O que faz |
|---|---|
| `npm run setup` | Cria o `.env`, se ainda não existir |
| `npm run dev` | Sobe tudo com atualização automática |
| `npm run rebuild` | Com o `npm run dev` rodando, recompila o agente e recria os containers |
| `npm run build` | Gera o jar do agente e as imagens finais |
| `npm start` | Sobe o modo normal, sem atualização automática |
| `npm run stop` | Derruba os containers |
| `npm run logs` | Acompanha os logs dos containers |
| `npm run reset` | Derruba os containers e apaga os dados locais e o cache do Maven |

## Configuração

O `npm run setup` já faz esta etapa. Para configurar manualmente, crie o arquivo na raiz do projeto:

```bash
cp .env.example .env
chmod 600 .env
```

Gere um token com `openssl rand -hex 32` (no Windows, use o Git Bash) e preencha o `.env`:

| Variável | Descrição |
|---|---|
| `AGENT_TOKEN` | Segredo compartilhado entre backend e agente. É obrigatório |
| `CONNECTION_ENCRYPTION_KEY` | Chave local usada para cifrar senhas de SGBD no banco da aplicação |
| `AGENT_BIND` | Endereço em que o agente escuta. Veja a tabela abaixo |
| `AGENT_PORT` | Porta do agente. O padrão é `9374` |
| `APP_PORT` | Porta da aplicação na sua máquina. O padrão é `9373` |
| `AGENT_MAX_SESSIONS` | Máximo de shells ativos ao mesmo tempo; padrão `16` |
| `AGENT_ALLOW_NETWORK` | Mantém `false` para aceitar apenas loopback ou bridge Docker local |

O valor de `AGENT_BIND` depende do sistema:

| Sistema | `AGENT_BIND` | Situação |
|---|---|---|
| Linux com Docker Engine | IP do `docker0`, normalmente `172.17.0.1` (confira com `ip -4 addr show docker0`) | Testado |
| Windows ou Mac com Docker Desktop | `127.0.0.1` | Não testado |

## Como subir

Compile o agente:

```bash
mvn -f agent/pom.xml package
```

Inicie o agente e deixe esse terminal aberto:

```bash
java -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Xss512k -Xms4m -Xmx16m -XX:MinHeapFreeRatio=10 -XX:MaxHeapFreeRatio=25 -XX:MaxMetaspaceSize=32m -XX:ReservedCodeCacheSize=12m -jar agent/target/godard-stack-agent.jar .env
```

Esses parâmetros limitam a memória do agente. O comando `npm run agent` faz o mesmo, depois de compilar.

A mensagem `Agente escutando em ...` confirma que ele subiu. Em outro terminal, suba os containers:

```bash
docker compose up --build -d
```

Abra **http://localhost:9373**. O endereço `127.0.0.1` não funciona, porque não é a origem autorizada.

## Como testar

No primeiro acesso, informe o seu nome. Nos acessos seguintes, a aplicação abre direto na Dashboard.

Abra "Terminal" na sidebar e, com o status em "Conectado", digite:

```bash
hostname
```

O resultado deve ser o nome da sua máquina, não o ID de um container. Depois, teste `cd /tmp` seguido de `pwd`, e abra o `top`, saindo com `q`.

## Como encerrar

```bash
docker compose down
```

Depois, pare o agente com `Ctrl+C` no terminal dele.

## Consumo

Medido no modo normal, no Linux. No desenvolvimento o consumo é maior, porque o container também traz JDK, Maven, Node e Vite.

| Item | Valor |
|---|---|
| Imagem `godard-stack` | 174 MB |
| Container em uso | Cerca de 110 MiB, com pico de 121 MiB em 5 sessões com saída intensa |
| Agente | 41 MiB em repouso, 56 MiB com 5 sessões |

A imagem usa Alpine e um runtime Java reduzido, gerado com `jlink`. Se o backend passar a usar outro módulo do Java, adicione-o à lista do `jlink` no `Dockerfile`.

## Telas

A aplicação tem as telas Dashboard, Docker, SGBD, Terminal e Perfil. A Dashboard resume containers, conexões e terminais, lista os containers em execução e as conexões com status e ping, e o sidebar mostra a máquina, as ferramentas e a pasta de serviço. A tela SGBD guarda conexões com MariaDB, MySQL e Redis, locais ou remotas, criadas por uma dialog com valores padrão de `localhost`, e testa cada uma pelo agente. A tela mostra o status e o ping em milissegundos, medido com `SELECT 1` ou `PING`, ao selecionar, ao abrir Visualizar e a cada 30 s, se o ping automático estiver ligado na conexão. Cada conexão abre com a aba de schemas (bancos, no Redis), e clicar em um deles, ou no `+`, abre um console de query. Os consoles ficam salvos no banco da aplicação, e cada listagem de schemas também, para os dados básicos continuarem disponíveis com o banco fora do ar. O `+` na lista de schemas cria um schema novo no MariaDB ou MySQL, e o botão de lixeira em cada card permite removê-lo, com confirmação, exceto os do sistema. No Redis, a lista mostra todos os bancos, e a ação equivalente é esvaziar o banco, com `FLUSHDB`.

O console tem um botão para executar a linha e outro para executar a seleção. `Ctrl+Enter` roda tudo o que estiver selecionado ou, sem seleção, apenas a linha do cursor, e `Ctrl+D` duplica a linha. As queries são separadas por `;` ou por linha em branco, e uma query em várias linhas precisa ser selecionada. Abaixo do editor fica a área de resultado, com a aba Output e uma aba por resultado. Cada execução roda em uma conexão própria, para no primeiro erro, atualiza o schema do console quando há `USE` (no Redis, `SELECT`) e pagina o resultado (10, 100, 250, 500 ou 1000 linhas, padrão 100, salvo por console): leituras buscam cada página no banco, e o restante traz até 1000 linhas e pagina na tela. O componente só aparece com mais de 10 registros, e copiar e exportar levam a página atual. O Output (últimas 200 entradas) e as abas de resultado de cada console ficam salvos no banco da aplicação, incluindo as linhas exibidas, e voltam ao recarregar, com a aba selecionada e a área aberta ou minimizada como estava. A altura entre o editor e o resultado é ajustada pelo divisor e fica salva em cada console. O console aberto também fica salvo: ao acessar a tela, ele já inicia aberto na conexão em que estava. Todo console novo começa com a área de resultado minimizada, ela abre ao executar e também pode ser minimizada pelo ícone à direita das abas. Minimizada, ela mantém só o header na parte de baixo, sem ajuste de altura. O ícone do header alterna entre minimizar e exibir, e clicar em uma aba também exibe. Ao lado dele, o resultado pode ser exibido como TXT, JSON ou TABLE e copiado no formato escolhido. Na aba Output, o copiar leva o log, o exportar baixa o log em `output.txt`, o formato fica travado em TXT e o botão flutuante limpa os logs. Nas abas de resultado, o exportar baixa o arquivo no formato escolhido (TABLE gera CSV). O console completa schemas, tabelas e colunas com base na estrutura sincronizada da conexão. O comportamento de cada banco fica em um driver: `sgbd-drivers.ts` na tela e `SgbdDriver` no agente. As senhas ficam cifradas no banco da aplicação com uma chave local separada do token do agente. A tela Docker lista os containers da máquina, com busca e a opção "Incluir parados", ligada por padrão, e permite iniciar, parar, reiniciar e acompanhar os logs, com `Ctrl+F` para buscar neles. O botão de borracha limpa só a tela naquele momento: nada é apagado, e os logs voltam ao recarregar a página ou trocar de container. O `.env` abre em modo de visualização, com os valores trocados por `*`, e só mostra os valores reais depois de "Desbloquear". Se o arquivo estiver vazio ou não existir, ele já abre em edição. No container da própria aplicação, desbloquear só mostra os valores, sem permitir edição. As abas `docker-compose.yml` e `.env` editam os arquivos de verdade quando o container veio de um `docker compose`: o agente grava cada arquivo de forma atômica, valida com `docker compose config` e restaura o original se houver erro. Salvar não altera o container em execução. O botão "+" cria um container em `<pasta de serviço>/containers/<nome>/`. Os arquivos do container da própria aplicação ficam somente para leitura. O botão Atualizar roda `docker compose pull` no projeto inteiro e mostra o progresso na aba Saída. Só uma atualização do mesmo projeto pode ocorrer por vez. Se o projeto estiver rodando, aplica com `up --detach --remove-orphans`; se estiver parado, só baixa a imagem. Vale só para containers com arquivo de configuração. Excluir abre uma janela de confirmação e roda `docker rm --force`, preservando os volumes e os arquivos. A aba Shell abre `bash`, ou `sh` se ele não existir, dentro do container, e a sessão termina ao sair da aba. No container da própria aplicação, parar, atualizar, excluir e abrir o shell são bloqueados também no servidor. O agente executa os comandos, sem expor o socket do Docker ao container. O container da própria aplicação não pode ser parado. A tela de Perfil abre pela foto na navbar ou pela pesquisa, e permite editar o nome e a foto. A última tela acessada fica salva no banco, e a aplicação reabre nela. Depois do onboarding, a primeira tela é a Dashboard.

> **Dashboard:** conexões com o Ping desligado aparecem como `Manual` e não recebem testes em segundo plano. Ative o Ping apenas nas conexões que devem ser monitoradas; assim uma lista grande de conexões não gera tráfego desnecessário.

> **Atualizações Docker:** a saída mostrada na interface mantém os últimos 1 MB para preservar a fluidez do navegador em atualizações muito verbosas.

> **Notificações e configurações:** o sino abre um popup com as atividades recentes persistidas localmente, guarda o estado de leitura neste navegador e tem atalho para a tela de atividades. A engrenagem abre uma tela própria para escolher tema e intervalo de atualização automática (30 s, 1 min, 2 min ou desativada); ela afeta dashboard, Docker, SGBD e dados da máquina.

## Terminal

Cada aba é um terminal salvo no banco, sem limite artificial, e sempre existe ao menos uma. Abrir a aplicação não cria nenhum shell: a sessão real só começa quando você digita. Trocar de aba ou de página mantém a sessão viva. Ao sair ou recarregar, o shell continua vivo no agente por 60 segundos: voltando nesse prazo, a aba reconecta à mesma sessão, com pasta, variáveis e comandos em execução. Depois disso, a sessão é encerrada, mas a aba, o que apareceu nela e a última pasta continuam salvos, e a próxima sessão começa nessa pasta. Um mesmo terminal pode ter várias sessões ao longo do tempo, separadas por uma linha `session end`. Para proteger a máquina, o agente limita apenas shells simultâneos pelo valor configurável de `AGENT_MAX_SESSIONS` (16 por padrão). O `X` ou o botão do meio do mouse apagam a aba, sem confirmação, e fechar a última cria outra, limpa. Dois cliques no nome da aba permitem renomeá-la, com até 15 caracteres. O painel à direita resume a máquina, com dados atualizados a cada 10 s, e guarda uma lista de comandos salvos no banco. Clicar em um comando o coloca na linha do terminal ativo, sem executar, e a lista pode ser editada. Os três comandos padrão são criados uma única vez.

A transcrição de cada aba, com tudo o que apareceu na tela, inclusive os comandos digitados, fica no banco, sem criptografia, até o limite dos últimos 256 KB. Qualquer segredo exibido no terminal, como um token impresso por um comando, fica gravado em disco até a aba ser fechada ou os dados serem apagados com `npm run reset`. O que não aparece na tela, como a senha do `sudo`, não é gravado. Os comandos `clear` e `reset` apagam o histórico salvo da aba. O botão de borracha, no canto inferior direito do terminal, faz o mesmo. Com sessão aberta, sair da página mostra um aviso do navegador.

No terminal, `Ctrl+Shift+C` copia a seleção, `Ctrl+Shift+V` cola e `Ctrl+F` busca no histórico, exceto em programas de tela alternativa, como `vim` e `less`, que mantêm a tecla. Links na saída são clicáveis.

## Pesquisa

A barra no topo abre a pesquisa, com clique ou `Ctrl K`. Quando o foco está no terminal, `Ctrl K` continua indo para o shell, onde apaga até o fim da linha. Nesse caso, use o clique.

A pesquisa encontra páginas e ações, incluindo criar console, contêiner e conexão, além de abrir notificações e configurações. Para incluir itens, edite `frontend/src/features/search/search-catalog.ts`. Favoritos e recentes ficam salvos no banco, e os recentes são limitados aos 10 últimos.

## Verificações do splash

Ao abrir, o splash chama `GET /api/health`, mostra abaixo do carregamento o que está sendo verificado e só avança se tudo estiver certo. Em caso de falha, ele mostra o que aconteceu e o botão "Tentar novamente". Se o backend não responder, a verificação repete por até 15 s antes de mostrar o erro.

| Verificação | O que confirma | Se falhar |
|---|---|---|
| Backend | A API responde e o endereço é o autorizado | Bloqueia |
| Banco | Consulta real à tabela `app_user` | Bloqueia |
| Disco de dados | `/data` aceita escrita e tem ao menos 10 MB livres | Bloqueia |
| Agente | Está no ar e aceitou o token | Bloqueia |
| Shell | O shell configurado no host existe e é executável | Bloqueia |
| Usuário do agente | Ele não roda como `root` ou `SYSTEM` | Só avisa, em uma faixa no topo |
| Pasta de serviço | Existe, tem `system.txt` e `service.log` e aceita escrita | Bloqueia. Se a pasta ou um arquivo sumiu, oferece "Recriar pasta" |

## Pasta de serviço

Criada pelo agente no host durante o onboarding. O padrão é `~/.godard-stack`, e o botão com ícone de pasta permite escolher outro destino: a pasta `.godard-stack` é criada dentro do destino selecionado. Se ela já existir, é reaproveitada, e o caminho fica salvo no banco.

| Arquivo | Conteúdo |
|---|---|
| `system.txt` | Dados da máquina, reescritos a cada verificação |
| `service.log` | Criação da pasta, verificações e início e fim de cada sessão. Não registra comandos nem saídas do terminal; roda a 1 MiB e mantém três backups |

`npm run reset` apaga o banco, mas não essa pasta. Por isso, no próximo onboarding ela é reaproveitada, mantendo o log.

## Banco de dados

O backend usa o H2 embutido, que não exige instalação nem container próprio. O arquivo `godard-stack.mv.db` fica no volume Docker `backend-data`, então os dados continuam depois de `docker compose down` e de novos builds.

O desenvolvimento usa um volume separado, `backend-data-dev`, porque o container de desenvolvimento roda como root e o modo normal roda com usuário comum.

Para apagar os dados dos dois modos e voltar ao primeiro acesso:

```bash
npm run reset
```

## Segurança

- **Exposição de rede:** a porta da aplicação fica publicada só em `127.0.0.1`.
- **Backend:** as rotas `/api` aceitam apenas requisições cujo `Host` e `Origin` correspondam a `http://localhost` na porta `APP_PORT`. Isso impede que sites abertos no seu navegador usem o terminal ou leiam dados.
- **Agente:** exige o token e recusa qualquer conexão com header `Origin`, porque navegadores sempre enviam esse header e o único cliente legítimo é o backend. Por padrão, só aceita loopback ou uma bridge Docker local; expor outra interface exige configurar `AGENT_ALLOW_NETWORK=true` conscientemente.
- **Foto do usuário:** vem da API pública do DiceBear (estilo Critters), usando o nome em maiúsculas como semente. Enquanto não há nome, a semente é aleatória, com 8 letras e números, gerada a cada abertura da página, sem ser salva. Passar o mouse sobre a foto mostra um botão que sorteia outra semente, salva no banco ao concluir o onboarding. Alterar o nome faz a foto voltar a seguir o nome. O nome sai da máquina para `api.dicebear.com`. Sem internet, aparece a inicial.
- **Usuário:** nunca rode o agente como root ou administrador, porque o terminal herda esse poder.

## Limitações

- Não há login: quem usa o navegador nesta máquina tem acesso ao terminal.
- O nome é único por instalação, não por navegador.
- Depois de 60 segundos fora, ou se o agente reiniciar, a sessão é perdida com o que estiver rodando nela. A tela e a pasta são restauradas, mas variáveis e processos não voltam.
- A pasta é detectada pelo `PROMPT_COMMAND` do bash. Em outros shells, como o zsh, ou se o `~/.bashrc` sobrescrever essa variável, ela não é salva.
- Duas janelas do navegador veem as mesmas abas, com sessões próprias, e só se atualizam ao recarregar.
- O destino da pasta de serviço só é escolhido no onboarding.
- O agente precisa ser iniciado manualmente, e ainda não há instalador.
- O Windows e o Mac estão previstos no código, mas não foram testados.

## Problemas comuns

| Sintoma | O que verificar |
|---|---|
| `[agente indisponível]` na tela | O agente está rodando? O `AGENT_TOKEN` é igual para os dois? Se alterou o `.env`, reinicie o agente e rode `docker compose up -d` |
| O agente não inicia e mostra `BindException` | Confira o `AGENT_BIND` e se a porta `AGENT_PORT` já está em uso |
| "Endereço não autorizado" no splash | Use `http://localhost` na porta definida em `APP_PORT` |
| `[agente indisponível]` com o agente rodando, no Linux | O firewall pode estar bloqueando o container. Com `ufw`, libere com o comando abaixo |

```bash
sudo ufw allow in on godard0 to 172.17.0.1 port 9374 proto tcp
```
