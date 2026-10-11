import { describe, it, expect } from 'vitest';
import {
  resolveContextWindow,
  estimateTokens,
  formatTokenCount,
  calculateTokenStats,
} from '../../src/context/token-tracker.js';
import { ChatMessage } from '../../src/provider/types.js';

describe('Token Tracker & Context Window Resolver', () => {
  it('resolves correct context window for known models', () => {
    expect(resolveContextWindow('google/gemini-1.5-pro')).toBe(1_000_000);
    expect(resolveContextWindow('anthropic/claude-3-5-sonnet-20241022')).toBe(200_000);
    expect(resolveContextWindow('openai/gpt-4o')).toBe(128_000);
    expect(resolveContextWindow('deepseek/deepseek-chat')).toBe(64_000);
    expect(resolveContextWindow('deepseek/deepseek-r1')).toBe(128_000);
    expect(resolveContextWindow('meta-llama/llama-3.3-70b-instruct')).toBe(128_000);
    expect(resolveContextWindow('custom-model-32k')).toBe(32_768);
    expect(resolveContextWindow('unknown-model')).toBe(128_000);
  });

  it('respects explicitly reported context length', () => {
    expect(resolveContextWindow('gpt-4o', 65536)).toBe(65536);
  });

  it('estimates tokens accurately for strings and messages', () => {
    const text = 'Hello world, this is a test for token estimation in Portuguese and code.';
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(10);
    expect(tokens).toBeLessThan(30);

    const msgs: ChatMessage[] = [
      { role: 'system', content: 'You are an AI assistant.' },
      { role: 'user', content: 'Can you help me write a function?' },
    ];
    const totalTokens = estimateTokens(msgs);
    expect(totalTokens).toBeGreaterThan(15);
  });

  it('formats token count cleanly', () => {
    expect(formatTokenCount(500)).toBe('500');
    expect(formatTokenCount(2500)).toBe('2.5k');
    expect(formatTokenCount(128000)).toBe('128.0k');
    expect(formatTokenCount(1000000)).toBe('1.0M');
  });

  it('calculates token stats correctly', () => {
    const msgs: ChatMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Hello' },
    ];
    const stats = calculateTokenStats(msgs, 'openai/gpt-4o');
    expect(stats.currentTokens).toBeGreaterThan(0);
    expect(stats.maxTokens).toBe(128_000);
    expect(stats.percentage).toBeLessThan(1);
    expect(stats.isNearLimit).toBe(false);
  });
});
