import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createCli } from '../src/cli.js';
import { defaultConfigManager } from '../src/config/config-manager.js';

describe('CLI Commands', () => {
  let tempDir: string;
  let tempConfigPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cli-test-'));
    tempConfigPath = path.join(tempDir, 'config.json');
    // Point defaultConfigManager to tempConfigPath
    (defaultConfigManager as any).configPath = tempConfigPath;
    (defaultConfigManager as any).cachedConfig = null;
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should initialize commander CLI program with options', () => {
    const cli = createCli();
    expect(cli.name()).toBe('agent');
    expect(cli.version()).toBe('0.1.0');

    const options = cli.options.map((o) => o.name());
    expect(options).toContain('provider');
    expect(options).toContain('model');
    expect(options).toContain('key');
    expect(options).toContain('models');
  });

  it('should handle config command options', async () => {
    const cli = createCli();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await cli.parseAsync(['node', 'agent', 'config', '--set-model', 'custom/llama-3:free']);
    const config = defaultConfigManager.loadConfig();
    expect(config.currentModel).toBe('custom/llama-3:free');

    await cli.parseAsync(['node', 'agent', 'config', '--set-provider', 'ollama']);
    const reloaded = defaultConfigManager.loadConfig();
    expect(reloaded.currentProvider).toBe('ollama');

    consoleSpy.mockRestore();
  });

  it('should list models for specified provider with -p flag', async () => {
    const cli = createCli();
    const logOutputs: string[] = [];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logOutputs.push(args.join(' '));
    });

    await cli.parseAsync(['node', 'agent', '--models', '-p', 'ollama']);

    const combined = logOutputs.join('\n');
    expect(combined).toContain("Buscando modelos disponíveis para o provedor 'ollama'");
    expect(combined).toContain('qwen2.5-coder:7b');

    consoleSpy.mockRestore();
  });

  it('should accept positional prompt arguments without throwing unknown command', async () => {
    const cli = createCli();
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    // Mock global fetch to return immediate answer for non-interactive prompt
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"choices":[{"index":0,"delta":{"content":"Resposta do teste"}}]}\n\ndata: [DONE]\n\n',
            ),
          );
          controller.close();
        },
      }),
    } as unknown as Response);

    await cli.parseAsync(['node', 'agent', 'explique', 'essa', 'funcao']);

    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('should update permissions mode via permissions command', async () => {
    const cli = createCli();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await cli.parseAsync(['node', 'agent', 'permissions', 'always-allow']);
    const config = defaultConfigManager.loadConfig();
    expect(config.permissions.mode).toBe('always-allow');
    expect(config.permissions.allowFileWrite).toBe(true);
    expect(config.permissions.allowShellExecution).toBe(true);

    await cli.parseAsync(['node', 'agent', 'permissions', 'auto-safe']);
    const reloaded = defaultConfigManager.loadConfig();
    expect(reloaded.permissions.mode).toBe('auto-safe');
    expect(reloaded.permissions.allowFileWrite).toBe(false);

    consoleSpy.mockRestore();
  });

  it('should list skills via skills command', async () => {
    const cli = createCli();
    const logOutputs: string[] = [];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logOutputs.push(args.join(' '));
    });

    await cli.parseAsync(['node', 'agent', 'skills']);
    const combined = logOutputs.join('\n');
    expect(combined).toContain('Skills Encontradas');

    consoleSpy.mockRestore();
  });

  it('should list plugins via plugins command', async () => {
    const cli = createCli();
    const logOutputs: string[] = [];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logOutputs.push(args.join(' '));
    });

    await cli.parseAsync(['node', 'agent', 'plugins']);
    const combined = logOutputs.join('\n');
    expect(combined).toContain('Plugins Carregados');

    consoleSpy.mockRestore();
  });
});
