import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AppConfig, AppConfigSchema, ProviderConfig } from './config-schema.js';

export class ConfigManager {
  private configPath: string;
  private cachedConfig: AppConfig | null = null;

  constructor(customPath?: string) {
    if (customPath) {
      this.configPath = customPath;
    } else {
      const configDir = this.getDefaultConfigDir();
      this.configPath = path.join(configDir, 'config.json');
    }
  }

  public getConfigPath(): string {
    return this.configPath;
  }

  private getDefaultConfigDir(): string {
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      return path.join(appData, 'agent-cli');
    }
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    return path.join(xdgConfig, 'agent-cli');
  }

  public loadConfig(): AppConfig {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    let rawData: unknown = {};

    if (fs.existsSync(this.configPath)) {
      try {
        const fileContent = fs.readFileSync(this.configPath, 'utf-8');
        rawData = JSON.parse(fileContent);
      } catch (err) {
        // Fall back to default on parse error
        rawData = {};
      }
    }

    const parsed = AppConfigSchema.safeParse(rawData);
    const config: AppConfig = parsed.success ? parsed.data : AppConfigSchema.parse({});

    // Apply environment variables overrides
    this.applyEnvOverrides(config);

    this.cachedConfig = config;
    return config;
  }

  private applyEnvOverrides(config: AppConfig): void {
    const envApiKey = process.env.AGENT_API_KEY || process.env.OPENAI_API_KEY;
    const envBaseUrl = process.env.AGENT_BASE_URL || process.env.OPENAI_BASE_URL;
    const envModel = process.env.AGENT_MODEL || process.env.OPENAI_MODEL;

    if (envModel) {
      config.currentModel = envModel;
    }

    if (envApiKey || envBaseUrl) {
      const active = config.providers.find((p) => p.name === config.currentProvider);
      if (active) {
        if (envApiKey) active.apiKey = envApiKey;
        if (envBaseUrl) active.baseUrl = envBaseUrl;
      }
    }
  }

  public saveConfig(config: AppConfig): void {
    const validated = AppConfigSchema.parse(config);
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(validated, null, 2), 'utf-8');
    this.cachedConfig = validated;
  }

  public getActiveProvider(): ProviderConfig {
    const config = this.loadConfig();
    const provider = config.providers.find((p) => p.name === config.currentProvider);
    if (!provider) {
      // Fallback to first provider or create default
      if (config.providers.length > 0) {
        return config.providers[0];
      }
      return {
        name: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: '',
        headers: {},
      };
    }
    return provider;
  }

  public setCurrentProvider(providerName: string): void {
    const config = this.loadConfig();
    const exists = config.providers.some((p) => p.name === providerName);
    if (!exists) {
      throw new Error(`Provedor '${providerName}' não foi encontrado na configuração.`);
    }
    config.currentProvider = providerName;
    this.saveConfig(config);
  }

  public setCurrentModel(modelId: string): void {
    const config = this.loadConfig();
    config.currentModel = modelId;
    this.saveConfig(config);
  }

  public setProviderApiKey(providerName: string, apiKey: string): void {
    const config = this.loadConfig();
    const provider = config.providers.find((p) => p.name === providerName);
    if (provider) {
      provider.apiKey = apiKey;
    } else {
      config.providers.push({
        name: providerName,
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey,
        headers: {},
      });
    }
    this.saveConfig(config);
  }

  public addOrUpdateProvider(provider: ProviderConfig): void {
    const config = this.loadConfig();
    const index = config.providers.findIndex((p) => p.name === provider.name);
    if (index >= 0) {
      config.providers[index] = provider;
    } else {
      config.providers.push(provider);
    }
    this.saveConfig(config);
  }

  public setPermissionsMode(mode: 'ask' | 'auto-safe' | 'always-allow'): void {
    const config = this.loadConfig();
    config.permissions.mode = mode;
    if (mode === 'always-allow') {
      config.permissions.allowFileRead = true;
      config.permissions.allowFileWrite = true;
      config.permissions.allowShellExecution = true;
    } else if (mode === 'auto-safe') {
      config.permissions.allowFileRead = true;
      config.permissions.allowFileWrite = false;
      config.permissions.allowShellExecution = false;
    } else if (mode === 'ask') {
      config.permissions.allowFileRead = true;
      config.permissions.allowFileWrite = false;
      config.permissions.allowShellExecution = false;
    }
    this.saveConfig(config);
  }

  public setActiveSkills(skills: string[]): void {
    const config = this.loadConfig();
    config.activeSkills = skills;
    this.saveConfig(config);
  }

  public toggleSkill(skillName: string): boolean {
    const config = this.loadConfig();
    const skills = new Set(config.activeSkills || []);
    let isActive = false;
    if (skills.has(skillName)) {
      skills.delete(skillName);
      isActive = false;
    } else {
      skills.add(skillName);
      isActive = true;
    }
    config.activeSkills = Array.from(skills);
    this.saveConfig(config);
    return isActive;
  }

  public resetToDefaults(): AppConfig {
    const defaultConfig = AppConfigSchema.parse({});
    this.saveConfig(defaultConfig);
    return defaultConfig;
  }
}

export const defaultConfigManager = new ConfigManager();
