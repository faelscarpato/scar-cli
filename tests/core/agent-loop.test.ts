import { describe, it, expect, vi } from 'vitest';
import { AgentLoop } from '../../src/core/agent-loop.js';
import { OpenApiClient } from '../../src/provider/openapi-client.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { SecurityGuard } from '../../src/core/permissions.js';

describe('AgentLoop', () => {
  it('should run a single turn when no tool calls are returned', async () => {
    const client = new OpenApiClient({ baseUrl: 'https://test.ai/v1' });
    vi.spyOn(client, 'streamChat').mockResolvedValueOnce({
      id: 'res-1',
      content: 'Aqui está sua resposta.',
      finishReason: 'stop',
    });

    const tools = new ToolRegistry();
    const security = new SecurityGuard({
      allowFileRead: true,
      allowFileWrite: false,
      allowShellExecution: false,
      autoApprovedCommands: [],
    });

    const loop = new AgentLoop({
      client,
      model: 'google/gemini-2.5-flash:free',
      tools,
      securityGuard: security,
      systemPrompt: 'System instruction',
    });

    const tokens: string[] = [];
    const result = await loop.runTurn('Olá', {
      onToken: (t) => tokens.push(t),
    });

    expect(result).toBe('Aqui está sua resposta.');
    const msgs = loop.getMessages();
    expect(msgs.length).toBe(3); // system, user, assistant
    expect(msgs[1].content).toBe('Olá');
    expect(msgs[2].content).toBe('Aqui está sua resposta.');
  });

  it('should execute tool calls and continue turn loop', async () => {
    const client = new OpenApiClient({ baseUrl: 'https://test.ai/v1' });

    // Turno 1: LLM pede para ler arquivo
    vi.spyOn(client, 'streamChat')
      .mockResolvedValueOnce({
        id: 'res-1',
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'dummy_tool',
              arguments: '{"param":"hello"}',
            },
          },
        ],
        finishReason: 'tool_calls',
      })
      // Turno 2: LLM conclui com a resposta final
      .mockResolvedValueOnce({
        id: 'res-2',
        content: 'O resultado foi processado com sucesso.',
        finishReason: 'stop',
      });

    const tools = new ToolRegistry();
    tools.register({
      name: 'dummy_tool',
      description: 'dummy',
      category: 'read',
      parameters: { type: 'object', properties: {} },
      execute: async (args: any) => `Executado com ${args.param}`,
    });

    const security = new SecurityGuard({
      allowFileRead: true,
      allowFileWrite: false,
      allowShellExecution: false,
      autoApprovedCommands: [],
    });

    const loop = new AgentLoop({
      client,
      model: 'google/gemini-2.5-flash:free',
      tools,
      securityGuard: security,
      systemPrompt: 'System instruction',
    });

    const toolEvents: string[] = [];
    const result = await loop.runTurn('faça a chamada', {
      onToolCallStart: (tc) => toolEvents.push(`start:${tc.name}`),
      onToolCallResult: (res) => toolEvents.push(`result:${res.output}`),
    });

    expect(result).toBe('O resultado foi processado com sucesso.');
    expect(toolEvents).toContain('start:dummy_tool');
    expect(toolEvents).toContain('result:Executado com hello');

    const msgs = loop.getMessages();
    // System, User, Assistant(tool_call), Tool(result), Assistant(final)
    expect(msgs.length).toBe(5);
    expect(msgs[3].role).toBe('tool');
    expect(msgs[3].content).toBe('Executado com hello');
  });
});
