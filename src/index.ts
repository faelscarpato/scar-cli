import { createCli } from './cli.js';

export async function main(argv: string[] = process.argv): Promise<void> {
  const cli = createCli();
  await cli.parseAsync(argv);
}

// Execução automática se chamado diretamente
if (
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('index.ts') ||
  process.argv[1]?.endsWith('index.js')
) {
  main().catch((err) => {
    console.error('Erro na execução do CLI:', err);
    process.exit(1);
  });
}
