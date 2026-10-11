import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SessionManager } from '../../src/session/session-manager.js';

describe('Session Manager', () => {
  let tempDir: string;
  let sessionManager: SessionManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-sess-test-'));
    sessionManager = new SessionManager(tempDir);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates and saves a new session with messages', () => {
    const session = sessionManager.createSession({
      provider: 'openrouter',
      model: 'openai/gpt-4o',
      workingDirectory: tempDir,
    });

    expect(session.id).toBeDefined();
    expect(session.provider).toBe('openrouter');

    session.messages.push({ role: 'user', content: 'Primeira pergunta da sessão' });
    session.messages.push({ role: 'assistant', content: 'Resposta do assistente' });
    sessionManager.saveSession(session);

    const loaded = sessionManager.loadSession(session.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.messages.length).toBe(2);
    expect(loaded?.title).toBe('Primeira pergunta da sessão');
  });

  it('lists recorded sessions in descending updated order', () => {
    const s1 = sessionManager.createSession({ provider: 'p1', model: 'm1', workingDirectory: tempDir });
    const s2 = sessionManager.createSession({ provider: 'p2', model: 'm2', workingDirectory: tempDir });

    const list = sessionManager.listSessions();
    expect(list.length).toBe(2);
    expect(list[0].id).toBe(s2.id); // Mais recente
  });

  it('deletes sessions and finds latest session', () => {
    const s1 = sessionManager.createSession({ provider: 'p1', model: 'm1', workingDirectory: tempDir });
    expect(sessionManager.getLatestSession()?.id).toBe(s1.id);

    expect(sessionManager.deleteSession(s1.id)).toBe(true);
    expect(sessionManager.listSessions().length).toBe(0);
  });
});
