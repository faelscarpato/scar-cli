# Agente CLI - Assistente de Codificação Autônomo para Terminal

> Um assistente de IA para desenvolvimento de software integrado ao seu terminal, com consciência profunda do seu repositório de código, execução autônoma de comandos, suporte a provedores OpenAPI (com modelos gratuitos), interface TUI interativa e ecossistema extensível de plugins.

---

## 📚 Documentação do Planejamento Completo

Todo o planejamento de engenharia, produto e design foi detalhado nos relatórios abaixo:

1. **[01 - Planejamento de Produto (PRD)](./docs/01-PLANEJAMENTO-DE-PRODUTO.md)**
   - Visão geral, personas, casos de uso chave (explicar código, corrigir testes, fluxo git semântico).
   - Requisitos funcionais (FR) e não-funcionais (NFR).
   - Métricas de sucesso do produto (TTFP, taxa de resolução autônoma).

2. **[02 - Planejamento de UX/UI Design (TUI)](./docs/02-PLANEJAMENTO-UX-UI-DESIGN.md)**
   - Princípios de design para terminal baseados em Claude Code, OpenCode, Gemini CLI e Antigravity CLI.
   - Wireframes em ASCII detalhados (Compose, streaming, modal de modelos, card de confirmação de segurança).
   - Menu dinâmico de comandos slash (`/`) posicionado **imediatamente abaixo do compose input**.
   - Paleta de cores ANSI TrueColor e mapeamento de atalhos de teclado.

3. **[03 - Planejamento de Estrutura (Arquitetura)](./docs/03-PLANEJAMENTO-DE-ESTRUTURA.md)**
   - Arquitetura Hexagonal em camadas desacopladas.
   - Diagrama de componentes e fluxo de dados ponta a ponta.
   - Especificação do ciclo de vida de plugins e registro de ferramentas.
   - Árvore e organização de pastas do projeto.

4. **[04 - Planejamento de Tecnologia (Tech Stack)](./docs/04-PLANEJAMENTO-DE-TECNOLOGIA.md)**
   - Comparativo aprofundado: TypeScript (Node/Bun) vs Go vs Rust.
   - Justificativa técnica da escolha: Ink (React TUI), Zod, `execa`, streaming SSE nativo e plugins dinâmicos.
   - Estratégia de empacotamento em binário único via `bun build --compile`.
   - Especificação dos scripts instaladores one-liner para Windows (`install.ps1`) e Unix (`install.sh`).

5. **[05 - Planejamento de Implementação (Roadmap)](./docs/05-PLANEJAMENTO-DE-IMPLEMENTACAO.md)**
   - Roteiro estruturado em 6 fases incrementais (Vertical Slices).
   - Análise de riscos técnicos (PTY no Windows, Tool Calling em modelos free, estouramento de contexto) e mitigações.

6. **[06 - Lista de Tarefas Detalhada (Backlog)](./docs/06-LISTA-DE-TAREFAS-BACKLOG.md)**
   - 25 tarefas detalhadas com estimativa de complexidade, dependências, arquivos-alvo e critérios de aceite (Definition of Done).

7. **[07 - Relatório de Implementação Concluída](./docs/07-RELATORIO-DE-IMPLEMENTACAO-CONCLUIDA.md)**
   - Síntese de todas as entregas concluídas, 67 testes automatizados, resolução da TUI e guia de operação completo.

---

## 🎯 Destaques do Projeto

- **Compatibilidade OpenAPI**: Configure qualquer endpoint compatível com OpenAPI/OpenAI (`baseUrl`, `apiKey`).
- **Detecção de Modelos Free**: Destaque e carregamento instantâneo de modelos gratuitos (Ollama local, OpenRouter `:free`, etc.).
- **TUI Responsivo com Menu `/`**: Sugestões contextuais e navegação instantânea por setas abaixo da barra de digitação.
- **Instalação em 1 Comando**:
  - **Windows (PowerShell)**: `irm https://.../install.ps1 | iex`
  - **macOS / Linux (cURL)**: `curl -fsSL https://.../install.sh | sh`
