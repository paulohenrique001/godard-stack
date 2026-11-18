# Avisos de terceiros

O arquivo [LICENSE](LICENSE) cobre somente o código de titularidade da Katomus
Software. Dependências, fontes, binários e ativos de terceiros mantêm suas próprias
licenças e avisos. Este documento é um inventário inicial; quem publicar um JAR,
imagem Docker ou outro artefato deve preservar todos os avisos exigidos pelas
dependências efetivamente empacotadas.

## Dependências diretas de produção

| Componente | Versão | Licença |
|---|---:|---|
| Spring Boot | 4.1.2 | Apache-2.0 |
| H2 Database Engine | gerenciada pelo Spring Boot | MPL-2.0 ou EPL-1.0 |
| pty4j | 0.14.0 | EPL-1.0 |
| Java-WebSocket | 1.6.0 | MIT |
| MariaDB Connector/J | 3.5.10 | LGPL-2.1-or-later |
| SLF4J Simple | 2.0.19 | MIT |
| React e React DOM | 19.3.1 | MIT |
| React Icons | 5.7.0 | MIT |
| Vite | 8.3.6 | MIT |
| Tailwind CSS | 4.3.4 | MIT |
| CodeMirror | 6.x | MIT |
| xterm.js e add-ons | 6.x | MIT |
| Radix UI | 1.8.1 | MIT |
| Inter | 5.3.0 | OFL-1.1 |
| TypeScript | 7.0.2 | Apache-2.0 |

As versões completas, incluindo dependências transitivas, estão nos arquivos
`package-lock.json`, `frontend/package-lock.json` e `pom.xml`. Não remova avisos de
terceiros nem aplique a Katomus Source-Available License a esses componentes.

## Política para releases

Antes de publicar um release, imagem ou binário, a Katomus deve:

1. gerar um inventário das dependências realmente incluídas no artefato;
2. incluir os textos, avisos e atribuições exigidos por cada licença; e
3. verificar em especial as obrigações de componentes copyleft, como H2, pty4j e
   MariaDB Connector/J.

O MySQL Connector/J não integra mais o agente. Ele era distribuído sob GPLv2 com uma
exceção voltada a software FOSS qualificado, incompatível com esta licença
source-available. O MariaDB Connector/J suporta tanto MariaDB quanto MySQL e evita
essa restrição específica.
