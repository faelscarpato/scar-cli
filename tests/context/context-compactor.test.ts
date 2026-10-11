import { describe, it, expect } from 'vitest';
import { compactHistory, shouldAutoCompact } from '../../src/context/context-compactor.js';
import { ChatMessage } from '../../src/provider/types.js';

describe('Context Compactor', () => {
  it('does not compact when history is short', () => {
    const msgs: ChatMessage[] = [
      { role: 'system', content: 'System instructions' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
    ];
    const res = compactHistory(msgs, { maxRecentMessages: 4 });
    expect(res.compactedCount).toBe(0);
    expect(res.compactedMessages.length).toBe(3);
  });

  it('compacts older messages while preserving system prompt and recent turns', () => {
    const msgs: ChatMessage[] = [
      { role: 'system', content: 'System prompt initial' },
      { role: 'user', content: 'Turn 1 user: Build a database schema' },
      { role: 'assistant', content: 'Turn 1 assistant: Creating users table...' },
      { role: 'tool', name: 'create_file', content: 'File created successfully' },
      { role: 'user', content: 'Turn 2 user: Add authentication' },
      { role: 'assistant', content: 'Turn 2 assistant: Adding JWT tokens...' },
      // Recent messages to keep:
      { role: 'user', content: 'Turn 3 user: Now create tests' },
      { role: 'assistant', content: 'Turn 3 assistant: Writing unit tests' },
    ];

    const res = compactHistory(msgs, { maxRecentMessages: 2 });
    expect(res.compactedCount).toBe(5); // 5 older messages compacted
    expect(res.compactedMessages[0].role).toBe('system');
    expect(res.compactedMessages[0].content).toBe('System prompt initial');

    // Second message is the compacted summary
    expect(res.compactedMessages[1].role).toBe('system');
    expect(res.compactedMessages[1].content).toContain('[HISTÓRICO COMPACTADO DA SESSÃO ANTERIOR]');
    expect(res.compactedMessages[1].content).toContain('Build a database schema');

    // Last 2 messages preserved intact
    expect(res.compactedMessages[2].content).toBe('Turn 3 user: Now create tests');
    expect(res.compactedMessages[3].content).toBe('Turn 3 assistant: Writing unit tests');
  });

  it('detects when auto compact threshold is exceeded', () => {
    expect(shouldAutoCompact(80_000, 100_000, 0.75)).toBe(true);
    expect(shouldAutoCompact(50_000, 100_000, 0.75)).toBe(false);
  });
});
