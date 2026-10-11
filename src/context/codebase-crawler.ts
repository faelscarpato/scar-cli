import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import ignore, { type Ignore } from 'ignore';

export interface FileEntry {
  path: string;
  size: number;
  isDirectory: boolean;
}

export interface CrawlerOptions {
  rootDir?: string;
  maxFiles?: number;
  ignorePatterns?: string[];
}

export class CodebaseCrawler {
  private rootDir: string;
  private maxFiles: number;
  private defaultIgnores: string[] = [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '.next/**',
    '.turbo/**',
    'target/**',
    'vendor/**',
    '**/.DS_Store',
    '**/*.log',
  ];

  constructor(options: CrawlerOptions = {}) {
    this.rootDir = path.resolve(options.rootDir || process.cwd());
    this.maxFiles = options.maxFiles || 5000;
  }

  public getRootDir(): string {
    return this.rootDir;
  }

  private loadGitignore(): Ignore {
    const ig = ignore();
    ig.add(this.defaultIgnores);

    const gitignorePath = path.join(this.rootDir, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      try {
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        ig.add(content);
      } catch {
        // ignore read error
      }
    }

    return ig;
  }

  /**
   * Coleta a lista de arquivos relativos do repositório respeitando .gitignore.
   */
  public async listFiles(): Promise<string[]> {
    const ig = this.loadGitignore();

    const allEntries = await fg(['**/*'], {
      cwd: this.rootDir,
      dot: true,
      onlyFiles: true,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
    });

    const filtered = allEntries.filter((file) => {
      const normalized = file.replace(/\\/g, '/');
      return !ig.ignores(normalized);
    });

    return filtered.slice(0, this.maxFiles);
  }

  /**
   * Gera um resumo da estrutura do repositório para inclusão no contexto do LLM.
   */
  public async getStructureSummary(): Promise<string> {
    const files = await this.listFiles();
    if (files.length === 0) {
      return '(Nenhum arquivo encontrado no repositório)';
    }

    const preview = files.slice(0, 80);
    const lines = preview.map((f) => `  - ${f}`);
    if (files.length > 80) {
      lines.push(`  ... e mais ${files.length - 80} arquivos.`);
    }

    return `Estrutura do Repositório (${files.length} arquivos):\n${lines.join('\n')}`;
  }
}
