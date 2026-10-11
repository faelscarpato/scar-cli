import fs from 'node:fs';
import path from 'node:path';
import { ToolDefinition } from '../tools/registry.js';

export interface MemoryEntry {
  fact: string;
  updatedAt: string;
}

export interface AgentMemoryStore {
  version: number;
  facts: Record<string, MemoryEntry>;
}

/**
 * Gerenciador de memória de longo prazo contínua do agente (.agent-memory.json e MEMORY.md).
 * Armazena fatos aprendidos sobre o projeto, convenções do usuário, regras específicas e decisões arquiteturais.
 */
export class AgentMemoryManager {
  private memoryFilePath: string;

  constructor(workspaceDir: string = process.cwd()) {
    this.memoryFilePath = path.join(workspaceDir, '.agent-memory.json');
  }

  public getFilePath(): string {
    return this.memoryFilePath;
  }

  public loadMemory(): AgentMemoryStore {
    if (!fs.existsSync(this.memoryFilePath)) {
      return { version: 1, facts: {} };
    }
    try {
      const raw = fs.readFileSync(this.memoryFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        version: parsed.version || 1,
        facts: parsed.facts || {},
      };
    } catch {
      return { version: 1, facts: {} };
    }
  }

  public saveFact(key: string, fact: string): void {
    const memory = this.loadMemory();
    memory.facts[key] = {
      fact,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(this.memoryFilePath, JSON.stringify(memory, null, 2), 'utf-8');
  }

  public deleteFact(key: string): boolean {
    const memory = this.loadMemory();
    if (memory.facts[key]) {
      delete memory.facts[key];
      fs.writeFileSync(this.memoryFilePath, JSON.stringify(memory, null, 2), 'utf-8');
      return true;
    }
    return false;
  }

  public getFormattedContext(): string {
    const memory = this.loadMemory();
    const entries = Object.entries(memory.facts);
    if (entries.length === 0) {
      return '';
    }

    const lines = [
      '### Memória de Longo Prazo do Projeto (Fatos Aprendidos Anteriores):',
      ...entries.map(([k, v]) => `• [${k}]: ${v.fact}`),
    ];
    return lines.join('\n');
  }

  public createMemoryTools(): ToolDefinition[] {
    return [
      {
        name: 'save_memory',
        description: 'Grava uma preferência, fato arquitetural ou diretriz importante sobre o projeto na memória de longo prazo contínua.',
        category: 'write',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Identificador curto do fato ou preferência (ex: "prefer_typescript", "test_runner", "build_command").',
            },
            fact: {
              type: 'string',
              description: 'Descrição detalhada do fato ou convenção aprendida.',
            },
          },
          required: ['key', 'fact'],
        },
        execute: async (args: { key: string; fact: string }) => {
          this.saveFact(args.key, args.fact);
          return `✔ Fato salvo com sucesso na memória de longo prazo: [${args.key}] => "${args.fact}"`;
        },
      },
      {
        name: 'read_memory',
        description: 'Lê todos os fatos gravados na memória de longo prazo do agente para este projeto.',
        category: 'read',
        parameters: {
          type: 'object',
          properties: {},
        },
        execute: async () => {
          const formatted = this.getFormattedContext();
          return formatted || 'Nenhum fato gravado na memória de longo prazo até o momento.';
        },
      },
    ];
  }
}
