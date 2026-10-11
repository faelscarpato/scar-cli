import { describe, it, expect, beforeEach } from 'vitest';
import { ToolCache } from '../../src/core/tool-cache.js';

describe('Tool Cache', () => {
  let cache: ToolCache;

  beforeEach(() => {
    cache = new ToolCache(5000);
  });

  it('caches idempotent tool calls and returns cached value', () => {
    expect(cache.isCacheable('read_file')).toBe(true);
    expect(cache.isCacheable('run_command')).toBe(false);

    cache.set('read_file', { path: 'src/index.ts' }, 'conteúdo do arquivo');
    const cached = cache.get('read_file', { path: 'src/index.ts' });

    expect(cached).toBe('conteúdo do arquivo');
    expect(cache.getStats().hits).toBe(1);
  });

  it('invalidates cache for mutated paths', () => {
    cache.set('read_file', { path: 'src/index.ts' }, 'conteúdo');
    cache.set('list_directory', { path: 'src' }, 'item1, item2');

    cache.invalidateForPath('src/index.ts');

    expect(cache.get('read_file', { path: 'src/index.ts' })).toBeNull();
    // Invalidação também limpa list_directory associado
    expect(cache.get('list_directory', { path: 'src' })).toBeNull();
  });
});
