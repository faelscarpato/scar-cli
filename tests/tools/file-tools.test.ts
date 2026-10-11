import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createFileTools } from '../../src/tools/file-tools.js';
import { ToolRegistry } from '../../src/tools/registry.js';

describe('File Tools', () => {
  let tempDir: string;
  let registry: ToolRegistry;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-file-tools-test-'));
    registry = new ToolRegistry();
    const tools = createFileTools(tempDir);
    for (const t of tools) {
      registry.register(t);
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should create and read files with line numbers', async () => {
    const createRes = await registry.executeTool('create_file', {
      path: 'src/main.ts',
      content: 'line 1\nline 2\nline 3\nline 4\nline 5',
    });
    expect(createRes).toContain('criado com sucesso');

    const readRes = await registry.executeTool('read_file', {
      path: 'src/main.ts',
      startLine: 2,
      endLine: 4,
    });
    expect(readRes).toContain('2: line 2');
    expect(readRes).toContain('3: line 3');
    expect(readRes).toContain('4: line 4');
    expect(readRes).not.toContain('1: line 1');
    expect(readRes).not.toContain('5: line 5');
  });

  it('should edit file content surgically', async () => {
    await registry.executeTool('create_file', {
      path: 'config.json',
      content: '{\n  "version": 1,\n  "name": "old-name"\n}',
    });

    const editRes = await registry.executeTool('edit_file', {
      path: 'config.json',
      targetContent: '"name": "old-name"',
      replacementContent: '"name": "new-name"',
    });
    expect(editRes).toContain('editado com sucesso');

    const updated = fs.readFileSync(path.join(tempDir, 'config.json'), 'utf-8');
    expect(updated).toContain('"name": "new-name"');
  });

  it('should fail gracefully when target content is not found', async () => {
    await registry.executeTool('create_file', {
      path: 'notes.txt',
      content: 'hello world',
    });

    const editRes = await registry.executeTool('edit_file', {
      path: 'notes.txt',
      targetContent: 'missing text',
      replacementContent: 'replaced',
    });
    expect(editRes).toContain('não foi encontrado');
  });

  it('should fail when target content is ambiguous (multiple occurrences)', async () => {
    await registry.executeTool('create_file', {
      path: 'dup.txt',
      content: 'test item\nmiddle\ntest item',
    });

    const editRes = await registry.executeTool('edit_file', {
      path: 'dup.txt',
      targetContent: 'test item',
      replacementContent: 'new item',
    });
    expect(editRes).toContain('aparece 2 vezes');
  });

  it('should rewrite file completely', async () => {
    await registry.executeTool('create_file', {
      path: 'doc.txt',
      content: 'original text',
    });

    const rewriteRes = await registry.executeTool('rewrite_file', {
      path: 'doc.txt',
      content: 'completely rewritten text',
    });
    expect(rewriteRes).toContain('reescrito com sucesso');

    const updated = fs.readFileSync(path.join(tempDir, 'doc.txt'), 'utf-8');
    expect(updated).toBe('completely rewritten text');
  });

  it('should delete file and delete directory', async () => {
    await registry.executeTool('create_file', {
      path: 'temp-folder/sub/temp-file.txt',
      content: 'delete me',
    });
    expect(fs.existsSync(path.join(tempDir, 'temp-folder/sub/temp-file.txt'))).toBe(true);

    const delFileRes = await registry.executeTool('delete_file', {
      path: 'temp-folder/sub/temp-file.txt',
    });
    expect(delFileRes).toContain('excluído com sucesso');
    expect(fs.existsSync(path.join(tempDir, 'temp-folder/sub/temp-file.txt'))).toBe(false);

    const delDirRes = await registry.executeTool('delete_directory', {
      path: 'temp-folder',
    });
    expect(delDirRes).toContain('excluído com sucesso');
    expect(fs.existsSync(path.join(tempDir, 'temp-folder'))).toBe(false);
  });

  it('should move and rename file', async () => {
    await registry.executeTool('create_file', {
      path: 'source.txt',
      content: 'move content',
    });

    const moveRes = await registry.executeTool('move_file', {
      source: 'source.txt',
      destination: 'target/dest.txt',
    });
    expect(moveRes).toContain('movido com sucesso');
    expect(fs.existsSync(path.join(tempDir, 'source.txt'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'target/dest.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, 'target/dest.txt'), 'utf-8')).toBe('move content');
  });

  it('should copy file and list directory', async () => {
    await registry.executeTool('create_file', {
      path: 'file-to-copy.txt',
      content: 'copy content',
    });

    const copyRes = await registry.executeTool('copy_file', {
      source: 'file-to-copy.txt',
      destination: 'copied-file.txt',
    });
    expect(copyRes).toContain('copiado para');
    expect(fs.existsSync(path.join(tempDir, 'file-to-copy.txt'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'copied-file.txt'))).toBe(true);

    await registry.executeTool('create_directory', {
      path: 'nested-dir/inner',
    });
    expect(fs.existsSync(path.join(tempDir, 'nested-dir/inner'))).toBe(true);

    const listRes = await registry.executeTool('list_directory', {
      path: '.',
      recursive: true,
      maxDepth: 3,
    });
    expect(listRes).toContain('file-to-copy.txt');
    expect(listRes).toContain('copied-file.txt');
    expect(listRes).toContain('nested-dir');
  });
});
