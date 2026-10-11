import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import fg from 'fast-glob';
import { ToolDefinition } from '../tools/registry.js';
import { AppConfig } from '../config/config-schema.js';

export interface Skill {
  name: string;
  description: string;
  filePath: string;
  content: string;
  isActive: boolean;
}

export class SkillManager {
  private workspaceDir: string;
  private activeSkillNames: Set<string>;
  private includeGlobal: boolean;
  private skillsCache: Map<string, Skill> = new Map();

  constructor(options: {
    workspaceDir?: string;
    activeSkills?: string[];
    includeGlobal?: boolean;
  } = {}) {
    this.workspaceDir = options.workspaceDir || process.cwd();
    this.activeSkillNames = new Set(options.activeSkills || []);
    this.includeGlobal = options.includeGlobal ?? true;
  }

  public parseSkillFile(filePath: string): Skill | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf-8');

      let name = path.basename(path.dirname(filePath));
      let description = '';
      let body = raw;

      // Extrai YAML frontmatter se houver
      const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        body = frontmatterMatch[2];

        const nameMatch = frontmatter.match(/name:\s*([^\r\n]+)/);
        if (nameMatch) {
          name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');
        }

        const descMatch = frontmatter.match(/description:\s*([^\r\n]+)/);
        if (descMatch) {
          description = descMatch[1].trim().replace(/^['"]|['"]$/g, '');
        }
      } else {
        // Tenta pegar primeiro título Markdown como descrição ou nome
        const titleMatch = raw.match(/^#\s+(.+)$/m);
        if (titleMatch) {
          description = titleMatch[1].trim();
        }
      }

      if (!description) {
        description = `Instruções da skill '${name}'`;
      }

      return {
        name,
        description,
        filePath,
        content: body.trim(),
        isActive: this.activeSkillNames.has(name),
      };
    } catch {
      return null;
    }
  }

  public async discoverSkills(): Promise<Skill[]> {
    this.skillsCache.clear();
    const searchPatterns: string[] = [];

    // 1. Workspace local
    const localDir = this.workspaceDir.replace(/\\/g, '/');
    searchPatterns.push(
      `${localDir}/.skills/**/SKILL.md`,
      `${localDir}/skills/**/SKILL.md`,
      `${localDir}/.agent/skills/**/SKILL.md`,
    );

    // 2. Diretórios globais do usuário
    if (this.includeGlobal) {
      const homeDir = os.homedir().replace(/\\/g, '/');
      searchPatterns.push(
        `${homeDir}/.skills/**/SKILL.md`,
        `${homeDir}/.agent/skills/**/SKILL.md`,
        `${homeDir}/.gemini/config/plugins/**/skills/**/SKILL.md`,
      );

      if (process.platform === 'win32' && process.env.APPDATA) {
        const appData = process.env.APPDATA.replace(/\\/g, '/');
        searchPatterns.push(`${appData}/agent-cli/skills/**/SKILL.md`);
      }
    }

    try {
      const matches = await fg(searchPatterns, {
        onlyFiles: true,
        caseSensitiveMatch: false,
        suppressErrors: true,
        deep: 6,
      });

      for (const m of matches) {
        const skill = this.parseSkillFile(m);
        if (skill && !this.skillsCache.has(skill.name)) {
          this.skillsCache.set(skill.name, skill);
        }
      }
    } catch {
      // Ignora erro de busca glob
    }

    return Array.from(this.skillsCache.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  public getSkills(): Skill[] {
    return Array.from(this.skillsCache.values());
  }

  public getSkill(name: string): Skill | undefined {
    return this.skillsCache.get(name);
  }

  public isSkillActive(name: string): boolean {
    return this.activeSkillNames.has(name);
  }

  public toggleSkill(name: string): boolean {
    const isNowActive = !this.activeSkillNames.has(name);
    if (isNowActive) {
      this.activeSkillNames.add(name);
    } else {
      this.activeSkillNames.delete(name);
    }

    const skill = this.skillsCache.get(name);
    if (skill) {
      skill.isActive = isNowActive;
    }
    return isNowActive;
  }

  public getActiveSkills(): Skill[] {
    return Array.from(this.skillsCache.values()).filter((s) => this.activeSkillNames.has(s.name));
  }

  public getInjectedSkillsPrompt(): Array<{ name: string; description: string; content: string }> {
    return this.getActiveSkills().map((s) => ({
      name: s.name,
      description: s.description,
      content: s.content,
    }));
  }

  /**
   * Ferramentas para o LLM consultar e ler skills
   */
  public createSkillTools(): ToolDefinition[] {
    const listSkillsTool: ToolDefinition = {
      name: 'list_skills',
      description: 'Lista todas as skills disponíveis no ambiente do usuário (locais e globais).',
      category: 'read',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        const skills = await this.discoverSkills();
        if (skills.length === 0) {
          return 'Nenhuma skill encontrada nos diretórios locais ou globais (.skills/, .agent/skills/, etc.).';
        }

        const lines = skills.map((s) => {
          const status = s.isActive ? '[ATIVA]' : '[INATIVA]';
          return `• ${s.name} ${status} - ${s.description}`;
        });

        return `[Skills Disponíveis (${skills.length})]:\n` + lines.join('\n');
      },
    };

    const readSkillTool: ToolDefinition = {
      name: 'read_skill',
      description: 'Lê as instruções completas de uma skill específica.',
      category: 'read',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Nome da skill a ser lida.',
          },
        },
        required: ['name'],
      },
      execute: async (args: { name: string }) => {
        let skill = this.getSkill(args.name);
        if (!skill) {
          await this.discoverSkills();
          skill = this.getSkill(args.name);
        }

        if (!skill) {
          return `Erro: Skill '${args.name}' não foi encontrada. Use 'list_skills' para ver as disponíveis.`;
        }

        return `[Skill: ${skill.name}]\nDescrição: ${skill.description}\nOrigem: ${skill.filePath}\n\nInstruções:\n${skill.content}`;
      },
    };

    return [listSkillsTool, readSkillTool];
  }
}
