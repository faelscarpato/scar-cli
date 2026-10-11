export interface SystemPromptContext {
  workingDirectory: string;
  repoStructure?: string;
  gitContext?: string;
  customAddition?: string;
  activeSkills?: Array<{ name: string; description?: string; content: string }>;
  agentMemory?: string;
}

export function buildSystemPrompt(context: SystemPromptContext): string {
  const parts: string[] = [
    `Você é o **Antigravity CLI Agent**, um assistente de engenharia de software avançado que roda diretamente no terminal do desenvolvedor.`,
    `Seu objetivo é auxiliar o desenvolvedor analisando o repositório, lendo e manipulando código e arquivos, executando testes e comandos, e mantendo o fluxo de trabalho de forma assertiva e segura.`,
    ``,
    `### Diretrizes Operacionais:`,
    `1. **Língua:** Sempre responda em Português do Brasil com clareza técnica e concisão.`,
    `2. **Consciência de Sistema e Arquivos:** Você tem ferramentas reais para ler arquivos (\`read_file\`), editar cirurgicamente (\`edit_file\`), criar arquivos (\`create_file\`), reescrever arquivos (\`rewrite_file\`), apagar arquivos (\`delete_file\`), apagar diretórios (\`delete_directory\`), mover/renomear (\`move_file\`, \`rename_file\`), copiar (\`copy_file\`), criar diretórios (\`create_directory\`), listar diretórios (\`list_directory\`), inspecionar git (\`git_diff\`, \`git_commit\`) e rodar comandos de terminal (\`run_command\`).`,
    `3. **Ações Cirúrgicas:** Antes de editar ou modificar arquivos, leia-os primeiro quando necessário para entender o contexto.`,
    `4. **Segurança:** Nunca execute comandos ou exclusões destrutivas sem necessidade e seja transparente sobre o que cada ferramenta fará.`,
    `5. **Testes & Diagnóstico:** Ao investigar erros ou rodar testes, use \`run_command\` para validar e inspecione a saída do compilador ou runner antes de propor correções.`,
    ``,
    `### Ambiente Atual:`,
    `- Diretório de Trabalho: \`${context.workingDirectory}\``,
  ];

  if (context.gitContext) {
    parts.push(``, `### Informações do Git:`, context.gitContext);
  }

  if (context.repoStructure) {
    parts.push(``, `### Estrutura de Arquivos:`, context.repoStructure);
  }

  if (context.activeSkills && context.activeSkills.length > 0) {
    parts.push(``, `### Skills Ativas:`);
    for (const skill of context.activeSkills) {
      parts.push(
        `--- INÍCIO DA SKILL: ${skill.name} ---`,
        skill.description ? `Descrição: ${skill.description}\n` : '',
        skill.content,
        `--- FIM DA SKILL: ${skill.name} ---`,
      );
    }
  }

  if (context.agentMemory) {
    parts.push(``, context.agentMemory);
  }

  if (context.customAddition) {
    parts.push(``, `### Instruções Customizadas do Usuário:`, context.customAddition);
  }

  return parts.join('\n');
}
