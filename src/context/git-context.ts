import { execa } from 'execa';

export interface GitStatusSummary {
  isGitRepo: boolean;
  currentBranch?: string;
  modifiedFiles: string[];
  stagedFiles: string[];
  untrackedFiles: string[];
  cachedDiff?: string;
}

export class GitContext {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  public async isGitRepo(): Promise<boolean> {
    try {
      await execa('git', ['rev-parse', '--is-inside-work-tree'], { cwd: this.cwd });
      return true;
    } catch {
      return false;
    }
  }

  public async getCurrentBranch(): Promise<string | undefined> {
    try {
      const { stdout } = await execa('git', ['branch', '--show-current'], { cwd: this.cwd });
      return stdout.trim();
    } catch {
      return undefined;
    }
  }

  public async getStatusSummary(): Promise<GitStatusSummary> {
    const isRepo = await this.isGitRepo();
    if (!isRepo) {
      return {
        isGitRepo: false,
        modifiedFiles: [],
        stagedFiles: [],
        untrackedFiles: [],
      };
    }

    const branch = await this.getCurrentBranch();

    let statusOutput = '';
    try {
      const { stdout } = await execa('git', ['status', '--short'], { cwd: this.cwd });
      statusOutput = stdout.trim();
    } catch {
      // ignore
    }

    const modifiedFiles: string[] = [];
    const stagedFiles: string[] = [];
    const untrackedFiles: string[] = [];

    if (statusOutput) {
      const lines = statusOutput.split('\n');
      for (const line of lines) {
        if (!line) continue;
        const indexStatus = line[0];
        const worktreeStatus = line[1];
        const file = line.slice(3).trim();

        if (indexStatus === '?' && worktreeStatus === '?') {
          untrackedFiles.push(file);
        } else {
          if (indexStatus && indexStatus !== ' ') {
            stagedFiles.push(file);
          }
          if (worktreeStatus && worktreeStatus !== ' ') {
            modifiedFiles.push(file);
          }
        }
      }
    }

    let cachedDiff = '';
    try {
      const { stdout } = await execa('git', ['diff', '--cached', '--stat'], { cwd: this.cwd });
      cachedDiff = stdout.trim();
    } catch {
      // ignore
    }

    return {
      isGitRepo: true,
      currentBranch: branch,
      modifiedFiles,
      stagedFiles,
      untrackedFiles,
      cachedDiff: cachedDiff || undefined,
    };
  }

  public async getFormattedContext(): Promise<string> {
    const summary = await this.getStatusSummary();
    if (!summary.isGitRepo) {
      return 'Contexto Git: (Diretório não é um repositório Git)';
    }

    const parts: string[] = [
      `Contexto Git:`,
      `  - Branch atual: ${summary.currentBranch || 'detached/desconhecida'}`,
    ];

    if (summary.stagedFiles.length > 0) {
      parts.push(`  - Arquivos preparados (staged): ${summary.stagedFiles.join(', ')}`);
    }
    if (summary.modifiedFiles.length > 0) {
      parts.push(`  - Arquivos modificados (unstaged): ${summary.modifiedFiles.join(', ')}`);
    }
    if (summary.untrackedFiles.length > 0) {
      parts.push(`  - Arquivos não rastreados (untracked): ${summary.untrackedFiles.join(', ')}`);
    }
    if (
      summary.stagedFiles.length === 0 &&
      summary.modifiedFiles.length === 0 &&
      summary.untrackedFiles.length === 0
    ) {
      parts.push('  - Árvore de trabalho limpa (nenhuma alteração pendente).');
    }

    return parts.join('\n');
  }
}
