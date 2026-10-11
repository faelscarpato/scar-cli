import { ChatMessage } from '../provider/types.js';
import { estimateTokens } from './token-tracker.js';

export interface CompactionResult {
  compactedMessages: ChatMessage[];
  tokensBefore: number;
  tokensAfter: number;
  tokensSaved: number;
  compactedCount: number;
}

export interface CompactionOptions {
  maxRecentMessages?: number;
  threshold?: number;
}

/**
 * Compacta o histórico de mensagens mantendo as diretrizes do system prompt intactas,
 * resumindo turnos antigos intermediários e preservando as mensagens recentes.
 */
export function compactHistory(
  messages: ChatMessage[],
  options: CompactionOptions = {},
): CompactionResult {
  const maxRecent = options.maxRecentMessages ?? 4;
  const tokensBefore = estimateTokens(messages);

  // Se o histórico for muito curto (ex: só system prompt e poucos turnos), não compacta
  if (messages.length <= maxRecent + 1) {
    return {
      compactedMessages: [...messages],
      tokensBefore,
      tokensAfter: tokensBefore,
      tokensSaved: 0,
      compactedCount: 0,
    };
  }

  // Separa o system prompt (se existir no início)
  let systemPrompt: ChatMessage | null = null;
  let remaining = [...messages];
  if (remaining.length > 0 && remaining[0].role === 'system') {
    systemPrompt = remaining[0];
    remaining = remaining.slice(1);
  }

  // Separa as mensagens mais recentes para preservar contexto imediato
  const keepRecent = remaining.slice(-maxRecent);
  const toSummarize = remaining.slice(0, -maxRecent);

  if (toSummarize.length === 0) {
    return {
      compactedMessages: [...messages],
      tokensBefore,
      tokensAfter: tokensBefore,
      tokensSaved: 0,
      compactedCount: 0,
    };
  }

  // Cria resumo estruturado das mensagens antigas
  const summaryLines: string[] = [
    '✦ [HISTÓRICO COMPACTADO DA SESSÃO ANTERIOR]',
    `Foram resumidas ${toSummarize.length} mensagens anteriores para economia de contexto:`,
  ];

  for (const msg of toSummarize) {
    if (msg.role === 'user' && msg.content) {
      const preview = msg.content.length > 120 ? `${msg.content.slice(0, 117)}...` : msg.content;
      summaryLines.push(`• Usuário solicitou: "${preview.replace(/\n/g, ' ')}"`);
    } else if (msg.role === 'assistant' && msg.content) {
      const preview = msg.content.length > 150 ? `${msg.content.slice(0, 147)}...` : msg.content;
      summaryLines.push(`• Assistente respondeu: "${preview.replace(/\n/g, ' ')}"`);
    } else if (msg.role === 'tool' && msg.content) {
      const preview = msg.content.length > 100 ? `${msg.content.slice(0, 97)}...` : msg.content;
      summaryLines.push(`• Ferramenta [${msg.name || 'exec'}] retornou: "${preview.replace(/\n/g, ' ')}"`);
    }
  }

  const summaryMessage: ChatMessage = {
    role: 'system',
    content: summaryLines.join('\n'),
  };

  const compactedMessages: ChatMessage[] = [];
  if (systemPrompt) {
    compactedMessages.push(systemPrompt);
  }
  compactedMessages.push(summaryMessage);
  compactedMessages.push(...keepRecent);

  const tokensAfter = estimateTokens(compactedMessages);
  const tokensSaved = Math.max(0, tokensBefore - tokensAfter);

  return {
    compactedMessages,
    tokensBefore,
    tokensAfter,
    tokensSaved,
    compactedCount: toSummarize.length,
  };
}

/**
 * Verifica se o uso atual de tokens atingiu o limiar de compactação automática
 */
export function shouldAutoCompact(
  currentTokens: number,
  maxTokens: number,
  threshold = 0.75,
): boolean {
  if (maxTokens <= 0) return false;
  return currentTokens / maxTokens >= threshold;
}
