import { execa } from 'execa';
import { ToolDefinition } from './registry.js';

export interface ShellToolsOptions {
  workingDir?: string;
  defaultTimeoutMs?: number;
}

export function createShellTools(options: ShellToolsOptions = {}): ToolDefinition[] {
  const workingDir = options.workingDir || process.cwd();
  const defaultTimeoutMs = options.defaultTimeoutMs || 30000;

  const runCommandTool: ToolDefinition = {
    name: 'run_command',
    description: 'Executa um comando de shell no terminal (ex: testes, linters, git, build).',
    category: 'execute',
    needsConfirmation: (args: { command: string }) => {
      // Comandos somente-leitura como git status, git log, ls, dir não precisam confirmação
      const cmd = (args?.command || '').trim().toLowerCase();
      const safePrefixes = ['git status', 'git log', 'git diff', 'dir', 'ls', 'echo', 'cat', 'node -v', 'pnpm -v'];
      return !safePrefixes.some((p) => cmd.startsWith(p));
    },
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'A linha de comando completa a ser executada.',
        },
        timeoutMs: {
          type: 'number',
          description: 'Timeout em milissegundos (padrão: 30000ms).',
        },
      },
      required: ['command'],
    },
    execute: async (args: { command: string; timeoutMs?: number }) => {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'powershell.exe' : '/bin/bash';
      const timeout = args.timeoutMs || defaultTimeoutMs;

      try {
        const subprocess = execa(args.command, {
          cwd: workingDir,
          shell: true,
          timeout,
          reject: false,
          all: true,
        });

        const result = await subprocess;
        const exitCode = result.exitCode ?? 0;
        const output = result.all || result.stdout || result.stderr || '(Sem saída)';

        // Trunca saída se for gigantesca (acima de 8000 caracteres)
        const truncated =
          output.length > 8000
            ? output.slice(0, 4000) + '\n\n... [saída truncada] ...\n\n' + output.slice(-4000)
            : output;

        return `[Código de saída: ${exitCode}]\n${truncated}`;
      } catch (err: unknown) {
        return `Erro ao executar comando: ${(err as Error).message}`;
      }
    },
  };

  return [runCommandTool];
}
