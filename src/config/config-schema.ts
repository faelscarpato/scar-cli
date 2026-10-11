import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  name: z.string().min(1, 'Provider name is required'),
  baseUrl: z.string().url('Base URL must be a valid URL'),
  apiKey: z.string().default(''),
  headers: z.record(z.string()).optional().default({}),
  description: z.string().optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const PermissionsConfigSchema = z.object({
  mode: z.enum(['ask', 'auto-safe', 'always-allow']).default('auto-safe'),
  allowFileRead: z.boolean().default(true),
  allowFileWrite: z.boolean().default(false), // requires confirmation by default
  allowShellExecution: z.boolean().default(false), // requires confirmation by default
  autoApprovedCommands: z.array(z.string()).default([]),
});

export type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;

export const AppConfigSchema = z.object({
  version: z.number().default(1),
  currentProvider: z.string().default('openrouter'),
  currentModel: z.string().default('google/gemini-2.5-flash:free'),
  theme: z.enum(['dark', 'light', 'dracula', 'cyberpunk']).default('dark'),
  providers: z.array(ProviderConfigSchema).default([
    {
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: '',
      description: 'OpenRouter (acesso a centenas de modelos incluindo :free)',
    },
    {
      name: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'ollama',
      description: 'Ollama local (modelos open-source locais e 100% gratuitos)',
    },
    {
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: '',
      description: 'Groq Cloud (inferência ultra-rápida com tier gratuito)',
    },
    {
      name: 'custom',
      baseUrl: 'http://localhost:8000/v1',
      apiKey: '',
      description: 'Provedor personalizado compatível com OpenAPI / OpenAI',
    },
  ]),
  permissions: PermissionsConfigSchema.default({
    mode: 'auto-safe',
    allowFileRead: true,
    allowFileWrite: false,
    allowShellExecution: false,
    autoApprovedCommands: [],
  }),
  activeSkills: z.array(z.string()).default([]),
  plugins: z.array(z.string()).default([]),
  maxToolIterations: z.number().default(15),
  systemPromptAddition: z.string().optional().default(''),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
