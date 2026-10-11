import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';
import { defaultConfigManager } from './config/config-manager.js';
import { ModelCatalog } from './provider/model-catalog.js';
import { OpenApiClient } from './provider/openapi-client.js';
import { ToolRegistry } from './tools/registry.js';
import { createFileTools } from './tools/file-tools.js';
import { createShellTools } from './tools/shell-tools.js';
import { createGitTools } from './tools/git-tools.js';
import { SecurityGuard } from './core/permissions.js';
import { CodebaseCrawler } from './context/codebase-crawler.js';
import { GitContext } from './context/git-context.js';
import { buildSystemPrompt } from './core/prompts.js';
import { AgentLoop } from './core/agent-loop.js';
import { PluginLoader } from './plugins/plugin-loader.js';
import { SkillManager } from './skills/skill-manager.js';
import { AppContainer } from './tui/app.js';
import { SlashMenuItem } from './tui/components/command-menu.js';
import { runInteractiveConfigWizard } from './config/interactive-config.js';
import { AgentMemoryManager } from './context/agent-memory.js';
import { ToolCache } from './core/tool-cache.js';
import { SubagentManager } from './subagents/subagent-manager.js';
import { SessionManager } from './session/session-manager.js';

export async function listAvailableModels(options: {
  providerName?: string;
  apiKey?: string;
}): Promise<void> {
  const config = defaultConfigManager.loadConfig();
  let provider = defaultConfigManager.getActiveProvider();

  if (options.providerName) {
    const found = config.providers.find((p) => p.name === options.providerName);
    if (found) {
      provider = found;
    } else {
      provider = {
        name: options.providerName,
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: options.apiKey || '',
        headers: {},
      };
    }
  }

  const apiKey = options.apiKey || provider.apiKey;
  console.log(`Buscando modelos disponíveis para o provedor '${provider.name}' (${provider.baseUrl})...\n`);

  const catalog = new ModelCatalog({
    baseUrl: provider.baseUrl,
    apiKey,
    providerName: provider.name,
  });

  const models = await catalog.fetchAvailableModels();
  console.log('Modelos Disponíveis:');
  for (const m of models) {
    const tag = m.isFree ? '[GRATUITO / FREE]' : '[PAGO]';
    const ctx = m.contextLength ? ` (${(m.contextLength / 1000).toFixed(0)}k ctx)` : '';
    console.log(`  • ${m.id} ${tag}${ctx}`);
    if (m.description) {
      console.log(`    ↳ ${m.description}`);
    }
  }
  console.log(`\nTotal: ${models.length} modelos encontrados.`);
}

export function createCli(): Command {
  const program = new Command();

  program
    .name('agent')
    .description('Assistente de código AI para terminal com consciência de repositório')
    .version('0.1.0')
    .option('-p, --provider <provider>', 'Define o provedor OpenAPI ativo (ex: openrouter, ollama, groq)')
    .option('-m, --model <model>', 'Define o modelo LLM a ser utilizado')
    .option('-k, --key <key>', 'Define temporariamente a API Key para a sessão')
    .option('--models', 'Lista todos os modelos disponíveis e identifica os gratuitos (:free)')
    .option('--resume [sessionId]', 'Retoma uma sessão de conversa anterior salva em disco')
    .argument('[prompt...]', 'Prompt opcional para executar em modo não-interativo ou iniciar sessão')
    .action(async (promptParts: string[], options: {
      provider?: string;
      model?: string;
      key?: string;
      models?: boolean;
      resume?: string | boolean;
    }) => {
      // 1. Se foi passada a flag --models
      if (options.models) {
        await listAvailableModels({
          providerName: options.provider,
          apiKey: options.key,
        });
        return;
      }

      const config = defaultConfigManager.loadConfig();
      if (options.provider) {
        defaultConfigManager.setCurrentProvider(options.provider);
      }
      if (options.model) {
        defaultConfigManager.setCurrentModel(options.model);
      }

      const activeProvider = defaultConfigManager.getActiveProvider();
      const apiKey = options.key || activeProvider.apiKey;
      const model = options.model || config.currentModel;

      // Monta ferramentas nativas e plugins
      const tools = new ToolRegistry();
      for (const t of createFileTools()) tools.register(t);
      for (const t of createShellTools()) tools.register(t);
      for (const t of createGitTools()) tools.register(t);

      // Memória de longo prazo do projeto
      const memoryManager = new AgentMemoryManager(process.cwd());
      for (const t of memoryManager.createMemoryTools()) tools.register(t);

      // Skills
      const skillManager = new SkillManager({
        workspaceDir: process.cwd(),
        activeSkills: config.activeSkills,
      });
      for (const t of skillManager.createSkillTools()) tools.register(t);
      await skillManager.discoverSkills();

      const pluginLoader = new PluginLoader({
        toolRegistry: tools,
        config,
      });
      await pluginLoader.discoverAndLoad();

      const securityGuard = new SecurityGuard(config.permissions);

      // Coleta contexto do repositório
      const crawler = new CodebaseCrawler();
      const gitContext = new GitContext();
      const [repoStructure, gitSummary] = await Promise.all([
        crawler.getStructureSummary(),
        gitContext.getFormattedContext(),
      ]);

      const systemPrompt = buildSystemPrompt({
        workingDirectory: process.cwd(),
        repoStructure,
        gitContext: gitSummary,
        customAddition: config.systemPromptAddition,
        activeSkills: skillManager.getInjectedSkillsPrompt(),
        agentMemory: memoryManager.getFormattedContext(),
      });

      const client = new OpenApiClient({
        baseUrl: activeProvider.baseUrl,
        apiKey,
      });

      // Subagentes
      const subagentManager = new SubagentManager();
      subagentManager.setDefaults({
        client,
        model,
        tools,
        securityGuard,
      });
      for (const t of subagentManager.createSubagentTools()) tools.register(t);

      // Tool cache
      const toolCache = new ToolCache();

      const agentLoop = new AgentLoop({
        client,
        model,
        tools,
        securityGuard,
        systemPrompt,
        maxIterations: config.maxToolIterations,
        toolCache,
      });

      // Sessões
      const sessionManager = new SessionManager();
      let initialSessionId: string | undefined;

      if (options.resume) {
        if (typeof options.resume === 'string') {
          initialSessionId = options.resume;
        } else {
          const latest = sessionManager.getLatestSession();
          if (latest) {
            initialSessionId = latest.id;
          }
        }
      }

      const promptText = promptParts.join(' ').trim();

      // 2. Modo não-interativo direto se prompt foi fornecido via linha de comando
      if (promptText) {
        process.stdout.write(`\n✦ Antigravity Agent [${model}]\n\n`);
        await agentLoop.runTurn(promptText, {
          onToken: (tok) => process.stdout.write(tok),
          onToolCallStart: (tc) => console.log(`\n⚙ [Ferramenta: ${tc.name}]`),
          onToolCallResult: (res) => console.log(`✔ [Resultado: ${res.name}]`),
        });
        process.stdout.write('\n\n');
        return;
      }

      // 3. Modo interativo TUI (Ink)
      const catalog = new ModelCatalog({
        baseUrl: activeProvider.baseUrl,
        apiKey,
        providerName: activeProvider.name,
      });
      const availableModels = await catalog.fetchAvailableModels();

      const baseCommands: SlashMenuItem[] = [
        { name: '/help', description: 'Exibe lista de ajuda e comandos' },
        { name: '/config', description: 'Configuração interativa de provedor e API Key por etapas' },
        { name: '/models', description: 'Catálogo e seletor de modelos liberados pela chave' },
        { name: '/permissions', description: 'Configurar modo de permissões (ask, auto-safe, always-allow)' },
        { name: '/skills', description: 'Gerenciar e ativar skills (SKILL.md) no agente' },
        { name: '/plugins', description: 'Gerenciar plugins e extensões compatíveis' },
        { name: '/compact', description: 'Compactação de contexto manual para liberar tokens' },
        { name: '/subagents', description: 'Monitorar subagentes em segundo plano em tempo real' },
        { name: '/sessions', description: 'Histórico e alternância de sessões salvas' },
        { name: '/clear', description: 'Limpa a tela e o histórico da sessão' },
        { name: '/exit', description: 'Salva a sessão e encerra o assistente' },
      ];

      for (const cmd of pluginLoader.getSlashCommands()) {
        baseCommands.push({
          name: `/${cmd.name}`,
          description: cmd.description,
        });
      }

      const branch = await gitContext.getCurrentBranch();

      render(
        React.createElement(AppContainer, {
          config,
          agentLoop,
          availableModels,
          availableCommands: baseCommands,
          workingDir: process.cwd(),
          gitBranch: branch,
          skillManager,
          pluginLoader,
          subagentManager,
          sessionManager,
          initialSessionId,
          onUpdateModel: (newModel: string) => {
            defaultConfigManager.setCurrentModel(newModel);
          },
          onUpdateProvider: (provider: string, baseUrl: string, key: string, newModel: string) => {
            defaultConfigManager.addOrUpdateProvider({
              name: provider,
              baseUrl,
              apiKey: key,
              headers: {},
              description: 'Configurado via assistente',
            });
            defaultConfigManager.setCurrentProvider(provider);
            defaultConfigManager.setCurrentModel(newModel);
          },
          onUpdatePermissions: (mode: 'ask' | 'auto-safe' | 'always-allow') => {
            defaultConfigManager.setPermissionsMode(mode);
          },
        }),
      );
    });

  program
    .command('config')
    .description('Gerencia as configurações e credenciais do assistente passo a passo')
    .option('--wizard', 'Inicia o assistente interativo passo a passo')
    .option('--list', 'Exibe a configuração atual completa')
    .option('--set-key <key>', 'Salva a API Key do provedor ativo')
    .option('--set-provider <provider>', 'Altera o provedor padrão')
    .option('--set-model <model>', 'Altera o modelo padrão')
    .option('--reset', 'Restaura a configuração para os padrões originais')
    .action(async (options) => {
      if (options.reset) {
        defaultConfigManager.resetToDefaults();
        console.log('✔ Configuração restaurada para os padrões originais.');
        return;
      }

      if (options.setProvider) {
        defaultConfigManager.setCurrentProvider(options.setProvider);
        console.log(`✔ Provedor ativo definido para: ${options.setProvider}`);
      }

      if (options.setModel) {
        defaultConfigManager.setCurrentModel(options.setModel);
        console.log(`✔ Modelo padrão definido para: ${options.setModel}`);
      }

      if (options.setKey) {
        const active = defaultConfigManager.getActiveProvider();
        defaultConfigManager.setProviderApiKey(active.name, options.setKey);
        console.log(`✔ Chave de API atualizada para o provedor '${active.name}'.`);
      }

      if (options.list) {
        const config = defaultConfigManager.loadConfig();
        console.log('\n--- Configuração Atual ---');
        console.log(`Arquivo: ${defaultConfigManager.getConfigPath()}`);
        console.log(`Provedor ativo: ${config.currentProvider}`);
        console.log(`Modelo ativo: ${config.currentModel}`);
        console.log(`Modo de permissões: ${config.permissions.mode || 'auto-safe'}`);
        console.log(`Skills ativas: ${(config.activeSkills || []).join(', ') || '(nenhuma)'}`);
        console.log(`Tema: ${config.theme}`);
        console.log('\nProvedores cadastrados:');
        for (const prov of config.providers) {
          const isSelected = prov.name === config.currentProvider ? ' (ativo)' : '';
          const hasKey = prov.apiKey ? '✔ chave configurada' : '✖ sem chave';
          console.log(`  • ${prov.name}${isSelected}: ${prov.baseUrl} [${hasKey}]`);
        }
        console.log('---------------------------\n');
        return;
      }

      // Se nenhum parâmetro de alteração direta foi fornecido ou --wizard, executa o assistente passo a passo!
      if (!options.setKey && !options.setProvider && !options.setModel) {
        await runInteractiveConfigWizard(defaultConfigManager);
      }
    });

  program
    .command('models')
    .description('Lista os modelos disponíveis do provedor ativo e verifica modelos gratuitos')
    .option('-p, --provider <provider>', 'Provedor para consulta')
    .option('-k, --key <key>', 'Chave de API temporária')
    .action(async (options) => {
      await listAvailableModels({
        providerName: options.provider,
        apiKey: options.key,
      });
    });

  program
    .command('permissions')
    .description('Visualiza ou altera o modo de permissões de execução (ask, auto-safe, always-allow)')
    .argument('[mode]', 'Modo de permissão desejado: ask | auto-safe | always-allow')
    .action(async (mode?: string) => {
      const config = defaultConfigManager.loadConfig();
      if (!mode) {
        console.log(`\nModo de permissão atual: '${config.permissions.mode || 'auto-safe'}'`);
        console.log('Opções disponíveis:');
        console.log('  • auto-safe    (Recomendado: leituras automáticas, confirmação para escrita/shell)');
        console.log('  • ask          (Estrito: pede confirmação para todas ações sensíveis)');
        console.log('  • always-allow (Livre: sem pedidos de confirmação)\n');
        return;
      }

      const validModes = ['ask', 'auto-safe', 'always-allow'];
      if (!validModes.includes(mode)) {
        console.error(`Modo inválido '${mode}'. Escolha um entre: ${validModes.join(', ')}`);
        process.exitCode = 1;
        return;
      }

      defaultConfigManager.setPermissionsMode(mode as any);
      console.log(`✔ Modo de permissão alterado com sucesso para: '${mode}'.`);
    });

  program
    .command('skills')
    .description('Lista e inspeciona skills disponíveis (SKILL.md)')
    .action(async () => {
      const config = defaultConfigManager.loadConfig();
      const skillManager = new SkillManager({
        workspaceDir: process.cwd(),
        activeSkills: config.activeSkills,
      });
      const skills = await skillManager.discoverSkills();
      console.log(`\nSkills Encontradas (${skills.length}):`);
      for (const s of skills) {
        const status = s.isActive ? '[ATIVA]' : '[INATIVA]';
        console.log(`  • ${s.name.padEnd(24)} ${status} - ${s.description}`);
      }
      console.log('\nUse /skills na TUI para ativar/desativar interativamente.\n');
    });

  program
    .command('plugins')
    .description('Gerencia plugins compatíveis com Claude Code e Gemini CLI')
    .option('--install <path>', 'Instala um plugin a partir de um diretório ou arquivo local')
    .action(async (options) => {
      const config = defaultConfigManager.loadConfig();
      const tools = new ToolRegistry();
      const loader = new PluginLoader({ toolRegistry: tools, config });
      await loader.discoverAndLoad();

      if (options.install) {
        console.log(`Instalando plugin de '${options.install}'...`);
        const res = await loader.installPlugin(options.install);
        if (res.success) {
          console.log(`✔ ${res.message}`);
        } else {
          console.error(`✖ ${res.message}`);
          process.exitCode = 1;
        }
        return;
      }

      const plugins = loader.getLoadedPlugins();
      console.log(`\nPlugins Carregados (${plugins.length}):`);
      for (const p of plugins) {
        console.log(`  • ${p.name} (v${p.version}) - ${p.description || '(sem descrição)'}`);
      }
      console.log('\nPara instalar: agent plugins --install <caminho-do-plugin>\n');
    });

  program
    .command('sessions')
    .description('Lista as sessões anteriores gravadas em disco')
    .action(async () => {
      const sessionManager = new SessionManager();
      const sessions = sessionManager.listSessions();
      console.log(`\nSessões Salvas (${sessions.length}):`);
      if (sessions.length === 0) {
        console.log('  (Nenhuma sessão anterior encontrada)');
      } else {
        for (const s of sessions) {
          const dateStr = new Date(s.updatedAt).toLocaleString();
          console.log(`  • [${s.id}] ${s.title.padEnd(30)} | ${s.model} | ${s.messageCount} msgs (${dateStr})`);
        }
      }
      console.log('\nPara retomar: agent --resume <sessionId>\n');
    });

  program
    .command('memory')
    .description('Gerencia a memória contínua de longo prazo do projeto')
    .option('--list', 'Lista todos os fatos aprendidos gravados')
    .option('--set <entry>', 'Define um fato no formato chave=valor')
    .action(async (options) => {
      const memoryManager = new AgentMemoryManager(process.cwd());
      if (options.set) {
        const parts = options.set.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const fact = parts.slice(1).join('=').trim();
          memoryManager.saveFact(key, fact);
          console.log(`✔ Fato gravado na memória: [${key}] => "${fact}"`);
          return;
        }
      }
      const mem = memoryManager.loadMemory();
      const keys = Object.keys(mem.facts);
      console.log(`\nMemória do Projeto (${keys.length} fatos gravados):`);
      if (keys.length === 0) {
        console.log('  (Nenhum fato gravado ainda)');
      } else {
        for (const k of keys) {
          console.log(`  • [${k}]: ${mem.facts[k].fact}`);
        }
      }
      console.log('');
    });

  return program;
}
