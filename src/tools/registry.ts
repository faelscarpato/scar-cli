export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (args: any) => Promise<string>;
  category: 'read' | 'write' | 'execute' | 'git' | 'custom';
  needsConfirmation?: (args: any) => boolean;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  public register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  public get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Converte para o formato de tools OpenAPI/OpenAI compatível.
   */
  public toOpenAiTools(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: ToolDefinition['parameters'];
    };
  }> {
    return this.getAll().map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  public async executeTool(name: string, rawArgs: string | Record<string, any>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return `Erro: Ferramenta '${name}' não encontrada no registro.`;
    }

    let parsedArgs: any = rawArgs;
    if (typeof rawArgs === 'string') {
      try {
        parsedArgs = rawArgs ? JSON.parse(rawArgs) : {};
      } catch (err) {
        return `Erro de sintaxe JSON nos argumentos para a ferramenta '${name}': ${(err as Error).message}`;
      }
    }

    try {
      return await tool.execute(parsedArgs);
    } catch (err: unknown) {
      return `Erro ao executar a ferramenta '${name}': ${(err as Error).message}`;
    }
  }
}
