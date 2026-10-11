import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { PluginManifest, PluginContext, SlashCommand } from './plugin-types.js';
import { ToolRegistry, ToolDefinition } from '../tools/registry.js';
import { AppConfig } from '../config/config-schema.js';

export class PluginLoader {
  private toolRegistry: ToolRegistry;
  private config: AppConfig;
  private workingDirectory: string;
  private slashCommands = new Map<string, SlashCommand>();
  private loadedPlugins = new Map<string, PluginManifest>();

  constructor(options: {
    toolRegistry: ToolRegistry;
    config: AppConfig;
    workingDirectory?: string;
  }) {
    this.toolRegistry = options.toolRegistry;
    this.config = options.config;
    this.workingDirectory = options.workingDirectory || process.cwd();
  }

  public getSlashCommands(): SlashCommand[] {
    return Array.from(this.slashCommands.values());
  }

  public getSlashCommand(name: string): SlashCommand | undefined {
    const cleanName = name.startsWith('/') ? name.slice(1) : name;
    return this.slashCommands.get(cleanName);
  }

  public registerSlashCommand(command: SlashCommand): void {
    const cleanName = command.name.startsWith('/') ? command.name.slice(1) : command.name;
    this.slashCommands.set(cleanName, {
      ...command,
      name: cleanName,
    });
  }

  public getLoadedPlugins(): PluginManifest[] {
    return Array.from(this.loadedPlugins.values());
  }

  public async loadPluginFromModule(manifest: PluginManifest): Promise<void> {
    const context: PluginContext = {
      workingDirectory: this.workingDirectory,
      config: this.config,
      registerTool: (tool: ToolDefinition) => this.toolRegistry.register(tool),
      registerSlashCommand: (cmd: SlashCommand) => this.registerSlashCommand(cmd),
      log: (msg: string) => console.log(`[Plugin:${manifest.name}] ${msg}`),
    };

    await manifest.activate(context);
    this.loadedPlugins.set(manifest.name, manifest);
  }

  public async installPlugin(sourcePath: string): Promise<{ success: boolean; message: string; manifest?: PluginManifest }> {
    try {
      const resolvedSource = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(this.workingDirectory, sourcePath);
      if (!fs.existsSync(resolvedSource)) {
        return { success: false, message: `Origem '${sourcePath}' não encontrada.` };
      }

      const pluginName = path.basename(resolvedSource);
      const targetDir = path.join(this.workingDirectory, '.cli', 'plugins', pluginName);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const stat = fs.statSync(resolvedSource);
      if (stat.isDirectory()) {
        fs.cpSync(resolvedSource, targetDir, { recursive: true });
      } else {
        fs.copyFileSync(resolvedSource, path.join(targetDir, path.basename(resolvedSource)));
      }

      // Tenta carregar o plugin recém-instalado
      await this.loadPluginFromDirectory(targetDir);
      const manifest = this.loadedPlugins.get(pluginName);

      return {
        success: true,
        message: `Plugin '${pluginName}' instalado com sucesso em '.cli/plugins/${pluginName}'.`,
        manifest,
      };
    } catch (err: unknown) {
      return {
        success: false,
        message: `Erro ao instalar plugin: ${(err as Error).message}`,
      };
    }
  }

  public async loadPluginFromDirectory(pluginDir: string): Promise<PluginManifest | null> {
    const dirName = path.basename(pluginDir);

    // 1. Procura por JS/MJS manifest convencional
    const candidateScriptPaths = [
      path.join(pluginDir, 'index.js'),
      path.join(pluginDir, 'index.mjs'),
      path.join(pluginDir, 'main.js'),
    ];

    for (const filePath of candidateScriptPaths) {
      if (fs.existsSync(filePath)) {
        try {
          const fileUrl = pathToFileURL(filePath).href;
          const module = await import(fileUrl);
          const manifest: PluginManifest = module.default || module;
          if (manifest && typeof manifest.activate === 'function') {
            await this.loadPluginFromModule(manifest);
            return manifest;
          }
        } catch (err) {
          console.warn(`Aviso: Falha ao carregar script de plugin ${filePath}: ${(err as Error).message}`);
        }
      }
    }

    // 2. Compatibilidade com Gemini CLI (gemini-extension.json / plugin.json)
    const geminiManifestPath = [
      path.join(pluginDir, 'gemini-extension.json'),
      path.join(pluginDir, 'gemini-plugin.json'),
      path.join(pluginDir, 'plugin.json'),
    ].find((p) => fs.existsSync(p));

    if (geminiManifestPath) {
      try {
        const rawJson = JSON.parse(fs.readFileSync(geminiManifestPath, 'utf-8'));
        const name = rawJson.name || dirName;
        const description = rawJson.description || 'Plugin compatível com Gemini CLI';
        const version = rawJson.version || '1.0.0';

        const manifest: PluginManifest = {
          name,
          version,
          description,
          activate: (ctx) => {
            // Registra comando de ajuda do plugin
            ctx.registerSlashCommand({
              name: `plugin:${name}`,
              description: `Comando do plugin ${name} (${description})`,
              handler: async () => `Plugin Gemini CLI '${name}' v${version} ativo.`,
            });
          },
        };

        await this.loadPluginFromModule(manifest);
        return manifest;
      } catch (err) {
        console.warn(`Aviso: Falha ao carregar manifest Gemini CLI de ${geminiManifestPath}: ${(err as Error).message}`);
      }
    }

    // 3. Compatibilidade com Claude Code / MCP (.mcp.json ou claude-plugin.json)
    const claudeManifestPath = [
      path.join(pluginDir, '.mcp.json'),
      path.join(pluginDir, 'claude-plugin.json'),
      path.join(pluginDir, 'mcp.json'),
    ].find((p) => fs.existsSync(p));

    if (claudeManifestPath) {
      try {
        const rawJson = JSON.parse(fs.readFileSync(claudeManifestPath, 'utf-8'));
        const name = rawJson.name || dirName;
        const description = rawJson.description || 'Plugin compatível com Claude Code / MCP';
        const version = rawJson.version || '1.0.0';

        const manifest: PluginManifest = {
          name,
          version,
          description,
          activate: (ctx) => {
            ctx.registerSlashCommand({
              name: `mcp:${name}`,
              description: `Servidor MCP ${name} (${description})`,
              handler: async () => `Servidor MCP Claude Code '${name}' registrado.`,
            });
          },
        };

        await this.loadPluginFromModule(manifest);
        return manifest;
      } catch (err) {
        console.warn(`Aviso: Falha ao carregar manifest Claude Code de ${claudeManifestPath}: ${(err as Error).message}`);
      }
    }

    return null;
  }

  public async discoverAndLoad(): Promise<PluginManifest[]> {
    const pluginDirs: string[] = [
      path.join(this.workingDirectory, '.cli', 'plugins'),
      path.join(this.workingDirectory, '.gemini', 'plugins'),
      path.join(this.workingDirectory, '.claude', 'plugins'),
    ];

    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      pluginDirs.push(path.join(appData, 'agent-cli', 'plugins'));
    } else {
      const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
      pluginDirs.push(path.join(xdg, 'agent-cli', 'plugins'));
    }

    for (const baseDir of pluginDirs) {
      if (!fs.existsSync(baseDir)) continue;

      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pluginDir = path.join(baseDir, entry.name);
        await this.loadPluginFromDirectory(pluginDir);
      }
    }

    return this.getLoadedPlugins();
  }
}
