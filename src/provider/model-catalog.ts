import { ModelInfo } from './types.js';

export interface RawOpenAiModel {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
  };
  pricing_tier?: string;
  architecture?: {
    modality?: string;
    tokenizer?: string;
  };
}

export interface RawModelsResponse {
  data: RawOpenAiModel[];
}

export class ModelCatalog {
  private baseUrl: string;
  private apiKey: string;
  private providerName: string;

  constructor(options: {
    baseUrl: string;
    apiKey?: string;
    providerName?: string;
  }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey || '';
    this.providerName = options.providerName || 'custom';
  }

  /**
   * Avalia se um modelo é gratuito com base em seu ID, provedor e metadados de preço.
   */
  public isModelFree(modelId: string, rawModel?: RawOpenAiModel): boolean {
    const idLower = modelId.toLowerCase();

    // 1. Provedor local Ollama sempre é gratuito
    if (
      this.providerName === 'ollama' ||
      this.baseUrl.includes('localhost') ||
      this.baseUrl.includes('127.0.0.1')
    ) {
      return true;
    }

    // 2. OpenRouter e convenção explícita de sufixo :free
    if (idLower.endsWith(':free') || idLower.includes('/free') || idLower.includes('-free')) {
      return true;
    }

    // 3. Verificação de pricing retornado na API (ex: OpenRouter /v1/models expõe pricing)
    if (rawModel?.pricing) {
      const promptCost = Number(rawModel.pricing.prompt ?? 0);
      const completionCost = Number(rawModel.pricing.completion ?? 0);
      if (promptCost === 0 && completionCost === 0) {
        return true;
      }
    }

    // 4. Modelos do Groq com tier padrão gratuito
    if (this.providerName === 'groq') {
      const groqFreeModels = [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'mixtral-8x7b-32768',
        'gemma2-9b-it',
        'deepseek-r1-distill-llama-70b',
      ];
      if (groqFreeModels.some((m) => idLower.includes(m))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Testa a conexão real com o provedor OpenAPI e busca os modelos disponíveis.
   * Não esconde erros com fallback para que o usuário saiba exatamente o status da chave/rede.
   */
  public async testConnectionAndFetchModels(signal?: AbortSignal): Promise<{
    success: boolean;
    models: ModelInfo[];
    error?: string;
  }> {
    const endpoint = this.baseUrl.endsWith('/v1')
      ? `${this.baseUrl}/models`
      : `${this.baseUrl}/models`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers,
        signal,
      });

      if (!response.ok) {
        let detail = `Status HTTP ${response.status} (${response.statusText})`;
        try {
          const body: any = await response.json();
          if (body?.error?.message) {
            detail = body.error.message;
          } else if (typeof body?.error === 'string') {
            detail = body.error;
          }
        } catch {
          // ignore json parse error
        }

        if (response.status === 401) {
          return {
            success: false,
            models: [],
            error: `Autenticação rejeitada (401 Unauthorized): ${detail}`,
          };
        }
        if (response.status === 403) {
          return {
            success: false,
            models: [],
            error: `Acesso proibido (403 Forbidden): ${detail}`,
          };
        }

        return {
          success: false,
          models: [],
          error: `Erro ao comunicar com ${endpoint}: ${detail}`,
        };
      }

      const json = (await response.json()) as RawModelsResponse;
      if (!json || !Array.isArray(json.data)) {
        return {
          success: false,
          models: [],
          error: 'Formato inesperado retornado pelo endpoint /models (campo "data" ausente).',
        };
      }

      const parsedModels: ModelInfo[] = json.data.map((raw) => {
        const isFree = this.isModelFree(raw.id, raw);
        let promptPrice: number | undefined;
        let completionPrice: number | undefined;

        if (raw.pricing) {
          promptPrice = Number(raw.pricing.prompt ?? 0);
          completionPrice = Number(raw.pricing.completion ?? 0);
        }

        return {
          id: raw.id,
          name: raw.name || raw.id,
          description: raw.description,
          isFree,
          contextLength: raw.context_length,
          pricing:
            promptPrice !== undefined && completionPrice !== undefined
              ? { prompt: promptPrice, completion: completionPrice }
              : undefined,
        };
      });

      parsedModels.sort((a, b) => {
        if (a.isFree && !b.isFree) return -1;
        if (!a.isFree && b.isFree) return 1;
        return a.id.localeCompare(b.id);
      });

      return {
        success: true,
        models: parsedModels,
      };
    } catch (err: unknown) {
      return {
        success: false,
        models: [],
        error: `Falha de conexão com ${endpoint}: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Busca modelos disponíveis via GET /models ou /v1/models.
   * Se a requisição falhar e strict for false, retorna lista pré-configurada de fallback.
   */
  public async fetchAvailableModels(signal?: AbortSignal, strict: boolean = false): Promise<ModelInfo[]> {
    const testResult = await this.testConnectionAndFetchModels(signal);
    if (testResult.success) {
      return testResult.models;
    }

    if (strict) {
      throw new Error(testResult.error || 'Falha ao buscar modelos');
    }

    return this.getFallbackModels();
  }

  /**
   * Modelos conhecidos caso a rede esteja indisponível ou o provedor não tenha /models
   */
  public getFallbackModels(): ModelInfo[] {
    if (this.providerName === 'openrouter') {
      return [
        {
          id: 'google/gemini-2.5-flash:free',
          name: 'Google Gemini 2.5 Flash (Gratuito)',
          description: 'Modelo rápido e multimodal de alta capacidade sem custo',
          isFree: true,
          contextLength: 1000000,
        },
        {
          id: 'meta-llama/llama-3.3-70b-instruct:free',
          name: 'Meta Llama 3.3 70B (Gratuito)',
          description: 'Excelente modelo open-source de 70B parâmetros',
          isFree: true,
          contextLength: 128000,
        },
        {
          id: 'deepseek/deepseek-r1:free',
          name: 'DeepSeek R1 (Gratuito)',
          description: 'Modelo de raciocínio profundo com extended thinking',
          isFree: true,
          contextLength: 64000,
        },
        {
          id: 'qwen/qwen-2.5-coder-32b-instruct:free',
          name: 'Qwen 2.5 Coder 32B (Gratuito)',
          description: 'Especialista em programação e geração de código',
          isFree: true,
          contextLength: 32000,
        },
        {
          id: 'anthropic/claude-3.7-sonnet',
          name: 'Claude 3.7 Sonnet',
          description: 'Estado da arte da Anthropic em raciocínio e engenharia de software',
          isFree: false,
          contextLength: 200000,
        },
      ];
    }

    if (this.providerName === 'ollama') {
      return [
        {
          id: 'qwen2.5-coder:7b',
          name: 'Qwen 2.5 Coder 7B (Local Ollama)',
          description: 'Executado 100% offline em sua máquina local',
          isFree: true,
          contextLength: 32000,
        },
        {
          id: 'llama3.1:8b',
          name: 'Llama 3.1 8B (Local Ollama)',
          description: 'Executado 100% offline em sua máquina local',
          isFree: true,
          contextLength: 128000,
        },
        {
          id: 'deepseek-r1:8b',
          name: 'DeepSeek R1 8B (Local Ollama)',
          description: 'Raciocínio local offline sem custos',
          isFree: true,
          contextLength: 32000,
        },
      ];
    }

    if (this.providerName === 'groq') {
      return [
        {
          id: 'llama-3.3-70b-versatile',
          name: 'Groq Llama 3.3 70B Versatile',
          description: 'Inferência ultra-rápida no hardware LPU Groq',
          isFree: true,
          contextLength: 128000,
        },
        {
          id: 'llama-3.1-8b-instant',
          name: 'Groq Llama 3.1 8B Instant',
          description: 'Respostas quase instantâneas com tier gratuito',
          isFree: true,
          contextLength: 128000,
        },
      ];
    }

    return [
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Modelo compacto e rápido da OpenAI',
        isFree: false,
      },
    ];
  }
}
