import fs from 'node:fs';
import path from 'node:path';
import { ToolDefinition } from './registry.js';

export function createFileTools(workingDir: string = process.cwd()): ToolDefinition[] {
  const resolveSafePath = (targetPath: string): string => {
    return path.isAbsolute(targetPath) ? targetPath : path.resolve(workingDir, targetPath);
  };

  const readFileTool: ToolDefinition = {
    name: 'read_file',
    description: 'Lê o conteúdo de um arquivo de texto com paginação de linhas opcional.',
    category: 'read',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho relativo ou absoluto do arquivo.',
        },
        startLine: {
          type: 'number',
          description: 'Linha inicial (1-indexada, inclusiva). Opcional.',
        },
        endLine: {
          type: 'number',
          description: 'Linha final (1-indexada, inclusiva). Opcional.',
        },
      },
      required: ['path'],
    },
    execute: async (args: { path: string; startLine?: number; endLine?: number }) => {
      const fullPath = resolveSafePath(args.path);
      if (!fs.existsSync(fullPath)) {
        return `Erro: Arquivo '${args.path}' não encontrado.`;
      }

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        return `Erro: '${args.path}' é um diretório, não um arquivo.`;
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split(/\r?\n/);
      const totalLines = lines.length;

      const start = Math.max(1, args.startLine ?? 1);
      const end = Math.min(totalLines, args.endLine ?? totalLines);

      if (start > totalLines) {
        return `Arquivo tem apenas ${totalLines} linhas (startLine ${start} além do final).`;
      }

      const slicedLines = lines.slice(start - 1, end);
      const numberedLines = slicedLines.map((l, i) => `${start + i}: ${l}`).join('\n');

      return `[Arquivo: ${args.path} (${start}-${end} de ${totalLines} linhas)]\n${numberedLines}`;
    },
  };

  const editFileTool: ToolDefinition = {
    name: 'edit_file',
    description:
      'Substitui cirurgicamente um bloco contínuo de código (targetContent) por novo conteúdo (replacementContent).',
    category: 'write',
    needsConfirmation: () => true,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho do arquivo a ser modificado.',
        },
        targetContent: {
          type: 'string',
          description: 'Texto exato a ser substituído (deve existir unicamente no arquivo).',
        },
        replacementContent: {
          type: 'string',
          description: 'Novo texto para substituir o bloco antigo.',
        },
      },
      required: ['path', 'targetContent', 'replacementContent'],
    },
    execute: async (args: { path: string; targetContent: string; replacementContent: string }) => {
      const fullPath = resolveSafePath(args.path);
      if (!fs.existsSync(fullPath)) {
        return `Erro: Arquivo '${args.path}' não encontrado para edição.`;
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const normalizedContent = content.replace(/\r\n/g, '\n');
      const normalizedTarget = args.targetContent.replace(/\r\n/g, '\n');
      const normalizedReplacement = args.replacementContent.replace(/\r\n/g, '\n');

      const occurrences = normalizedContent.split(normalizedTarget).length - 1;

      if (occurrences === 0) {
        return `Erro: 'targetContent' não foi encontrado no arquivo '${args.path}'. Verifique espaçamento e quebras de linha.`;
      }

      if (occurrences > 1) {
        return `Erro: 'targetContent' aparece ${occurrences} vezes no arquivo. Forneça mais linhas de contexto para tornar a substituição unívoca.`;
      }

      const updated = normalizedContent.replace(normalizedTarget, normalizedReplacement);
      fs.writeFileSync(fullPath, updated, 'utf-8');

      return `✔ Arquivo '${args.path}' editado com sucesso.`;
    },
  };

  const createFileTool: ToolDefinition = {
    name: 'create_file',
    description: 'Cria um novo arquivo no repositório com o conteúdo informado.',
    category: 'write',
    needsConfirmation: () => true,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho do novo arquivo.',
        },
        content: {
          type: 'string',
          description: 'Conteúdo a ser gravado no arquivo.',
        },
        overwrite: {
          type: 'boolean',
          description: 'Se true, sobrescreve caso o arquivo já exista.',
        },
      },
      required: ['path', 'content'],
    },
    execute: async (args: { path: string; content: string; overwrite?: boolean }) => {
      const fullPath = resolveSafePath(args.path);
      if (fs.existsSync(fullPath) && !args.overwrite) {
        return `Erro: Arquivo '${args.path}' já existe. Use overwrite: true para sobrescrever.`;
      }

      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, args.content, 'utf-8');
      return `✔ Arquivo '${args.path}' criado com sucesso (${Buffer.byteLength(args.content, 'utf-8')} bytes).`;
    },
  };

  const rewriteFileTool: ToolDefinition = {
    name: 'rewrite_file',
    description: 'Reescreve completamente um arquivo com novo conteúdo (sobrescreve todo o arquivo).',
    category: 'write',
    needsConfirmation: () => true,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho do arquivo a ser reescrito.',
        },
        content: {
          type: 'string',
          description: 'Novo conteúdo completo para o arquivo.',
        },
      },
      required: ['path', 'content'],
    },
    execute: async (args: { path: string; content: string }) => {
      const fullPath = resolveSafePath(args.path);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, args.content, 'utf-8');
      return `✔ Arquivo '${args.path}' reescrito com sucesso (${Buffer.byteLength(args.content, 'utf-8')} bytes).`;
    },
  };

  const deleteFileTool: ToolDefinition = {
    name: 'delete_file',
    description: 'Remove permanentemente um arquivo do sistema.',
    category: 'write',
    needsConfirmation: () => true,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho do arquivo a ser excluído.',
        },
      },
      required: ['path'],
    },
    execute: async (args: { path: string }) => {
      const fullPath = resolveSafePath(args.path);
      if (!fs.existsSync(fullPath)) {
        return `Erro: Arquivo '${args.path}' não encontrado para exclusão.`;
      }
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        return `Erro: '${args.path}' é um diretório. Use 'delete_directory' para remover pastas.`;
      }
      fs.unlinkSync(fullPath);
      return `✔ Arquivo '${args.path}' excluído com sucesso.`;
    },
  };

  const deleteDirectoryTool: ToolDefinition = {
    name: 'delete_directory',
    description: 'Remove permanentemente um diretório e seu conteúdo do sistema.',
    category: 'write',
    needsConfirmation: () => true,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho do diretório a ser excluído.',
        },
        recursive: {
          type: 'boolean',
          description: 'Se true, remove subpastas e arquivos recursivamente (padrão: true).',
        },
      },
      required: ['path'],
    },
    execute: async (args: { path: string; recursive?: boolean }) => {
      const fullPath = resolveSafePath(args.path);
      if (!fs.existsSync(fullPath)) {
        return `Erro: Diretório '${args.path}' não encontrado para exclusão.`;
      }
      const stat = fs.statSync(fullPath);
      if (!stat.isDirectory()) {
        return `Erro: '${args.path}' é um arquivo, não um diretório. Use 'delete_file'.`;
      }
      const isRecursive = args.recursive !== false;
      fs.rmSync(fullPath, { recursive: isRecursive, force: true });
      return `✔ Diretório '${args.path}' excluído com sucesso.`;
    },
  };

  const moveFileTool: ToolDefinition = {
    name: 'move_file',
    description: 'Move ou renomeia um arquivo ou pasta da origem (source) para o destino (destination).',
    category: 'write',
    needsConfirmation: () => true,
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Caminho de origem.',
        },
        destination: {
          type: 'string',
          description: 'Caminho de destino.',
        },
        overwrite: {
          type: 'boolean',
          description: 'Se true, sobrescreve caso o destino já exista.',
        },
      },
      required: ['source', 'destination'],
    },
    execute: async (args: { source: string; destination: string; overwrite?: boolean }) => {
      const srcPath = resolveSafePath(args.source);
      const destPath = resolveSafePath(args.destination);

      if (!fs.existsSync(srcPath)) {
        return `Erro: Origem '${args.source}' não encontrada.`;
      }
      if (fs.existsSync(destPath) && !args.overwrite) {
        return `Erro: Destino '${args.destination}' já existe. Use overwrite: true se desejar sobrescrever.`;
      }

      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.renameSync(srcPath, destPath);
      return `✔ '${args.source}' movido com sucesso para '${args.destination}'.`;
    },
  };

  const renameFileTool: ToolDefinition = {
    name: 'rename_file',
    description: 'Renomeia ou move um arquivo ou diretório de source para destination.',
    category: 'write',
    needsConfirmation: () => true,
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Caminho atual.',
        },
        destination: {
          type: 'string',
          description: 'Novo caminho / novo nome.',
        },
        overwrite: {
          type: 'boolean',
          description: 'Se true, substitui se o destino já existir.',
        },
      },
      required: ['source', 'destination'],
    },
    execute: async (args: { source: string; destination: string; overwrite?: boolean }) => {
      return moveFileTool.execute(args);
    },
  };

  const copyFileTool: ToolDefinition = {
    name: 'copy_file',
    description: 'Copia um arquivo ou diretório para o destino.',
    category: 'write',
    needsConfirmation: () => true,
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Caminho de origem.',
        },
        destination: {
          type: 'string',
          description: 'Caminho de destino.',
        },
        overwrite: {
          type: 'boolean',
          description: 'Se true, sobrescreve caso o arquivo ou diretório destino já exista.',
        },
      },
      required: ['source', 'destination'],
    },
    execute: async (args: { source: string; destination: string; overwrite?: boolean }) => {
      const srcPath = resolveSafePath(args.source);
      const destPath = resolveSafePath(args.destination);

      if (!fs.existsSync(srcPath)) {
        return `Erro: Origem '${args.source}' não encontrada.`;
      }
      if (fs.existsSync(destPath) && !args.overwrite) {
        return `Erro: Destino '${args.destination}' já existe. Use overwrite: true para sobrescrever.`;
      }

      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        fs.cpSync(srcPath, destPath, { recursive: true, force: !!args.overwrite });
        return `✔ Diretório '${args.source}' copiado recursivamente para '${args.destination}'.`;
      } else {
        fs.copyFileSync(srcPath, destPath);
        return `✔ Arquivo '${args.source}' copiado para '${args.destination}'.`;
      }
    },
  };

  const createDirectoryTool: ToolDefinition = {
    name: 'create_directory',
    description: 'Cria um novo diretório no sistema (cria pastas pai automaticamente se necessário).',
    category: 'write',
    needsConfirmation: () => true,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho do diretório a ser criado.',
        },
      },
      required: ['path'],
    },
    execute: async (args: { path: string }) => {
      const fullPath = resolveSafePath(args.path);
      if (fs.existsSync(fullPath)) {
        return `Aviso: Diretório '${args.path}' já existe.`;
      }
      fs.mkdirSync(fullPath, { recursive: true });
      return `✔ Diretório '${args.path}' criado com sucesso.`;
    },
  };

  const listDirectoryTool: ToolDefinition = {
    name: 'list_directory',
    description: 'Lista arquivos e subpastas de um diretório.',
    category: 'read',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho do diretório a listar (padrão: "." ou diretório atual).',
        },
        recursive: {
          type: 'boolean',
          description: 'Se true, lista recursivamente (padrão: false).',
        },
        maxDepth: {
          type: 'number',
          description: 'Profundidade máxima para busca recursiva (padrão: 2).',
        },
      },
    },
    execute: async (args: { path?: string; recursive?: boolean; maxDepth?: number }) => {
      const targetDir = resolveSafePath(args.path || '.');
      if (!fs.existsSync(targetDir)) {
        return `Erro: Diretório '${args.path || '.'}' não existe.`;
      }
      const stat = fs.statSync(targetDir);
      if (!stat.isDirectory()) {
        return `Erro: '${args.path || '.'}' é um arquivo, não um diretório.`;
      }

      const maxDepth = args.maxDepth ?? 2;
      const isRecursive = !!args.recursive;

      const results: string[] = [];
      const walk = (currentPath: string, currentDepth: number) => {
        if (isRecursive && currentDepth > maxDepth) return;
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === '.git' || entry.name === 'node_modules') continue;
          const entryRel = path.relative(targetDir, path.join(currentPath, entry.name));
          if (entry.isDirectory()) {
            results.push(`📁 ${entryRel}/`);
            if (isRecursive && currentDepth < maxDepth) {
              walk(path.join(currentPath, entry.name), currentDepth + 1);
            }
          } else {
            const fileStat = fs.statSync(path.join(currentPath, entry.name));
            results.push(`📄 ${entryRel} (${fileStat.size} bytes)`);
          }
        }
      };

      walk(targetDir, 1);
      if (results.length === 0) {
        return `Diretório '${args.path || '.'}' está vazio.`;
      }

      return `[Conteúdo de '${args.path || '.'}': ${results.length} itens]\n` + results.join('\n');
    },
  };

  return [
    readFileTool,
    editFileTool,
    createFileTool,
    rewriteFileTool,
    deleteFileTool,
    deleteDirectoryTool,
    moveFileTool,
    renameFileTool,
    copyFileTool,
    createDirectoryTool,
    listDirectoryTool,
  ];
}
