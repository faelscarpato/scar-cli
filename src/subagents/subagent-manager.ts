import crypto from 'node:crypto';
import { OpenApiClient } from '../provider/openapi-client.js';
import { ToolRegistry } from '../tools/registry.js';
import { SecurityGuard } from '../core/permissions.js';
import { AgentLoop } from '../core/agent-loop.js';
import { ToolDefinition } from '../tools/registry.js';

export type SubagentStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface SubagentTask {
  id: string;
  name: string;
  prompt: string;
  status: SubagentStatus;
  startedAt: string;
  completedAt?: string;
  elapsedMs: number;
  logs: string[];
  result?: string;
  error?: string;
}

export type SubagentListener = (task: SubagentTask) => void;

export interface SpawnSubagentOptions {
  name: string;
  prompt: string;
  client: OpenApiClient;
  model: string;
  tools: ToolRegistry;
  securityGuard: SecurityGuard;
  systemPrompt?: string;
}

export class SubagentManager {
  private tasks = new Map<string, SubagentTask>();
  private listeners: SubagentListener[] = [];
  private defaultClient?: OpenApiClient;
  private defaultModel?: string;
  private defaultTools?: ToolRegistry;
  private defaultSecurityGuard?: SecurityGuard;

  constructor(defaults?: {
    client?: OpenApiClient;
    model?: string;
    tools?: ToolRegistry;
    securityGuard?: SecurityGuard;
  }) {
    if (defaults) {
      this.defaultClient = defaults.client;
      this.defaultModel = defaults.model;
      this.defaultTools = defaults.tools;
      this.defaultSecurityGuard = defaults.securityGuard;
    }
  }

  public setDefaults(defaults: {
    client: OpenApiClient;
    model: string;
    tools: ToolRegistry;
    securityGuard: SecurityGuard;
  }): void {
    this.defaultClient = defaults.client;
    this.defaultModel = defaults.model;
    this.defaultTools = defaults.tools;
    this.defaultSecurityGuard = defaults.securityGuard;
  }

  public subscribe(listener: SubagentListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(task: SubagentTask): void {
    for (const listener of this.listeners) {
      try {
        listener({ ...task, logs: [...task.logs] });
      } catch {
        // Ignora erros de listeners
      }
    }
  }

  public getAllSubagents(): SubagentTask[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  }

  public getSubagent(id: string): SubagentTask | undefined {
    return this.tasks.get(id);
  }

  public spawnSubagent(options: {
    name: string;
    prompt: string;
    client?: OpenApiClient;
    model?: string;
    tools?: ToolRegistry;
    securityGuard?: SecurityGuard;
    systemPrompt?: string;
  }): SubagentTask {
    const id = `subagent-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
    const startedAt = new Date().toISOString();

    const client = options.client || this.defaultClient;
    const model = options.model || this.defaultModel || 'gpt-4o';
    const tools = options.tools || this.defaultTools || new ToolRegistry();
    const securityGuard =
      options.securityGuard ||
      this.defaultSecurityGuard ||
      new SecurityGuard({
        mode: 'auto-safe',
        allowFileRead: true,
        allowFileWrite: true,
        allowShellExecution: true,
        autoApprovedCommands: [],
      });

    if (!client) {
      throw new Error('SubagentManager precisa de um OpenApiClient configurado para iniciar subagentes.');
    }

    const task: SubagentTask = {
      id,
      name: options.name,
      prompt: options.prompt,
      status: 'running',
      startedAt,
      elapsedMs: 0,
      logs: [`[${new Date().toLocaleTimeString()}] Subagente '${options.name}' iniciado`],
    };

    this.tasks.set(id, task);
    this.notify(task);

    const startTime = Date.now();

    // Executa em segundo plano de forma totalmente assíncrona
    (async () => {
      try {
        const subLoop = new AgentLoop({
          client,
          model,
          tools,
          securityGuard,
          systemPrompt:
            options.systemPrompt ||
            `Você é um subagente especializado focado estritamente na tarefa: "${options.name}". Seja direto, execute ferramentas se necessário e retorne um relatório objetivo.`,
          maxIterations: 8,
        });

        const result = await subLoop.runTurn(options.prompt, {
          onToken: (tok) => {
            // Pode agrupar deltas
          },
          onToolCallStart: (tc) => {
            task.logs.push(`[${new Date().toLocaleTimeString()}] Ferramenta iniciada: ${tc.name}`);
            task.elapsedMs = Date.now() - startTime;
            this.notify(task);
          },
          onToolCallResult: (res) => {
            task.logs.push(`[${new Date().toLocaleTimeString()}] Ferramenta concluída: ${res.name}`);
            task.elapsedMs = Date.now() - startTime;
            this.notify(task);
          },
        });

        task.status = 'completed';
        task.result = result;
        task.completedAt = new Date().toISOString();
        task.elapsedMs = Date.now() - startTime;
        task.logs.push(`[${new Date().toLocaleTimeString()}] Subagente concluído com sucesso.`);
        this.notify(task);
      } catch (err: unknown) {
        task.status = 'failed';
        task.error = (err as Error).message;
        task.completedAt = new Date().toISOString();
        task.elapsedMs = Date.now() - startTime;
        task.logs.push(`[${new Date().toLocaleTimeString()}] Falha: ${(err as Error).message}`);
        this.notify(task);
      }
    })();

    return task;
  }

  public createSubagentTools(): ToolDefinition[] {
    return [
      {
        name: 'spawn_subagent',
        description: 'Inicia um subagente em segundo plano para realizar tarefas paralelas, investigações ou análises assíncronas.',
        category: 'execute',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Nome curto descritivo da tarefa (ex: "Análise de logs", "Pesquisa de imports").',
            },
            prompt: {
              type: 'string',
              description: 'Instruções completas para o subagente executar em segundo plano.',
            },
          },
          required: ['name', 'prompt'],
        },
        execute: async (args: { name: string; prompt: string }) => {
          try {
            const task = this.spawnSubagent({
              name: args.name,
              prompt: args.prompt,
            });
            return `✔ Subagente iniciado em segundo plano com ID: ${task.id} (Nome: "${task.name}"). Você pode verificar o status posteriormente usando get_subagent_status.`;
          } catch (err: unknown) {
            return `Erro ao iniciar subagente: ${(err as Error).message}`;
          }
        },
      },
      {
        name: 'get_subagent_status',
        description: 'Verifica o status e o resultado de um subagente executando em segundo plano pelo seu ID.',
        category: 'read',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID do subagente (ex: "subagent-...").',
            },
          },
          required: ['id'],
        },
        execute: async (args: { id: string }) => {
          const task = this.getSubagent(args.id);
          if (!task) {
            return `Erro: Subagente com ID '${args.id}' não encontrado.`;
          }
          const info = [
            `Subagente: ${task.name} (${task.id})`,
            `Status: ${task.status.toUpperCase()}`,
            `Tempo decorrido: ${(task.elapsedMs / 1000).toFixed(1)}s`,
            `Últimos logs:\n${task.logs.slice(-4).join('\n')}`,
          ];
          if (task.result) {
            info.push(`\nResultado:\n${task.result}`);
          }
          if (task.error) {
            info.push(`\nErro: ${task.error}`);
          }
          return info.join('\n');
        },
      },
      {
        name: 'list_subagents',
        description: 'Lista todos os subagentes criados e seus respectivos status de execução.',
        category: 'read',
        parameters: {
          type: 'object',
          properties: {},
        },
        execute: async () => {
          const all = this.getAllSubagents();
          if (all.length === 0) {
            return 'Nenhum subagente foi executado nesta sessão.';
          }
          return (
            `Subagentes (${all.length}):\n` +
            all
              .map(
                (t) =>
                  `• [${t.status.toUpperCase()}] ${t.id} - ${t.name} (${(t.elapsedMs / 1000).toFixed(1)}s)`,
              )
              .join('\n')
          );
        },
      },
    ];
  }
}
