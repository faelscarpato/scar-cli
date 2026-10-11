import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CodebaseCrawler } from '../../src/context/codebase-crawler.js';

describe('CodebaseCrawler', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-crawler-test-'));
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'node_modules', 'dep'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'dist'), { recursive: true });

    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'console.log("hello");');
    fs.writeFileSync(path.join(tempDir, 'src', 'utils.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(tempDir, 'node_modules', 'dep', 'index.js'), 'ignored');
    fs.writeFileSync(path.join(tempDir, 'dist', 'index.js'), 'ignored');
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'temp.log\nsecret.key');
    fs.writeFileSync(path.join(tempDir, 'temp.log'), 'log content');
    fs.writeFileSync(path.join(tempDir, 'secret.key'), 'super-secret');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should list files while respecting default ignores and .gitignore', async () => {
    const crawler = new CodebaseCrawler({ rootDir: tempDir });
    const files = await crawler.listFiles();

    // Deve incluir arquivos válidos
    expect(files).toContain('src/index.ts');
    expect(files).toContain('src/utils.ts');

    // Não deve incluir node_modules, dist ou itens do .gitignore
    expect(files.some((f) => f.includes('node_modules'))).toBe(false);
    expect(files.some((f) => f.includes('dist/'))).toBe(false);
    expect(files.some((f) => f.includes('temp.log'))).toBe(false);
    expect(files.some((f) => f.includes('secret.key'))).toBe(false);
  });

  it('should generate a formatted structure summary', async () => {
    const crawler = new CodebaseCrawler({ rootDir: tempDir });
    const summary = await crawler.getStructureSummary();

    expect(summary).toContain('Estrutura do Repositório');
    expect(summary).toContain('src/index.ts');
  });
});
