import { ChatMessage } from '../provider/types.js';

export interface TokenStats {
  currentTokens: number;
  maxTokens: number;
  percentage: number;
  formattedCurrent: string;
  formattedMax: string;
  isNearLimit: boolean;
}

/**
 * Mapeia inteligentemente a janela de contexto máxima do modelo selecionado
 * com base na família, sufixos conhecidos ou tamanho reportado pela API.
 */
export function resolveContextWindow(modelId: string, reportedContextLength?: number): number {
  if (reportedContextLength && reportedContextLength > 0) {
    return reportedContextLength;
  }

  const id = (modelId || '').toLowerCase();

  // Gemini (1M ou 2M tokens)
  if (id.includes('gemini-1.5') || id.includes('gemini-2.0') || id.includes('gemini-exp')) {
    if (id.includes('2m')) return 2_000_000;
    return 1_000_000;
  }

  // Claude 3 / 3.5 (200k tokens)
  if (id.includes('claude-3') || id.includes('claude-sonnet') || id.includes('claude-opus') || id.includes('claude-haiku')) {
    return 200_000;
  }

  // OpenAI GPT-4o, GPT-4-turbo, o1, o3 (128k tokens)
  if (id.includes('gpt-4o') || id.includes('gpt-4-turbo') || id.includes('o1') || id.includes('o3') || id.includes('gpt-4.5')) {
    return 128_000;
  }

  // DeepSeek Chat / Coder / R1 (64k ou 128k tokens)
  if (id.includes('deepseek')) {
    if (id.includes('r1') || id.includes('v3')) return 128_000;
    return 64_000;
  }

  // Qwen 2.5 / Llama 3.1 / 3.2 / 3.3 (128k tokens)
  if (id.includes('llama-3.1') || id.includes('llama-3.2') || id.includes('llama-3.3') || id.includes('qwen-2.5')) {
    return 128_000;
  }

  // Mistral Large / Codestral
  if (id.includes('mistral-large') || id.includes('codestral')) {
    return 128_000;
  }

  // Padrões explícitos no nome do modelo (ex: 'model-128k', '32k', '8k')
  if (id.includes('2m')) return 2_000_000;
  if (id.includes('1m')) return 1_000_000;
  if (id.includes('200k')) return 200_000;
  if (id.includes('128k')) return 128_000;
  if (id.includes('64k')) return 64_000;
  if (id.includes('32k')) return 32_768;
  if (id.includes('16k')) return 16_384;
  if (id.includes('8k')) return 8_192;
  if (id.includes('4k')) return 4_096;

  // Fallback seguro padrão
  return 128_000;
}

/**
 * Estima a quantidade de tokens para um texto ou objeto utilizando algoritmo
 * proporcional à estrutura de BPE (média ~3.7 caracteres por token em texto/código).
 */
export function estimateTokens(input: string | ChatMessage | ChatMessage[] | unknown): number {
  if (typeof input === 'string') {
    if (input.length === 0) return 0;
    // BPE ratio: ~3.7 caracteres por token em média em inglês, pt-br e código
    const words = input.trim().split(/\s+/).length;
    const charEstimate = Math.ceil(input.length / 3.7);
    // Usa uma média ponderada entre contagem de palavras e caracteres para máxima precisão
    return Math.max(1, Math.round((charEstimate * 0.7) + (words * 1.3 * 0.3)));
  }

  if (Array.isArray(input)) {
    // Array de ChatMessage
    let total = 3; // overhead do primer
    for (const msg of input) {
      total += estimateMessageTokens(msg);
    }
    return total;
  }

  if (input && typeof input === 'object') {
    return estimateMessageTokens(input as ChatMessage);
  }

  return 0;
}

function estimateMessageTokens(msg: ChatMessage): number {
  let tokens = 4; // overhead de cabeçalho da mensagem (role, delim)
  if (msg.content) {
    tokens += estimateTokens(msg.content);
  }
  if (msg.name) {
    tokens += estimateTokens(msg.name);
  }
  if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) {
      tokens += 8; // overhead de tool call
      if (tc.function) {
        tokens += estimateTokens(tc.function.name);
        if (tc.function.arguments) {
          tokens += estimateTokens(tc.function.arguments);
        }
      }
    }
  }
  return tokens;
}

/**
 * Formata contagem de tokens para formato legível (ex: 2.1k, 128k, 1.0M)
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  return tokens.toString();
}

/**
 * Calcula estatísticas de uso de tokens do histórico atual em relação ao limite do modelo
 */
export function calculateTokenStats(
  messages: ChatMessage[],
  modelId: string,
  reportedContextLength?: number,
): TokenStats {
  const currentTokens = estimateTokens(messages);
  const maxTokens = resolveContextWindow(modelId, reportedContextLength);
  const percentage = Math.min(100, Number(((currentTokens / maxTokens) * 100).toFixed(1)));
  const isNearLimit = percentage >= 75.0;

  return {
    currentTokens,
    maxTokens,
    percentage,
    formattedCurrent: formatTokenCount(currentTokens),
    formattedMax: formatTokenCount(maxTokens),
    isNearLimit,
  };
}
