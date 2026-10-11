import { describe, it, expect } from 'vitest';
import { PluginLoader } from '../../src/plugins/plugin-loader.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { AppConfigSchema } from '../../src/config/config-schema.js';
import { PluginManifest } from '../../src/plugins/plugin-types.js';

describe('PluginLoader', () => {
  it('should load plugin programmatically and register slash commands and tools', async () => {
    const tools = new ToolRegistry();
    const config = AppConfigSchema.parse({});

    const loader = new PluginLoader({
      toolRegistry: tools,
      config,
    });

    const mockPlugin: PluginManifest = {
      name: 'hello-plugin',
      version: '1.0.0',
      description: 'Plugin de boas-vindas',
      activate: (context) => {
        context.registerSlashCommand({
          name: 'hello',
          description: 'Diz olá ao usuário',
          handler: async () => 'Olá do plugin!',
        });

        context.registerTool({
          name: 'plugin_calc',
          description: 'calcula soma',
          category: 'custom',
          parameters: { type: 'object', properties: {} },
          execute: async () => '42',
        });
      },
    };

    await loader.loadPluginFromModule(mockPlugin);

    expect(loader.getLoadedPlugins().length).toBe(1);
    expect(loader.getLoadedPlugins()[0].name).toBe('hello-plugin');

    const cmd = loader.getSlashCommand('/hello');
    expect(cmd).toBeDefined();
    expect(cmd?.description).toBe('Diz olá ao usuário');

    const tool = tools.get('plugin_calc');
    expect(tool).toBeDefined();
    const toolRes = await tools.executeTool('plugin_calc', {});
    expect(toolRes).toBe('42');
  });
});
