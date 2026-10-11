import { describe, it, expect, vi } from 'vitest';
import { SubagentManager } from '../../src/subagents/subagent-manager.js';
import { OpenApiClient } from '../../src/provider/openapi-client.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { SecurityGuard } from '../../src/core/permissions.js';

describe('Subagent Manager', () => {
  it('registers subagents and notifies listeners', async () => {
    const mockClient = {
      streamChat: vi.fn().mockResolvedValue({
        content: 'Relatório do subagente concluído.',
        toolCalls: undefined,
      }),
    } as unknown as OpenApiClient;

    const subManager = new SubagentManager({
      client: mockClient,
      model: 'test-model',
      tools: new ToolRegistry(),
      securityGuard: new SecurityGuard({
        mode: 'always-allow',
        allowFileRead: true,
        allowFileWrite: true,
        allowShellExecution: true,
        autoApprovedCommands: [],
      }),
    });

    const receivedLogs: string[] = [];
    subManager.subscribe((task) => {
      receivedLogs.push(task.status);
    });

    const task = subManager.spawnSubagent({
      name: 'Verificação rápida',
      prompt: 'Verifique se há arquivos de build',
    });

    expect(task.id).toBeDefined();
    expect(task.name).toBe('Verificação rápida');
    expect(subManager.getAllSubagents().length).toBe(1);
    expect(subManager.getSubagent(task.id)).toBeDefined();

    // Aguarda conclusão assíncrona do loop do subagente
    await new Promise((r) => setTimeout(r, 50));

    expect(task.status).toBe('completed');
    expect(task.result).toBe('Relatório do subagente concluído.');
  });

  it('provides subagent execution tools', () => {
    const subManager = new SubagentManager();
    const tools = subManager.createSubagentTools();

    expect(tools.some((t) => t.name === 'spawn_subagent')).toBe(true);
    expect(tools.some((t) => t.name === 'get_subagent_status')).toBe(true);
    expect(tools.some((t) => t.name === 'list_subagents')).toBe(true);
  });
});
