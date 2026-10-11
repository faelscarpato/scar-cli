import { OpenApiClient } from '../provider/openapi-client.js';
import { ChatMessage, ToolCall } from '../provider/types.js';
import { ToolRegistry } from '../tools/registry.js';
import { SecurityGuard } from './permissions.js';
import { ToolCache } from './tool-cache.js';
import { calculateTokenStats, TokenStats } from '../context/token-tracker.js';
import { compactHistory, CompactionResult, shouldAutoCompact } from '../context/context-compactor.js';

export interface AgentLoopCallbacks {
  onToken?: (token: string) => void;
  onToolCallStart?: (toolCall: { id: string; name: string; args: any }) => void;
  onToolCallResult?: (result: { id: string; name: string; output: string }) => void;
  onStepFinish?: (step: number) => void;
  onAutoCompact?: (result: CompactionResult) => void;
}

export interface AgentLoopOptions {
  client: OpenApiClient;
  model: string;
  tools: ToolRegistry;
  securityGuard: SecurityGuard;
  systemPrompt: string;
  maxIterations?: number;
  toolCache?: ToolCache;
  reportedContextLength?: number;
}

export class AgentLoop {
  private client: OpenApiClient;
  private model: string;
  private tools: ToolRegistry;
  private securityGuard: SecurityGuard;
  private toolCache: ToolCache;
  private messages: ChatMessage[] = [];
  private maxIterations: number;
  private reportedContextLength?: number;

  constructor(options: AgentLoopOptions) {
    this.client = options.client;
    this.model = options.model;
    this.tools = options.tools;
    this.securityGuard = options.securityGuard;
    this.maxIterations = options.maxIterations ?? 15;
    this.toolCache = options.toolCache ?? new ToolCache();
    this.reportedContextLength = options.reportedContextLength;

    // Inicializa histórico com o system prompt
    this.messages.push({
      role: 'system',
      content: options.systemPrompt,
    });
  }

  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  public setMessages(messages: ChatMessage[]): void {
    this.messages = [...messages];
  }

  public setClient(client: OpenApiClient): void {
    this.client = client;
  }

  public setModel(model: string, contextLength?: number): void {
    this.model = model;
    if (contextLength !== undefined) {
      this.reportedContextLength = contextLength;
    }
  }

  public getModel(): string {
    return this.model;
  }

  public getTools(): ToolRegistry {
    return this.tools;
  }

  public getSecurityGuard(): SecurityGuard {
    return this.securityGuard;
  }

  public getToolCache(): ToolCache {
    return this.toolCache;
  }

  public getTokenStats(): TokenStats {
    return calculateTokenStats(this.messages, this.model, this.reportedContextLength);
  }

  public compactContext(maxRecentMessages?: number): CompactionResult {
    const result = compactHistory(this.messages, { maxRecentMessages });
    this.messages = result.compactedMessages;
    return result;
  }

  public updateSystemPrompt(systemPrompt: string): void {
    if (this.messages.length > 0 && this.messages[0].role === 'system') {
      this.messages[0].content = systemPrompt;
    } else {
      this.messages.unshift({
        role: 'system',
        content: systemPrompt,
      });
    }
  }

  public appendUserMessage(content: string): void {
    this.messages.push({
      role: 'user',
      content,
    });
  }

  /**
   * Executa a iteração agêntica completa até o modelo retornar uma resposta final sem tool calls
   * ou atingir o número máximo de iterações.
   */
  public async runTurn(
    userPrompt?: string,
    callbacks: AgentLoopCallbacks = {},
    signal?: AbortSignal,
  ): Promise<string> {
    if (userPrompt) {
      this.appendUserMessage(userPrompt);
    }

    // 1. Verificação de Auto-Compactação se o histórico estiver próximo ao limite (>= 75%)
    const stats = this.getTokenStats();
    if (shouldAutoCompact(stats.currentTokens, stats.maxTokens, 0.75)) {
      const compaction = this.compactContext(4);
      if (callbacks.onAutoCompact) {
        callbacks.onAutoCompact(compaction);
      }
    }

    const availableTools = this.tools.toOpenAiTools();
    let iteration = 0;
    let finalAssistantText = '';

    while (iteration < this.maxIterations) {
      iteration++;

      let accumulatedContent = '';
      let streamedToolCalls: ToolCall[] | undefined;

      const response = await this.client.streamChat(
        {
          model: this.model,
          messages: this.messages,
          tools: availableTools.length > 0 ? availableTools : undefined,
          stream: true,
        },
        {
          onToken: (tok) => {
            accumulatedContent += tok;
            if (callbacks.onToken) {
              callbacks.onToken(tok);
            }
          },
          onToolCallDelta: (tcs) => {
            streamedToolCalls = tcs;
          },
          signal,
        },
      );

      finalAssistantText = response.content || accumulatedContent;
      const toolCalls = response.toolCalls || streamedToolCalls;

      // Adiciona resposta do assistente ao histórico
      this.messages.push({
        role: 'assistant',
        content: finalAssistantText || null,
        tool_calls: toolCalls,
      });

      // Se não houver tool calls para executar, o turno terminou
      if (!toolCalls || toolCalls.length === 0) {
        if (callbacks.onStepFinish) {
          callbacks.onStepFinish(iteration);
        }
        break;
      }

      // Executa as ferramentas chamadas pelo modelo
      for (const tc of toolCalls) {
        const toolDef = this.tools.get(tc.function.name);
        let parsedArgs: any = {};
        try {
          parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          parsedArgs = {};
        }

        if (callbacks.onToolCallStart) {
          callbacks.onToolCallStart({
            id: tc.id,
            name: tc.function.name,
            args: parsedArgs,
          });
        }

        let output = '';
        if (!toolDef) {
          output = `Erro: Ferramenta '${tc.function.name}' não está registrada no agente.`;
        } else {
          // Checa autorização de segurança
          const auth = await this.securityGuard.authorize(toolDef, parsedArgs);
          if (!auth.allowed) {
            output = `Ação bloqueada: ${auth.reason || 'Permissão negada'}`;
          } else {
            // Verifica no ToolCache se temos resposta em cache para ferramentas de leitura
            const cachedOutput = this.toolCache.get(tc.function.name, parsedArgs);
            if (cachedOutput !== null) {
              output = cachedOutput;
            } else {
              output = await this.tools.executeTool(tc.function.name, parsedArgs);
              this.toolCache.set(tc.function.name, parsedArgs, output);
            }

            // Invalidação de cache caso seja ferramenta que altera arquivos
            const mutatingTools = [
              'edit_file',
              'create_file',
              'rewrite_file',
              'delete_file',
              'delete_directory',
              'move_file',
              'rename_file',
              'copy_file',
              'create_directory',
            ];
            if (mutatingTools.includes(tc.function.name)) {
              const targetPath = parsedArgs.path || parsedArgs.targetPath || parsedArgs.destinationPath || '';
              this.toolCache.invalidateForPath(targetPath);
            }
          }
        }

        if (callbacks.onToolCallResult) {
          callbacks.onToolCallResult({
            id: tc.id,
            name: tc.function.name,
            output,
          });
        }

        // Adiciona resultado da tool ao histórico
        this.messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.function.name,
          content: output,
        });
      }

      if (callbacks.onStepFinish) {
        callbacks.onStepFinish(iteration);
      }
    }

    return finalAssistantText;
  }
}
