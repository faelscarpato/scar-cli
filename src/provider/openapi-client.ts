import { createParser, type EventSourceMessage } from 'eventsource-parser';
import {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ToolCall,
} from './types.js';

export class OpenApiError extends Error {
  public status: number;
  public details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'OpenApiError';
    this.status = status;
    this.details = details;
  }
}

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onToolCallDelta?: (toolCalls: ToolCall[]) => void;
  signal?: AbortSignal;
}

export class OpenApiClient {
  private baseUrl: string;
  private apiKey: string;
  private customHeaders: Record<string, string>;

  constructor(options: {
    baseUrl: string;
    apiKey?: string;
    headers?: Record<string, string>;
  }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey || '';
    this.customHeaders = options.headers || {};
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  private getRequestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.customHeaders,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * Executa chamada com streaming SSE para /chat/completions.
   * Acumula texto e tool_calls progressivamente.
   */
  public async streamChat(
    request: ChatCompletionRequest,
    callbacks: StreamCallbacks = {},
  ): Promise<ChatCompletionResponse> {
    const endpoint = `${this.baseUrl}/chat/completions`;
    const payload = {
      ...request,
      stream: true,
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getRequestHeaders(),
        body: JSON.stringify(payload),
        signal: callbacks.signal,
      });
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        throw err;
      }
      throw new OpenApiError(
        `Falha na conexão de rede com ${endpoint}: ${(err as Error).message}`,
        0,
      );
    }

    if (!response.ok) {
      let errorBody: unknown = null;
      let errorMessage = `Erro HTTP ${response.status} ao chamar provedor OpenAPI (${response.statusText})`;

      try {
        errorBody = await response.json();
        const apiError = (errorBody as Record<string, any>)?.error;
        if (apiError && typeof apiError === 'object') {
          errorMessage = apiError.message || errorMessage;
        } else if (typeof apiError === 'string') {
          errorMessage = apiError;
        }
      } catch {
        try {
          const rawText = await response.text();
          if (rawText) errorMessage += `: ${rawText}`;
        } catch {
          // ignore
        }
      }

      if (response.status === 401) {
        errorMessage = `Chave de API inválida ou ausente (401 Unauthorized): ${errorMessage}`;
      } else if (response.status === 429) {
        errorMessage = `Limite de requisições excedido (429 Rate Limit): ${errorMessage}`;
      }

      throw new OpenApiError(errorMessage, response.status, errorBody);
    }

    if (!response.body) {
      throw new OpenApiError('Corpo da resposta vazio recebido do provedor', response.status);
    }

    let accumulatedContent = '';
    const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();
    let finishReason = 'stop';
    let responseId = '';
    let usage: ChatCompletionResponse['usage'] = undefined;

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    const parser = createParser({
      onEvent: (event: EventSourceMessage) => {
        if (event.data === '[DONE]') {
          return;
        }

        try {
          const chunk: ChatCompletionChunk = JSON.parse(event.data);
          if (chunk.id) responseId = chunk.id;
          if (chunk.usage) {
            usage = {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            };
          }

          const choice = chunk.choices?.[0];
          if (!choice) return;

          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }

          const delta = choice.delta;
          if (!delta) return;

          // Acumula texto comum
          if (delta.content) {
            accumulatedContent += delta.content;
            if (callbacks.onToken) {
              callbacks.onToken(delta.content);
            }
          }

          // Acumula tool_calls
          if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              const existing = toolCallsMap.get(idx) || {
                id: tc.id || `call_${idx}`,
                name: '',
                arguments: '',
              };

              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name += tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;

              toolCallsMap.set(idx, existing);
            }

            if (callbacks.onToolCallDelta) {
              const currentToolCalls: ToolCall[] = Array.from(toolCallsMap.values()).map(
                (entry) => ({
                  id: entry.id,
                  type: 'function',
                  function: {
                    name: entry.name,
                    arguments: entry.arguments,
                  },
                }),
              );
              callbacks.onToolCallDelta(currentToolCalls);
            }
          }
        } catch {
          // Ignora parsing chunks não-JSON ou parciais
        }
      },
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        parser.feed(text);
      }
      const remainder = decoder.decode();
      if (remainder) {
        parser.feed(remainder);
      }
      parser.reset({ consume: true });
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        throw err;
      }
      throw new OpenApiError(`Erro durante o stream de dados: ${(err as Error).message}`, 0);
    }

    const finalToolCalls: ToolCall[] = Array.from(toolCallsMap.entries())
      .sort(([idxA], [idxB]) => idxA - idxB)
      .map(([_, entry]) => ({
        id: entry.id,
        type: 'function',
        function: {
          name: entry.name,
          arguments: entry.arguments,
        },
      }));

    if (finalToolCalls.length > 0 && finishReason === 'stop') {
      finishReason = 'tool_calls';
    }

    return {
      id: responseId,
      content: accumulatedContent,
      toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
      finishReason,
      usage,
    };
  }

  /**
   * Chamada síncrona sem streaming (caso necessário para modelos que não suportam SSE).
   */
  public async createChatCompletion(
    request: ChatCompletionRequest,
    signal?: AbortSignal,
  ): Promise<ChatCompletionResponse> {
    const endpoint = `${this.baseUrl}/chat/completions`;
    const payload = {
      ...request,
      stream: false,
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getRequestHeaders(),
        body: JSON.stringify(payload),
        signal,
      });
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        throw err;
      }
      throw new OpenApiError(
        `Falha de conexão com ${endpoint}: ${(err as Error).message}`,
        0,
      );
    }

    if (!response.ok) {
      let errorBody: unknown = null;
      let errorMessage = `Erro HTTP ${response.status} ao chamar provedor OpenAPI (${response.statusText})`;

      try {
        errorBody = await response.json();
        const apiError = (errorBody as Record<string, any>)?.error;
        if (apiError && typeof apiError === 'object') {
          errorMessage = apiError.message || errorMessage;
        } else if (typeof apiError === 'string') {
          errorMessage = apiError;
        }
      } catch {
        try {
          const rawText = await response.text();
          if (rawText) errorMessage += `: ${rawText}`;
        } catch {
          // ignore
        }
      }

      if (response.status === 401) {
        errorMessage = `Chave de API inválida ou ausente (401 Unauthorized): ${errorMessage}`;
      } else if (response.status === 429) {
        errorMessage = `Limite de requisições excedido (429 Rate Limit): ${errorMessage}`;
      }

      throw new OpenApiError(errorMessage, response.status, errorBody);
    }

    const data = (await response.json()) as any;
    const choice = data.choices?.[0];
    const rawToolCalls = choice?.message?.tool_calls;
    const finishReason = choice?.finish_reason || (rawToolCalls?.length ? 'tool_calls' : 'stop');

    return {
      id: data.id || '',
      content: choice?.message?.content || '',
      toolCalls: rawToolCalls,
      finishReason,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }
}
