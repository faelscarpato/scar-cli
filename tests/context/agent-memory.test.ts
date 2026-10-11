import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AgentMemoryManager } from '../../src/context/agent-memory.js';

describe('Agent Memory Manager', () => {
  let tempDir: string;
  let memoryManager: AgentMemoryManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-mem-test-'));
    memoryManager = new AgentMemoryManager(tempDir);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('saves and retrieves facts correctly', () => {
    memoryManager.saveFact('test_runner', 'O projeto utiliza vitest com typescript.');
    const store = memoryManager.loadMemory();
    expect(store.facts['test_runner']).toBeDefined();
    expect(store.facts['test_runner'].fact).toBe('O projeto utiliza vitest com typescript.');

    const context = memoryManager.getFormattedContext();
    expect(context).toContain('### Memória de Longo Prazo do Projeto');
    expect(context).toContain('[test_runner]: O projeto utiliza vitest com typescript.');
  });

  it('deletes facts properly', () => {
    memoryManager.saveFact('temp_fact', 'Dado temporário');
    expect(memoryManager.deleteFact('temp_fact')).toBe(true);
    expect(memoryManager.deleteFact('non_existent')).toBe(false);
  });

  it('provides executable agent tools', async () => {
    const tools = memoryManager.createMemoryTools();
    const saveTool = tools.find((t) => t.name === 'save_memory')!;
    const readTool = tools.find((t) => t.name === 'read_memory')!;

    await saveTool.execute({ key: 'framework', fact: 'React 18 com Ink' });
    const output = await readTool.execute({});

    expect(output).toContain('[framework]: React 18 com Ink');
  });
});
