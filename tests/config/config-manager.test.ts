import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ConfigManager } from '../../src/config/config-manager.js';
import { AppConfigSchema } from '../../src/config/config-schema.js';

describe('ConfigManager', () => {
  let tempDir: string;
  let tempConfigPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cli-test-'));
    tempConfigPath = path.join(tempDir, 'config.json');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should load default configuration when file does not exist', () => {
    const manager = new ConfigManager(tempConfigPath);
    const config = manager.loadConfig();

    expect(config.currentProvider).toBe('openrouter');
    expect(config.currentModel).toBe('google/gemini-2.5-flash:free');
    expect(config.providers.length).toBeGreaterThan(0);
    expect(config.permissions.allowFileRead).toBe(true);
    expect(config.permissions.allowFileWrite).toBe(false);
  });

  it('should save and reload customized configuration', () => {
    const manager = new ConfigManager(tempConfigPath);
    const config = manager.loadConfig();

    config.currentModel = 'anthropic/claude-3.7-sonnet';
    config.theme = 'cyberpunk';
    manager.saveConfig(config);

    // Create a new instance to verify file persistence
    const reloadedManager = new ConfigManager(tempConfigPath);
    const reloaded = reloadedManager.loadConfig();

    expect(reloaded.currentModel).toBe('anthropic/claude-3.7-sonnet');
    expect(reloaded.theme).toBe('cyberpunk');
  });

  it('should correctly switch current provider and retrieve active provider', () => {
    const manager = new ConfigManager(tempConfigPath);
    manager.setCurrentProvider('ollama');

    const active = manager.getActiveProvider();
    expect(active.name).toBe('ollama');
    expect(active.baseUrl).toBe('http://localhost:11434/v1');
  });

  it('should throw an error when switching to a non-existent provider', () => {
    const manager = new ConfigManager(tempConfigPath);
    expect(() => manager.setCurrentProvider('non-existent-provider')).toThrow();
  });

  it('should update or add custom provider', () => {
    const manager = new ConfigManager(tempConfigPath);
    manager.addOrUpdateProvider({
      name: 'my-custom-llm',
      baseUrl: 'https://api.myllm.com/v1',
      apiKey: 'secret-token-123',
    });

    manager.setCurrentProvider('my-custom-llm');
    const active = manager.getActiveProvider();
    expect(active.name).toBe('my-custom-llm');
    expect(active.apiKey).toBe('secret-token-123');
  });

  it('should apply environment variable overrides', () => {
    const originalApiKey = process.env.AGENT_API_KEY;
    const originalModel = process.env.AGENT_MODEL;

    try {
      process.env.AGENT_API_KEY = 'env-secret-key-999';
      process.env.AGENT_MODEL = 'deepseek/deepseek-r1:free';

      const manager = new ConfigManager(tempConfigPath);
      const config = manager.loadConfig();

      expect(config.currentModel).toBe('deepseek/deepseek-r1:free');
      const active = manager.getActiveProvider();
      expect(active.apiKey).toBe('env-secret-key-999');
    } finally {
      process.env.AGENT_API_KEY = originalApiKey;
      process.env.AGENT_MODEL = originalModel;
    }
  });

  it('should validate invalid config gracefully', () => {
    fs.writeFileSync(tempConfigPath, '{ "invalid": "json", "currentProvider": 123 }');
    const manager = new ConfigManager(tempConfigPath);
    const config = manager.loadConfig();

    // Fallbacks to valid default config
    expect(config.currentProvider).toBe('openrouter');
  });
});
