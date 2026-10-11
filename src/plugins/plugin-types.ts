import { ToolDefinition } from '../tools/registry.js';
import { AppConfig } from '../config/config-schema.js';

export interface SlashCommand {
  name: string;
  description: string;
  handler: (args: string, context: PluginContext) => Promise<string | void>;
}

export interface PluginContext {
  workingDirectory: string;
  config: AppConfig;
  registerTool: (tool: ToolDefinition) => void;
  registerSlashCommand: (command: SlashCommand) => void;
  log: (message: string) => void;
}

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  activate: (context: PluginContext) => Promise<void> | void;
}
