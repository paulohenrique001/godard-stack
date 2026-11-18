# Como contribuir

Obrigado por querer melhorar o Godard Stack. O projeto é source-available sob a
[Katomus Source-Available License 1.0](LICENSE), não uma licença open source. Leia a
licença antes de começar: o uso pessoal e comercial interno é permitido, mas a
comercialização do Software não é.

## Antes de abrir um pull request

1. Para mudanças grandes, abra uma issue primeiro para alinhar o escopo.
2. Faça um fork, crie uma branch curta e mantenha a alteração focada.
3. Não envie segredos, arquivos `.env`, dados de clientes, dumps de banco, binários
   gerados ou artefatos em `target/` e `dist/`.
4. Atualize a documentação quando o comportamento, a configuração ou a segurança
   mudar.
5. Rode as verificações relevantes à parte alterada e informe o resultado no pull
   request. Para mudanças no agente, execute `mvn -B -f agent/pom.xml test`.
6. Leia e aceite a [CLA.md](CLA.md). Ela dá à Katomus os direitos necessários para
   manter, distribuir e relicenciar o projeto, sem transferir automaticamente o seu
   copyright.

## Padrões do projeto

- Escreva código, nomes de arquivos, variáveis e mensagens de commit em inglês.
- Evite comentários que apenas descrevem o código. Quando necessários, explique o
  motivo e escreva-os em inglês.
- Preserve a exposição apenas local e as validações entre navegador, backend e agente.
  O agente controla um shell real da máquina anfitriã; mudanças nessa fronteira exigem
  atenção especial de segurança.
- Não adicione dependências ou código de terceiros sem identificar a licença e sua
  compatibilidade com a licença do projeto.

## Segurança

Não abra issue pública para relatar uma vulnerabilidade, especialmente se ela puder
dar acesso ao host, a um terminal, a um token ou a dados de conexão. Envie os detalhes
para `contact@katomus.com`.

## Processo de revisão

A Katomus pode solicitar ajustes, testes ou documentação adicional e decide se uma
contribuição será aceita. Ao ser incorporada, a contribuição passa a ser distribuída
conforme a licença do projeto e a CLA.
