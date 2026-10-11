import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { getTheme, ThemeColors } from './theme.js';
import { Compose } from './components/compose.js';
import { CommandMenu, SlashMenuItem } from './components/command-menu.js';
import { StreamView } from './components/stream-view.js';
import { ModelSelector } from './components/model-selector.js';
import { ConfirmDialog } from './components/confirm-dialog.js';
import { ConfigWizard } from './components/config-wizard.js';
import { PermissionsModal } from './components/permissions-modal.js';
import { SkillsModal } from './components/skills-modal.js';
import { PluginsModal } from './components/plugins-modal.js';
import { SubagentsModal } from './components/subagents-modal.js';
import { SessionsModal } from './components/sessions-modal.js';
import { AppConfig } from '../config/config-schema.js';
import { ModelInfo } from '../provider/types.js';
import { AgentLoop } from '../core/agent-loop.js';
import { ConfirmationDecision } from '../core/permissions.js';
import { SkillManager } from '../skills/skill-manager.js';
import { PluginLoader } from '../plugins/plugin-loader.js';
import { OpenApiClient } from '../provider/openapi-client.js';
import { ModelCatalog } from '../provider/model-catalog.js';
import { SubagentManager } from '../subagents/subagent-manager.js';
import { SessionManager, SessionData } from '../session/session-manager.js';
import { TokenStats } from '../context/token-tracker.js';

export interface ChatEntry {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
}

export interface AppContainerProps {
  config: AppConfig;
  agentLoop: AgentLoop;
  availableModels: ModelInfo[];
  availableCommands: SlashMenuItem[];
  workingDir: string;
  gitBranch?: string;
  onUpdateModel: (modelId: string) => void;
  onUpdateProvider?: (provider: string, baseUrl: string, apiKey: string, model: string) => void;
  onUpdatePermissions?: (mode: 'ask' | 'auto-safe' | 'always-allow') => void;
  skillManager?: SkillManager;
  pluginLoader?: PluginLoader;
  subagentManager?: SubagentManager;
  sessionManager?: SessionManager;
  initialSessionId?: string;
  initialPrompt?: string;
}

export const AppContainer: React.FC<AppContainerProps> = ({
  config: initialConfig,
  agentLoop,
  availableModels: initialAvailableModels,
  availableCommands,
  workingDir,
  gitBranch,
  onUpdateModel,
  onUpdateProvider,
  onUpdatePermissions,
  skillManager,
  pluginLoader,
  subagentManager,
  sessionManager,
  initialSessionId,
  initialPrompt,
}) => {
  const { exit } = useApp();
  const [currentConfig, setCurrentConfig] = useState<AppConfig>(initialConfig);
  const [modelsList, setModelsList] = useState<ModelInfo[]>(initialAvailableModels);
  const theme = getTheme(currentConfig.theme);

  // Sessão ativa
  const [activeSession, setActiveSession] = useState<SessionData | null>(() => {
    if (!sessionManager) return null;
    if (initialSessionId) {
      const loaded = sessionManager.loadSession(initialSessionId);
      if (loaded) return loaded;
    }
    return sessionManager.createSession({
      provider: initialConfig.currentProvider,
      model: initialConfig.currentModel,
      workingDirectory: workingDir,
    });
  });

  const [messages, setMessages] = useState<ChatEntry[]>(() => {
    const entries: ChatEntry[] = [];

    // Se temos uma sessão retomada, carrega as mensagens dela
    if (activeSession && activeSession.messages && activeSession.messages.length > 0) {
      agentLoop.setMessages(activeSession.messages);
      for (const m of activeSession.messages) {
        if (m.role === 'system') continue;
        if (m.role === 'user' && m.content) {
          entries.push({ role: 'user', content: m.content });
        } else if (m.role === 'assistant' && m.content) {
          entries.push({ role: 'assistant', content: m.content });
        } else if (m.role === 'tool' && m.content) {
          entries.push({ role: 'tool', content: `[${m.name || 'tool'}]: ${m.content.slice(0, 150)}` });
        }
      }
      entries.push({
        role: 'system',
        content: `✔ Sessão '${activeSession.id}' retomada (${activeSession.messages.length} mensagens).`,
      });
      return entries;
    }

    const activeProv = currentConfig.providers.find((p) => p.name === currentConfig.currentProvider);
    const isLocal =
      currentConfig.currentProvider === 'ollama' ||
      (activeProv?.baseUrl || '').includes('localhost') ||
      (activeProv?.baseUrl || '').includes('127.0.0.1');

    if (!isLocal && (!activeProv || !activeProv.apiKey || activeProv.apiKey.trim() === '')) {
      entries.push({
        role: 'system',
        content: `✦ Bem-vindo ao Antigravity CLI Agent!\nℹ Chave de API não configurada para o provedor '${currentConfig.currentProvider}'.\nDigite /config para abrir o assistente interativo por etapas e configurar sua API Key.`,
      });
    }
    return entries;
  });

  const [currentInput, setCurrentInput] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [tokenStats, setTokenStats] = useState<TokenStats>(() => agentLoop.getTokenStats());

  // Modais de controle
  const [showConfigWizard, setShowConfigWizard] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [showPluginsModal, setShowPluginsModal] = useState(false);
  const [showSubagentsModal, setShowSubagentsModal] = useState(false);
  const [showSessionsModal, setShowSessionsModal] = useState(false);

  const [pendingConfirm, setPendingConfirm] = useState<{
    toolName: string;
    category: string;
    args: any;
    resolve: (decision: ConfirmationDecision) => void;
  } | null>(null);

  // Configura o confirm handler no security guard do agentLoop
  useEffect(() => {
    agentLoop.getSecurityGuard().setConfirmHandler(async (details) => {
      return new Promise<ConfirmationDecision>((resolve) => {
        setPendingConfirm({
          toolName: details.toolName,
          category: details.category,
          args: details.args,
          resolve,
        });
      });
    });
  }, [agentLoop]);

  useEffect(() => {
    if (initialPrompt) {
      handleUserSubmit(initialPrompt);
    }
  }, []);

  const refreshModels = async () => {
    const activeProv = currentConfig.providers.find((p) => p.name === currentConfig.currentProvider);
    if (!activeProv) return;
    const catalog = new ModelCatalog({
      baseUrl: activeProv.baseUrl,
      apiKey: activeProv.apiKey,
      providerName: activeProv.name,
    });
    const fetched = await catalog.fetchAvailableModels();
    setModelsList(fetched);
  };

  const persistCurrentSession = () => {
    if (sessionManager && activeSession) {
      const loopMsgs = agentLoop.getMessages();
      activeSession.messages = loopMsgs;
      activeSession.tokenCount = tokenStats.currentTokens;
      activeSession.model = currentConfig.currentModel;
      activeSession.provider = currentConfig.currentProvider;
      sessionManager.saveSession(activeSession);
    }
  };

  const resumeSessionById = (sessionId: string) => {
    if (!sessionManager) return;
    const loaded = sessionManager.loadSession(sessionId);
    if (!loaded) return;

    setActiveSession(loaded);
    agentLoop.setMessages(loaded.messages);
    agentLoop.setModel(loaded.model);
    setCurrentConfig((prev) => ({
      ...prev,
      currentProvider: loaded.provider,
      currentModel: loaded.model,
    }));

    const entries: ChatEntry[] = [];
    for (const m of loaded.messages) {
      if (m.role === 'system') continue;
      if (m.role === 'user' && m.content) {
        entries.push({ role: 'user', content: m.content });
      } else if (m.role === 'assistant' && m.content) {
        entries.push({ role: 'assistant', content: m.content });
      } else if (m.role === 'tool' && m.content) {
        entries.push({ role: 'tool', content: `[${m.name || 'tool'}]: ${m.content.slice(0, 150)}` });
      }
    }
    entries.push({
      role: 'system',
      content: `✔ Sessão '${loaded.id}' retomada (${loaded.messages.length} mensagens).`,
    });
    setMessages(entries);
    setTokenStats(agentLoop.getTokenStats());
  };

  const handleUserSubmit = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed) return;

    // =========================================================================
    // 1. INTERCEPÇÃO TOTAL E IMEDIATA DE QUALQUER COMANDO COM PREFIXO '/'
    // COMANDOS SLASH NUNCA SÃO ENVIADOS PARA A LLM!
    // =========================================================================
    if (trimmed.startsWith('/')) {
      const [cmd, ...args] = trimmed.split(' ');
      const commandLower = cmd.toLowerCase();

      // /exit ou /quit
      if (commandLower === '/exit' || commandLower === '/quit') {
        persistCurrentSession();
        exit();
        return;
      }

      // /clear
      if (commandLower === '/clear') {
        setMessages([]);
        setStreamingContent('');
        return;
      }

      // /config
      if (commandLower === '/config') {
        setShowConfigWizard(true);
        return;
      }

      // /models
      if (commandLower === '/models') {
        await refreshModels();
        setShowModelSelector(true);
        return;
      }

      // /permissions
      if (commandLower === '/permissions') {
        setShowPermissionsModal(true);
        return;
      }

      // /skills
      if (commandLower === '/skills') {
        setShowSkillsModal(true);
        return;
      }

      // /plugins
      if (commandLower === '/plugins') {
        setShowPluginsModal(true);
        return;
      }

      // /compact (Compactação manual de contexto)
      if (commandLower === '/compact') {
        const result = agentLoop.compactContext(4);
        setTokenStats(agentLoop.getTokenStats());
        persistCurrentSession();
        setMessages((prev) => [
          ...prev,
          { role: 'user', content: promptText },
          {
            role: 'system',
            content: `✔ Compactação manual de contexto realizada!\n${result.compactedCount} mensagens anteriores foram resumidas.\nTokens economizados: ~${result.tokensSaved} tokens.`,
          },
        ]);
        return;
      }

      // /subagents (Visualização em tempo real de subagentes)
      if (commandLower === '/subagents') {
        setShowSubagentsModal(true);
        return;
      }

      // /sessions (Listar sessões anteriores gravadas)
      if (commandLower === '/sessions') {
        setShowSessionsModal(true);
        return;
      }

      // /resume [sessionId] (Retomar uma sessão fechada)
      if (commandLower === '/resume') {
        const targetId = args[0]?.trim();
        if (!targetId) {
          setShowSessionsModal(true);
          return;
        }
        if (sessionManager) {
          const loaded = sessionManager.loadSession(targetId);
          if (loaded) {
            resumeSessionById(loaded.id);
            return;
          } else {
            setMessages((prev) => [
              ...prev,
              { role: 'user', content: promptText },
              { role: 'system', content: `✖ Sessão com ID '${targetId}' não encontrada.` },
            ]);
            return;
          }
        }
      }

      // /help
      if (commandLower === '/help') {
        setMessages((prev) => [
          ...prev,
          { role: 'user', content: promptText },
          {
            role: 'system',
            content:
              `Comandos Slash Disponíveis:\n` +
              availableCommands.map((c) => `  ${c.name.padEnd(16)} - ${c.description}`).join('\n') +
              `\n\nAtalhos:\n  • /config      - Assistente interativo em etapas de Provedor e API Key\n  • /models      - Catálogo e seletor de modelos liberados pela chave\n  • /permissions - Modos de permissão (ask, auto-safe, always-allow)\n  • /skills      - Catálogo e ativação de SKILL.md no agente\n  • /plugins     - Plugins e servidores MCP compatíveis\n  • /compact     - Compactação manual de contexto para economizar tokens\n  • /subagents   - Painel e logs em tempo real dos subagentes em segundo plano\n  • /sessions    - Histórico de sessões anteriores salvas\n  • /resume <id> - Retoma uma sessão anterior salva\n  • /clear       - Limpa o histórico de chat da tela\n  • /exit        - Salva a sessão e encerra o assistente`,
          },
        ]);
        return;
      }

      // Se for comando de plugin registrado
      if (pluginLoader) {
        const pluginCmd = pluginLoader.getSlashCommand(commandLower);
        if (pluginCmd) {
          try {
            const result = await pluginCmd.handler(args.join(' '), {
              workingDirectory: workingDir,
              config: currentConfig,
              registerTool: (t) => agentLoop.getTools().register(t),
              registerSlashCommand: (c) => pluginLoader.registerSlashCommand(c),
              log: (m) => {},
            });
            if (result) {
              setMessages((prev) => [
                ...prev,
                { role: 'user', content: promptText },
                { role: 'assistant', content: result },
              ]);
            }
          } catch (err: unknown) {
            setMessages((prev) => [
              ...prev,
              { role: 'system', content: `Erro ao executar plugin: ${(err as Error).message}` },
            ]);
          }
          return;
        }
      }

      // Se o comando começa com / mas não foi reconhecido (ou apenas '/')
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: promptText },
        {
          role: 'system',
          content: `Comando não reconhecido ou incompleto: "${promptText}". Digite /help para ver os comandos disponíveis ou /config para configurar o assistente.`,
        },
      ]);
      return;
    }

    // =========================================================================
    // 2. MENSAGEM DE CHAT COMUM (VERIFICAÇÃO DE CHAVE ANTES DE CHAMAR LLM)
    // =========================================================================
    const activeProv = currentConfig.providers.find((p) => p.name === currentConfig.currentProvider);
    const isLocal =
      currentConfig.currentProvider === 'ollama' ||
      (activeProv?.baseUrl || '').includes('localhost') ||
      (activeProv?.baseUrl || '').includes('127.0.0.1');

    if (!isLocal && (!activeProv || !activeProv.apiKey || activeProv.apiKey.trim() === '')) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: promptText },
        {
          role: 'system',
          content: `✖ Chave de API não configurada para o provedor '${currentConfig.currentProvider}'.\nDigite /config para configurar sua chave de API pelo assistente por etapas antes de enviar mensagens.`,
        },
      ]);
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', content: promptText }]);
    setIsStreaming(true);
    setStreamingContent('');

    try {
      let accumulated = '';
      await agentLoop.runTurn(
        promptText,
        {
          onToken: (tok) => {
            accumulated += tok;
            setStreamingContent(accumulated);
          },
          onToolCallStart: (tc) => {
            setMessages((prev) => [
              ...prev,
              { role: 'tool', content: `[Executando ferramenta: ${tc.name}...]` },
            ]);
          },
          onToolCallResult: (res) => {
            setMessages((prev) => [
              ...prev,
              { role: 'tool', content: `[Resultado de ${res.name}]: ${res.output.slice(0, 300)}` },
            ]);
          },
          onAutoCompact: (compaction) => {
            setMessages((prev) => [
              ...prev,
              {
                role: 'system',
                content: `⚡ Auto-compactação de contexto acionada (~${compaction.tokensSaved} tokens liberados).`,
              },
            ]);
          },
        },
      );

      setMessages((prev) => [...prev, { role: 'assistant', content: accumulated }]);
    } catch (err: unknown) {
      const errMsg = (err as Error).message;
      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: errMsg.includes('401')
            ? `Erro de Autenticação (401 Unauthorized): Chave inválida ou não autorizada pelo provedor.\nDigite /config para atualizar sua chave de API.`
            : `Erro durante a execução: ${errMsg}`,
        },
      ]);
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
      const updatedStats = agentLoop.getTokenStats();
      setTokenStats(updatedStats);
      persistCurrentSession();
    }
  };

  const isModalActive =
    showConfigWizard ||
    showModelSelector ||
    showPermissionsModal ||
    showSkillsModal ||
    showPluginsModal ||
    showSubagentsModal ||
    showSessionsModal ||
    !!pendingConfirm;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Cabeçalho Fixo na TUI */}
      <Box
        borderStyle="round"
        borderColor={theme.primary}
        paddingX={1}
        flexDirection="column"
      >
        <Box justifyContent="space-between">
          <Text color={theme.primary} bold>
            ✦ Antigravity CLI Agent v0.1.0
          </Text>
          <Text color={theme.muted}>
            Dir: <Text bold>{workingDir}</Text>
          </Text>
          <Text color={theme.muted}>
            {gitBranch ? `git:(${gitBranch})` : 'sem git'}
          </Text>
        </Box>
        <Box justifyContent="space-between" marginTop={0}>
          <Text color={theme.secondary}>
            Provedor: <Text bold>{currentConfig.currentProvider}</Text> | Modelo:{' '}
            <Text bold>{currentConfig.currentModel}</Text>
          </Text>
          <Text color={tokenStats.isNearLimit ? theme.warning : theme.success} bold>
            Tokens: {tokenStats.formattedCurrent} / {tokenStats.formattedMax} ({tokenStats.percentage}%)
          </Text>
        </Box>
      </Box>

      {/* Histórico de Mensagens */}
      <Box flexDirection="column" marginY={1}>
        {messages.map((m, idx) => {
          if (m.role === 'user') {
            return (
              <Box key={idx} marginY={0}>
                <Text color={theme.primary} bold>
                  Você:{' '}
                </Text>
                <Text>{m.content}</Text>
              </Box>
            );
          }
          if (m.role === 'assistant') {
            return (
              <Box key={idx} marginY={0} flexDirection="column">
                <Text color={theme.success} bold>
                  Assistente:
                </Text>
                <Text>{m.content}</Text>
              </Box>
            );
          }
          if (m.role === 'tool') {
            return (
              <Text key={idx} color={theme.warning}>
                {m.content}
              </Text>
            );
          }
          return (
            <Text key={idx} color={theme.muted}>
              {m.content}
            </Text>
          );
        })}

        {/* Resposta em Streaming */}
        {isStreaming && (
          <StreamView
            content={streamingContent}
            isStreaming={isStreaming}
            theme={theme}
          />
        )}
      </Box>

      {/* MODAL 1: Wizard de Configuração (/config) */}
      {showConfigWizard && (
        <ConfigWizard
          currentProvider={currentConfig.currentProvider}
          currentModel={currentConfig.currentModel}
          theme={theme}
          onSave={({ provider, baseUrl, apiKey, model }) => {
            setShowConfigWizard(false);
            if (onUpdateProvider) {
              onUpdateProvider(provider, baseUrl, apiKey, model);
            }
            const updatedProviders = currentConfig.providers.map((p) =>
              p.name === provider ? { ...p, baseUrl, apiKey } : p,
            );
            if (!updatedProviders.some((p) => p.name === provider)) {
              updatedProviders.push({ name: provider, baseUrl, apiKey, headers: {}, description: 'Configurado via wizard' });
            }

            const newCfg = {
              ...currentConfig,
              currentProvider: provider,
              currentModel: model,
              providers: updatedProviders,
            };
            setCurrentConfig(newCfg);

            agentLoop.setClient(new OpenApiClient({ baseUrl, apiKey }));
            agentLoop.setModel(model);
            setTokenStats(agentLoop.getTokenStats());

            setMessages((prev) => [
              ...prev,
              {
                role: 'system',
                content: `✔ Configuração atualizada com sucesso!\nProvedor: ${provider} | Modelo: ${model}`,
              },
            ]);
            refreshModels();
            persistCurrentSession();
          }}
          onClose={() => setShowConfigWizard(false)}
        />
      )}

      {/* MODAL 2: Catálogo de Modelos (/models) */}
      {showModelSelector && (
        <ModelSelector
          models={modelsList}
          currentModel={currentConfig.currentModel}
          onSelect={(modelId) => {
            onUpdateModel(modelId);
            const found = modelsList.find((m) => m.id === modelId);
            agentLoop.setModel(modelId, found?.contextLength);
            setCurrentConfig((prev) => ({ ...prev, currentModel: modelId }));
            setTokenStats(agentLoop.getTokenStats());
            setShowModelSelector(false);
            setMessages((prev) => [
              ...prev,
              { role: 'system', content: `✔ Modelo ativo alterado para: ${modelId}` },
            ]);
            persistCurrentSession();
          }}
          onClose={() => setShowModelSelector(false)}
          theme={theme}
        />
      )}

      {/* MODAL 3: Permissões (/permissions) */}
      {showPermissionsModal && (
        <PermissionsModal
          currentMode={currentConfig.permissions.mode || 'auto-safe'}
          theme={theme}
          onSelectMode={(mode) => {
            if (onUpdatePermissions) {
              onUpdatePermissions(mode);
            }
            agentLoop.getSecurityGuard().setMode(mode);
            setCurrentConfig((prev) => ({
              ...prev,
              permissions: { ...prev.permissions, mode },
            }));
            setShowPermissionsModal(false);
            setMessages((prev) => [
              ...prev,
              { role: 'system', content: `✔ Modo de permissões definido para: '${mode}'` },
            ]);
          }}
          onClose={() => setShowPermissionsModal(false)}
        />
      )}

      {/* MODAL 4: Skills (/skills) */}
      {showSkillsModal && skillManager && (
        <SkillsModal
          skillManager={skillManager}
          theme={theme}
          onToggleSkill={(skillName) => {
            const isNowActive = skillManager.toggleSkill(skillName);
            setMessages((prev) => [
              ...prev,
              {
                role: 'system',
                content: `✔ Skill '${skillName}' ${isNowActive ? 'ativada' : 'desativada'}.`,
              },
            ]);
          }}
          onClose={() => setShowSkillsModal(false)}
        />
      )}

      {/* MODAL 5: Plugins (/plugins) */}
      {showPluginsModal && pluginLoader && (
        <PluginsModal
          pluginLoader={pluginLoader}
          theme={theme}
          onClose={() => setShowPluginsModal(false)}
        />
      )}

      {/* MODAL 6: Subagentes em Segundo Plano (/subagents) */}
      {showSubagentsModal && subagentManager && (
        <SubagentsModal
          subagentManager={subagentManager}
          theme={theme}
          onClose={() => setShowSubagentsModal(false)}
        />
      )}

      {/* MODAL 7: Histórico de Sessões (/sessions) */}
      {showSessionsModal && sessionManager && (
        <SessionsModal
          sessionManager={sessionManager}
          currentSessionId={activeSession?.id}
          theme={theme}
          onResume={(sessionId) => {
            resumeSessionById(sessionId);
            setShowSessionsModal(false);
          }}
          onClose={() => setShowSessionsModal(false)}
        />
      )}

      {/* Diálogo de Confirmação de Ferramenta */}
      {pendingConfirm && (
        <ConfirmDialog
          toolName={pendingConfirm.toolName}
          category={pendingConfirm.category}
          args={pendingConfirm.args}
          onDecision={(decision) => {
            pendingConfirm.resolve(decision);
            setPendingConfirm(null);
          }}
          theme={theme}
        />
      )}

      {/* Compose Input */}
      <Compose
        onSubmit={handleUserSubmit}
        onChange={setCurrentInput}
        theme={theme}
        disabled={isStreaming || isModalActive}
      />

      {/* Menu Slash abaixo do Compose */}
      <CommandMenu
        input={currentInput}
        commands={availableCommands}
        onSelect={(cmdName) => {
          handleUserSubmit(cmdName);
          setCurrentInput('');
        }}
        theme={theme}
      />

      {/* Rodapé */}
      <Box marginTop={1} justifyContent="space-between">
        <Text color={theme.muted}>
          Digite <Text color={theme.primary}>/</Text> para menu de comandos •{' '}
          <Text color={theme.primary}>/config</Text> por etapas •{' '}
          <Text color={theme.primary}>/models</Text> modelos •{' '}
          <Text color={theme.primary}>/subagents</Text> subagentes •{' '}
          <Text color={theme.primary}>/sessions</Text> sessões
        </Text>
      </Box>
    </Box>
  );
};
