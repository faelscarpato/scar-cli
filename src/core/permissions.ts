import { PermissionsConfig } from '../config/config-schema.js';
import { ToolDefinition } from '../tools/registry.js';

export type ConfirmationDecision = 'yes' | 'no' | 'always';

export type ConfirmationPromptFn = (details: {
  toolName: string;
  category: ToolDefinition['category'];
  args: any;
}) => Promise<ConfirmationDecision>;

export class SecurityGuard {
  private config: PermissionsConfig;
  private alwaysApprovedCategories = new Set<string>();
  private alwaysApprovedTools = new Set<string>();
  private confirmHandler?: ConfirmationPromptFn;

  constructor(config: PermissionsConfig, confirmHandler?: ConfirmationPromptFn) {
    this.config = config;
    this.confirmHandler = confirmHandler;
  }

  public setConfirmHandler(handler: ConfirmationPromptFn): void {
    this.confirmHandler = handler;
  }

  public getMode(): 'ask' | 'auto-safe' | 'always-allow' {
    return this.config.mode || 'auto-safe';
  }

  public setMode(mode: 'ask' | 'auto-safe' | 'always-allow'): void {
    this.config.mode = mode;
  }

  public async authorize(tool: ToolDefinition, args: any): Promise<{ allowed: boolean; reason?: string }> {
    const mode = this.getMode();

    // 0. Modo 'always-allow' aprova imediatamente qualquer ferramenta
    if (mode === 'always-allow') {
      return { allowed: true };
    }

    // 1. Ferramentas de leitura permitidas por padrão
    if (tool.category === 'read') {
      if (this.config.allowFileRead) {
        return { allowed: true };
      }
    }

    // 2. Se já foi aprovada permanentemente para a sessão
    if (this.alwaysApprovedTools.has(tool.name) || this.alwaysApprovedCategories.has(tool.category)) {
      return { allowed: true };
    }

    // 3. No modo 'auto-safe', checa se a ferramenta é segura sem confirmação
    if (mode === 'auto-safe') {
      if (tool.needsConfirmation && !tool.needsConfirmation(args)) {
        return { allowed: true };
      }
      if (tool.category === 'write' && this.config.allowFileWrite) {
        return { allowed: true };
      }
      if (tool.category === 'execute' && this.config.allowShellExecution) {
        return { allowed: true };
      }
    }

    // No modo 'ask', mesmo ferramentas que teriam bypass passam pela confirmação obrigatória se alteram estado/executam.

    // 5. Se há um handler interativo (TUI ou CLI)
    if (this.confirmHandler) {
      const decision = await this.confirmHandler({
        toolName: tool.name,
        category: tool.category,
        args,
      });

      if (decision === 'yes') {
        return { allowed: true };
      }
      if (decision === 'always') {
        this.alwaysApprovedTools.add(tool.name);
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: `Ação cancelada pelo usuário para a ferramenta '${tool.name}'.`,
      };
    }

    // Se não há interatividade configurada e a ação é sensível, bloqueia com aviso
    return {
      allowed: false,
      reason: `Execução da ferramenta '${tool.name}' requer autorização prévia.`,
    };
  }
}
