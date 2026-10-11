import crypto from 'node:crypto';
import path from 'node:path';

export interface CacheEntry {
  toolName: string;
  args: Record<string, any>;
  targetPath?: string;
  output: string;
  createdAt: number;
  expiresAt: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  itemsCount: number;
}

/**
 * Cache em memória para chamadas de ferramentas idempotentes (leituras de arquivos,
 * listas de diretórios, git status repetidos) para economizar tokens e latência.
 */
export class ToolCache {
  private cache = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private defaultTtlMs: number;

  constructor(defaultTtlMs = 60_000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  private hashKey(toolName: string, args: Record<string, any>): string {
    const sortedArgs = JSON.stringify(args, Object.keys(args || {}).sort());
    return `${toolName}:${crypto.createHash('sha256').update(sortedArgs).digest('hex')}`;
  }

  public isCacheable(toolName: string): boolean {
    const cacheableTools = ['read_file', 'list_directory', 'git_status', 'read_skill', 'read_memory'];
    return cacheableTools.includes(toolName);
  }

  public get(toolName: string, args: Record<string, any>): string | null {
    if (!this.isCacheable(toolName)) return null;

    const key = this.hashKey(toolName, args);
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.output;
  }

  public set(
    toolName: string,
    args: Record<string, any>,
    output: string,
    ttlMs: number = this.defaultTtlMs,
  ): void {
    if (!this.isCacheable(toolName)) return;

    const key = this.hashKey(toolName, args);
    const now = Date.now();
    const rawPath = args.path || args.targetPath || args.file;
    const targetPath = rawPath ? path.normalize(rawPath).toLowerCase() : undefined;

    this.cache.set(key, {
      toolName,
      args,
      targetPath,
      output,
      createdAt: now,
      expiresAt: now + ttlMs,
    });
  }

  /**
   * Invalida entradas de cache quando um arquivo for modificado ou removido
   */
  public invalidateForPath(targetPath: string): void {
    const normalized = path.normalize(targetPath).toLowerCase();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.toolName === 'list_directory') {
        this.cache.delete(key);
      } else if (
        entry.targetPath &&
        (entry.targetPath === normalized ||
          entry.targetPath.includes(normalized) ||
          normalized.includes(entry.targetPath))
      ) {
        this.cache.delete(key);
      }
    }
  }

  public invalidateAll(): void {
    this.cache.clear();
  }

  public getStats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      itemsCount: this.cache.size,
    };
  }
}
