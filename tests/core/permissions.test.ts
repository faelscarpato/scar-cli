import { describe, it, expect } from 'vitest';
import { SecurityGuard } from '../../src/core/permissions.js';
import { ToolDefinition } from '../../src/tools/registry.js';

describe('SecurityGuard', () => {
  const dummyReadTool: ToolDefinition = {
    name: 'read_dummy',
    description: 'read test',
    category: 'read',
    parameters: { type: 'object', properties: {} },
    execute: async () => 'read',
  };

  const dummyWriteTool: ToolDefinition = {
    name: 'write_dummy',
    description: 'write test',
    category: 'write',
    parameters: { type: 'object', properties: {} },
    execute: async () => 'write',
    needsConfirmation: () => true,
  };

  const dummyShellTool: ToolDefinition = {
    name: 'run_command',
    description: 'shell test',
    category: 'execute',
    parameters: { type: 'object', properties: {} },
    execute: async () => 'exec',
    needsConfirmation: (args: { command: string }) => !args.command.startsWith('git status'),
  };

  it('should automatically allow read tools when allowFileRead is true', async () => {
    const guard = new SecurityGuard({
      allowFileRead: true,
      allowFileWrite: false,
      allowShellExecution: false,
      autoApprovedCommands: [],
    });

    const res = await guard.authorize(dummyReadTool, {});
    expect(res.allowed).toBe(true);
  });

  it('should auto-allow safe shell commands', async () => {
    const guard = new SecurityGuard({
      allowFileRead: true,
      allowFileWrite: false,
      allowShellExecution: false,
      autoApprovedCommands: [],
    });

    const res = await guard.authorize(dummyShellTool, { command: 'git status' });
    expect(res.allowed).toBe(true);
  });

  it('should prompt handler for write actions and respect user denial', async () => {
    const guard = new SecurityGuard(
      {
        allowFileRead: true,
        allowFileWrite: false,
        allowShellExecution: false,
        autoApprovedCommands: [],
      },
      async () => 'no',
    );

    const res = await guard.authorize(dummyWriteTool, {});
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('cancelada pelo usuário');
  });

  it('should remember "always" approval for subsequent calls', async () => {
    let callCount = 0;
    const guard = new SecurityGuard(
      {
        allowFileRead: true,
        allowFileWrite: false,
        allowShellExecution: false,
        autoApprovedCommands: [],
      },
      async () => {
        callCount++;
        return 'always';
      },
    );

    const first = await guard.authorize(dummyWriteTool, {});
    expect(first.allowed).toBe(true);
    expect(callCount).toBe(1);

    // Second call should not prompt again
    const second = await guard.authorize(dummyWriteTool, {});
    expect(second.allowed).toBe(true);
    expect(callCount).toBe(1);
  });

  it('should auto-allow all operations in always-allow mode', async () => {
    const guard = new SecurityGuard({
      mode: 'always-allow',
      allowFileRead: true,
      allowFileWrite: false,
      allowShellExecution: false,
      autoApprovedCommands: [],
    });

    const resWrite = await guard.authorize(dummyWriteTool, {});
    expect(resWrite.allowed).toBe(true);

    const resShell = await guard.authorize(dummyShellTool, { command: 'rm -rf dangerous' });
    expect(resShell.allowed).toBe(true);
  });

  it('should prompt for commands in ask mode even if usually safe', async () => {
    let prompted = false;
    const guard = new SecurityGuard(
      {
        mode: 'ask',
        allowFileRead: true,
        allowFileWrite: false,
        allowShellExecution: false,
        autoApprovedCommands: [],
      },
      async () => {
        prompted = true;
        return 'yes';
      },
    );

    const res = await guard.authorize(dummyShellTool, { command: 'git status' });
    expect(res.allowed).toBe(true);
    expect(prompted).toBe(true);
  });
});
