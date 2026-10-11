import { execa } from 'execa';
import { ToolDefinition } from './registry.js';

export function createGitTools(workingDir: string = process.cwd()): ToolDefinition[] {
  const gitCommitTool: ToolDefinition = {
    name: 'git_commit',
    description: 'Prepara (stage) arquivos e realiza commit com mensagem semântica Conventional Commits.',
    category: 'git',
    needsConfirmation: () => true,
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Mensagem do commit no formato Conventional Commits (ex: feat: adiciona X, fix: corrige Y).',
        },
        files: {
          type: 'array',
          description: 'Lista de caminhos de arquivos para adicionar ao stage. Se vazio, adiciona todos com `git add -A`.',
          items: { type: 'string' },
        },
      },
      required: ['message'],
    },
    execute: async (args: { message: string; files?: string[] }) => {
      try {
        if (args.files && args.files.length > 0) {
          await execa('git', ['add', ...args.files], { cwd: workingDir });
        } else {
          await execa('git', ['add', '-A'], { cwd: workingDir });
        }

        const { stdout } = await execa('git', ['commit', '-m', args.message], {
          cwd: workingDir,
        });

        return `✔ Commit realizado com sucesso:\n${stdout.trim()}`;
      } catch (err: unknown) {
        return `Erro ao realizar commit: ${(err as Error).message}`;
      }
    },
  };

  const gitDiffTool: ToolDefinition = {
    name: 'git_diff',
    description: 'Retorna as diferenças (diff) atuais da árvore de trabalho ou de arquivos preparados.',
    category: 'git',
    parameters: {
      type: 'object',
      properties: {
        staged: {
          type: 'boolean',
          description: 'Se true, exibe diff de arquivos preparados (--cached).',
        },
      },
    },
    execute: async (args: { staged?: boolean }) => {
      try {
        const gitArgs = args.staged ? ['diff', '--cached'] : ['diff'];
        const { stdout } = await execa('git', gitArgs, { cwd: workingDir });
        return stdout ? stdout : '(Nenhuma alteração identificada no diff)';
      } catch (err: unknown) {
        return `Erro ao ler git diff: ${(err as Error).message}`;
      }
    },
  };

  return [gitCommitTool, gitDiffTool];
}
