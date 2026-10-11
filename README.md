# 🤖 Agente CLI — Assistente de Código AI Autônomo para Terminal

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.8-blue.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Runtime-Node.js%2020%2B-green.svg" alt="Node" />
  <img src="https://img.shields.io/badge/TUI-Ink%20React-cyan.svg" alt="Ink TUI" />
  <img src="https://img.shields.io/badge/Tests-67%20Passed-brightgreen.svg" alt="Tests" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-orange.svg" alt="Multi-Platform" />
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License" />
</p>

> **Um agente autônomo de inteligência artificial que vive no seu terminal.**  
> Com consciência profunda da árvore do seu repositório Git, interface TUI moderna inspirada no *Claude Code*, *OpenCode* e *Gemini CLI*, compatibilidade universal com provedores OpenAPI/OpenAI (com destaque para modelos gratuitos), suporte a subagentes em segundo plano, skills especializadas e manipulação completa do sistema operacional.

---

## ⚡ Demonstração Visual da Interface (TUI)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ✦ Antigravity CLI Agent v0.1.0   Dir: D:/faels/PROJETOS/cli   git:(main)               │
│   Provedor: openrouter           Modelo: google/gemini-2.5-flash:free                  │
│   Tokens: 2.4k / 1.0M (0.2%)                                                          │
└────────────────────────────────────────────────────────────────────────────────────────┘

 Você: analise o código de autenticação e execute os testes unitários

 🤖 Agente:
 ├── [read_file] src/auth/service.ts (linhas 1 a 45) ... OK
 ├── [run_command] pnpm test src/auth/service.test.ts ... OK (4 testes passaram)
 └── O serviço de autenticação está validando tokens corretamente.

┌────────────────────────────────────────────────────────────────────────────────────────┐
│ > /                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────────┘
  ┌── Comandos Disponíveis ────────────────────────────────────────────────────────────┐
  │ > /config       Configurar provedor, URL e chaves de API passo a passo             │
  │   /models       Catálogo de modelos em tempo real (destaque para modelos free)     │
  │   /permissions  Gerenciar política de segurança (ask, auto-safe, always-allow)    │
  │   /skills       Selecionar e ativar diretrizes especializadas (SKILL.md)           │
  │   /plugins      Gerenciar plugins e servidores MCP                                 │
  │   /compact      Compactar histórico para liberar tokens da janela de contexto      │
  │   /subagents    Monitorar subagentes em segundo plano com logs ao vivo             │
  │   /sessions     Listar e retomar conversas anteriores                              │
  └────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Principais Recursos

### 🖥️ 1. Interface de Terminal Moderna (TUI)
- **Menu `/` abaixo do Compose**: Sugestões interativas que abrem imediatamente abaixo da caixa de texto ao digitar `/`, com navegação por setas e autocompletar com `Tab` ou `Enter`.
- **Cabeçalho Fixo em Tempo Real**: Exibe diretório aberto (`CWD`), provedor, modelo ativo, branch Git e medidor de consumo de tokens com porcentagem da janela máxima.
- **Streaming & Sintaxe Colorida**: Respostas em streaming contínuo com spinner de raciocínio e blocos de código com destaque sintático.

### 🌐 2. Compatibilidade Universal com Provedores & Modelos Free
- **Qualquer Provedor OpenAPI/OpenAI**: Suporte nativo a OpenRouter, Ollama (100% local e gratuito), Groq ou qualquer URL compatível.
- **Wizard Interativo (`/config`)**: Configuração guiada passo a passo no terminal, com ocultação segura de chave de API e teste de conexão imediato na rota `/v1/models`.
- **Filtro de Modelos Gratuitos (`/models`)**: Tecla de atalho rápida `f` para listar exclusivamente modelos com custo zero (`:free`, Ollama local ou tarifação zerada).

### 📁 3. Controle Total do Sistema de Arquivos & SO
- O agente não se limita a sugerir código — ele opera o ambiente de desenvolvimento sob sua supervisão:
  - `read_file` & `list_directory`: Leitura com paginação e mapeamento de diretórios respeitando o `.gitignore`.
  - `create_file`, `edit_file` & `rewrite_file`: Criação e substituição cirúrgica com busca de bloco exato.
  - `delete_file` & `delete_directory`: Exclusão controlada de arquivos e pastas.
  - `move_file`, `rename_file` & `copy_file`: Organização de arquivos e estruturas.
  - `run_command`: Execução de comandos no shell do sistema com timeout e prevenção de travamentos.
  - `git_commit` & `git_diff`: Criação de commits semânticos e inspeção de alterações.

### 🛡️ 4. Políticas de Segurança e Permissões (`/permissions`)
- **`ask` (Padrão)**: Solicita confirmação explícita antes de qualquer mutação em arquivos ou execução de comandos no shell.
- **`auto-safe`**: Permite leituras de forma autônoma e solicita confirmação apenas para modificações destrutivas e comandos sensíveis.
- **`always-allow`**: Modo contínuo para automações prolongadas.

### 🗜️ 5. Consciência de Janela de Contexto & Compactação (`/compact`)
- **Mapeamento de Famílias**: Reconhece os limites reais de modelos Gemini (1M/2M), Claude 3/3.5 (200k), GPT-4o (128k), DeepSeek (64k/128k) e Llama 3.x/Qwen (128k).
- **Auto-Compact**: Ao atingir 75% da capacidade máxima da janela, o agente resume o histórico antigo mantendo as diretrizes do sistema e as mensagens recentes intactas.
- **Compactação Manual**: Digite `/compact` a qualquer momento para liberar espaço de contexto sob demanda.

### ⚡ 6. Subagentes em Segundo Plano (`/subagents`)
- Despacho de tarefas paralelas via ferramenta `spawn_subagent`.
- Painel ao vivo com visualização em tempo real do status (`running`, `completed`, `failed`), tempo decorrido e streaming contínuo de logs.

### 🧠 7. Memória Contínua & Persistência de Sessões (`/sessions`)
- **Retomada de Conversas**: Sessões são salvas em disco e podem ser retomadas via `/sessions` ou `agent --resume <sessionId>`.
- **Memória de Longo Prazo do Repositório**: Registra regras de arquitetura e preferências aprendidas em `.agent-memory.json` na raiz do projeto, preservando o contexto entre diferentes sessões.
- **Cache Inteligente**: Cache de leitura de arquivos idempotentes para máxima velocidade e economia de tokens, com invalidação automática em caso de edição.

### 🧩 8. Skills Especializadas (`/skills`) & Plugins Extensíveis (`/plugins`)
- Leitura automática de arquivos `SKILL.md` (formato Claude Code, Codex e Antigravity).
- Suporte a plugins externos e servidores MCP compatíveis com Claude Code e Gemini CLI.

---

## 📦 Instalação

### Instalação Rápida (Script One-Liner)

#### Windows (PowerShell)
```powershell
irm https://raw.githubusercontent.com/faelscarpato/scar-cli/main/scripts/install.ps1 | iex
```

#### Linux & macOS (Bash/cURL)
```bash
curl -fsSL https://raw.githubusercontent.com/faelscarpato/scar-cli/main/scripts/install.sh | bash
```

### Instalação via Gerenciador de Pacotes
```bash
# Clone o repositório
git clone https://github.com/faelscarpato/scar-cli.git
cd cli

# Instale as dependências e compile
pnpm install
pnpm run build

# Registre globalmente no seu sistema
pnpm link --global
```

---

## 🚦 Início Rápido

### 1. Iniciar o Assistente
```bash
agent
```
*(Ou durante o desenvolvimento: `pnpm run dev`)*

### 2. Configurar seu Provedor
Na primeira inicialização, digite `/config` para abrir o assistente por etapas:
1. Escolha o provedor (`openrouter`, `ollama`, `groq` ou `custom`).
2. Confirme ou ajuste a URL base da API.
3. Insira sua Chave de API (ou deixe em branco se estiver usando Ollama local).
4. O assistente valida a conexão em tempo real e lista os modelos liberados.
5. Selecione o modelo inicial padrão.

### 3. Alternar Modelos a Qualquer Momento
Digite `/models` para abrir a lista suspensa. Pressione `f` para filtrar apenas modelos gratuitos.

---

## ⌨️ Tabela de Comandos Slash (TUI)

| Comando | Descrição |
|---|---|
| `/config` | Abre o wizard interativo de configuração de provedor, URL e chave de API |
| `/models` | Lista modelos disponíveis na API do provedor com destaque para `:free` |
| `/permissions` | Alterna a política de segurança (`ask`, `auto-safe`, `always-allow`) |
| `/skills` | Inspeciona e ativa/desativa skills locais e globais (`SKILL.md`) |
| `/plugins` | Gerencia plugins e servidores MCP carregados |
| `/compact` | Compacta o histórico para economizar tokens da janela de contexto |
| `/subagents` | Abre o painel de monitoramento de subagentes em segundo plano |
| `/sessions` | Lista e restaura sessões anteriores salvas em disco |
| `/clear` | Limpa a tela do terminal |
| `/exit` | Encerra a sessão do assistente |

---

## 💻 Comandos de Linha de Comando (CLI)

O assistente também pode ser acionado diretamente pelo terminal sem abrir a TUI:

```bash
# Executar uma instrução única diretamente no repositório
agent "analise o arquivo package.json e verifique se há dependências desatualizadas"

# Iniciar sessão com um provedor e modelo específicos
agent -p ollama -m deepseek-r1:latest

# Listar modelos do provedor configurado
agent models

# Retomar uma sessão de conversa pelo ID
agent --resume abc-123-session

# Gerenciar memória persistente do projeto
agent memory --list
agent memory --set "framework=Next.js 15 App Router"
```

---

## 🧪 Qualidade de Código & Testes

O projeto conta com testes unitários e de integração cobrindo o core agêntico, ferramentas de arquivos, sistema de permissões, clientes OpenAPI e subagentes:

```bash
# Executar a suíte de testes
pnpm test

# Executar checagem de tipos estrita
pnpm run typecheck

# Gerar build de produção
pnpm run build
```

```text
 ✓ tests/cli.test.ts (7 tests)
 ✓ tests/subagents/subagent-manager.test.ts (2 tests)
 ✓ tests/context/codebase-crawler.test.ts (2 tests)
 ✓ tests/tools/file-tools.test.ts (8 tests)
 ✓ tests/skills/skill-manager.test.ts (2 tests)
 ✓ tests/provider/model-catalog.test.ts (7 tests)
 ✓ tests/config/config-manager.test.ts (7 tests)
 ✓ tests/session/session-manager.test.ts (3 tests)
 ✓ tests/provider/openapi-client.test.ts (7 tests)
 ✓ tests/context/agent-memory.test.ts (3 tests)
 ✓ tests/core/agent-loop.test.ts (2 tests)
 ✓ tests/plugins/plugin-loader.test.ts (1 test)
 ✓ tests/context/context-compactor.test.ts (3 tests)
 ✓ tests/context/token-tracker.test.ts (5 tests)
 ✓ tests/core/tool-cache.test.ts (2 tests)
 ✓ tests/core/permissions.test.ts (6 tests)

 Test Files  16 passed (16)
      Tests  67 passed (67)
```

---

## 📄 Licença

Distribuído sob a licença **MIT**. Consulte o arquivo `LICENSE` para mais detalhes.
