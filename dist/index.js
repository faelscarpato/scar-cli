#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";
import { render } from "ink";
import React11 from "react";

// src/config/config-manager.ts
import fs from "fs";
import path from "path";
import os from "os";

// src/config/config-schema.ts
import { z } from "zod";
var ProviderConfigSchema = z.object({
  name: z.string().min(1, "Provider name is required"),
  baseUrl: z.string().url("Base URL must be a valid URL"),
  apiKey: z.string().default(""),
  headers: z.record(z.string()).optional().default({}),
  description: z.string().optional()
});
var PermissionsConfigSchema = z.object({
  mode: z.enum(["ask", "auto-safe", "always-allow"]).default("auto-safe"),
  allowFileRead: z.boolean().default(true),
  allowFileWrite: z.boolean().default(false),
  // requires confirmation by default
  allowShellExecution: z.boolean().default(false),
  // requires confirmation by default
  autoApprovedCommands: z.array(z.string()).default([])
});
var AppConfigSchema = z.object({
  version: z.number().default(1),
  currentProvider: z.string().default("openrouter"),
  currentModel: z.string().default("google/gemini-2.5-flash:free"),
  theme: z.enum(["dark", "light", "dracula", "cyberpunk"]).default("dark"),
  providers: z.array(ProviderConfigSchema).default([
    {
      name: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "",
      description: "OpenRouter (acesso a centenas de modelos incluindo :free)"
    },
    {
      name: "ollama",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "ollama",
      description: "Ollama local (modelos open-source locais e 100% gratuitos)"
    },
    {
      name: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "",
      description: "Groq Cloud (infer\xEAncia ultra-r\xE1pida com tier gratuito)"
    },
    {
      name: "custom",
      baseUrl: "http://localhost:8000/v1",
      apiKey: "",
      description: "Provedor personalizado compat\xEDvel com OpenAPI / OpenAI"
    }
  ]),
  permissions: PermissionsConfigSchema.default({
    mode: "auto-safe",
    allowFileRead: true,
    allowFileWrite: false,
    allowShellExecution: false,
    autoApprovedCommands: []
  }),
  activeSkills: z.array(z.string()).default([]),
  plugins: z.array(z.string()).default([]),
  maxToolIterations: z.number().default(15),
  systemPromptAddition: z.string().optional().default("")
});

// src/config/config-manager.ts
var ConfigManager = class {
  configPath;
  cachedConfig = null;
  constructor(customPath) {
    if (customPath) {
      this.configPath = customPath;
    } else {
      const configDir = this.getDefaultConfigDir();
      this.configPath = path.join(configDir, "config.json");
    }
  }
  getConfigPath() {
    return this.configPath;
  }
  getDefaultConfigDir() {
    if (process.platform === "win32") {
      const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
      return path.join(appData, "agent-cli");
    }
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
    return path.join(xdgConfig, "agent-cli");
  }
  loadConfig() {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }
    let rawData = {};
    if (fs.existsSync(this.configPath)) {
      try {
        const fileContent = fs.readFileSync(this.configPath, "utf-8");
        rawData = JSON.parse(fileContent);
      } catch (err) {
        rawData = {};
      }
    }
    const parsed = AppConfigSchema.safeParse(rawData);
    const config = parsed.success ? parsed.data : AppConfigSchema.parse({});
    this.applyEnvOverrides(config);
    this.cachedConfig = config;
    return config;
  }
  applyEnvOverrides(config) {
    const envApiKey = process.env.AGENT_API_KEY || process.env.OPENAI_API_KEY;
    const envBaseUrl = process.env.AGENT_BASE_URL || process.env.OPENAI_BASE_URL;
    const envModel = process.env.AGENT_MODEL || process.env.OPENAI_MODEL;
    if (envModel) {
      config.currentModel = envModel;
    }
    if (envApiKey || envBaseUrl) {
      const active = config.providers.find((p) => p.name === config.currentProvider);
      if (active) {
        if (envApiKey) active.apiKey = envApiKey;
        if (envBaseUrl) active.baseUrl = envBaseUrl;
      }
    }
  }
  saveConfig(config) {
    const validated = AppConfigSchema.parse(config);
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(validated, null, 2), "utf-8");
    this.cachedConfig = validated;
  }
  getActiveProvider() {
    const config = this.loadConfig();
    const provider = config.providers.find((p) => p.name === config.currentProvider);
    if (!provider) {
      if (config.providers.length > 0) {
        return config.providers[0];
      }
      return {
        name: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "",
        headers: {}
      };
    }
    return provider;
  }
  setCurrentProvider(providerName) {
    const config = this.loadConfig();
    const exists = config.providers.some((p) => p.name === providerName);
    if (!exists) {
      throw new Error(`Provedor '${providerName}' n\xE3o foi encontrado na configura\xE7\xE3o.`);
    }
    config.currentProvider = providerName;
    this.saveConfig(config);
  }
  setCurrentModel(modelId) {
    const config = this.loadConfig();
    config.currentModel = modelId;
    this.saveConfig(config);
  }
  setProviderApiKey(providerName, apiKey) {
    const config = this.loadConfig();
    const provider = config.providers.find((p) => p.name === providerName);
    if (provider) {
      provider.apiKey = apiKey;
    } else {
      config.providers.push({
        name: providerName,
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey,
        headers: {}
      });
    }
    this.saveConfig(config);
  }
  addOrUpdateProvider(provider) {
    const config = this.loadConfig();
    const index = config.providers.findIndex((p) => p.name === provider.name);
    if (index >= 0) {
      config.providers[index] = provider;
    } else {
      config.providers.push(provider);
    }
    this.saveConfig(config);
  }
  setPermissionsMode(mode) {
    const config = this.loadConfig();
    config.permissions.mode = mode;
    if (mode === "always-allow") {
      config.permissions.allowFileRead = true;
      config.permissions.allowFileWrite = true;
      config.permissions.allowShellExecution = true;
    } else if (mode === "auto-safe") {
      config.permissions.allowFileRead = true;
      config.permissions.allowFileWrite = false;
      config.permissions.allowShellExecution = false;
    } else if (mode === "ask") {
      config.permissions.allowFileRead = true;
      config.permissions.allowFileWrite = false;
      config.permissions.allowShellExecution = false;
    }
    this.saveConfig(config);
  }
  setActiveSkills(skills) {
    const config = this.loadConfig();
    config.activeSkills = skills;
    this.saveConfig(config);
  }
  toggleSkill(skillName) {
    const config = this.loadConfig();
    const skills = new Set(config.activeSkills || []);
    let isActive = false;
    if (skills.has(skillName)) {
      skills.delete(skillName);
      isActive = false;
    } else {
      skills.add(skillName);
      isActive = true;
    }
    config.activeSkills = Array.from(skills);
    this.saveConfig(config);
    return isActive;
  }
  resetToDefaults() {
    const defaultConfig = AppConfigSchema.parse({});
    this.saveConfig(defaultConfig);
    return defaultConfig;
  }
};
var defaultConfigManager = new ConfigManager();

// src/provider/model-catalog.ts
var ModelCatalog = class {
  baseUrl;
  apiKey;
  providerName;
  constructor(options) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey || "";
    this.providerName = options.providerName || "custom";
  }
  /**
   * Avalia se um modelo é gratuito com base em seu ID, provedor e metadados de preço.
   */
  isModelFree(modelId, rawModel) {
    const idLower = modelId.toLowerCase();
    if (this.providerName === "ollama" || this.baseUrl.includes("localhost") || this.baseUrl.includes("127.0.0.1")) {
      return true;
    }
    if (idLower.endsWith(":free") || idLower.includes("/free") || idLower.includes("-free")) {
      return true;
    }
    if (rawModel?.pricing) {
      const promptCost = Number(rawModel.pricing.prompt ?? 0);
      const completionCost = Number(rawModel.pricing.completion ?? 0);
      if (promptCost === 0 && completionCost === 0) {
        return true;
      }
    }
    if (this.providerName === "groq") {
      const groqFreeModels = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "mixtral-8x7b-32768",
        "gemma2-9b-it",
        "deepseek-r1-distill-llama-70b"
      ];
      if (groqFreeModels.some((m) => idLower.includes(m))) {
        return true;
      }
    }
    return false;
  }
  /**
   * Testa a conexão real com o provedor OpenAPI e busca os modelos disponíveis.
   * Não esconde erros com fallback para que o usuário saiba exatamente o status da chave/rede.
   */
  async testConnectionAndFetchModels(signal) {
    const endpoint = this.baseUrl.endsWith("/v1") ? `${this.baseUrl}/models` : `${this.baseUrl}/models`;
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers,
        signal
      });
      if (!response.ok) {
        let detail = `Status HTTP ${response.status} (${response.statusText})`;
        try {
          const body = await response.json();
          if (body?.error?.message) {
            detail = body.error.message;
          } else if (typeof body?.error === "string") {
            detail = body.error;
          }
        } catch {
        }
        if (response.status === 401) {
          return {
            success: false,
            models: [],
            error: `Autentica\xE7\xE3o rejeitada (401 Unauthorized): ${detail}`
          };
        }
        if (response.status === 403) {
          return {
            success: false,
            models: [],
            error: `Acesso proibido (403 Forbidden): ${detail}`
          };
        }
        return {
          success: false,
          models: [],
          error: `Erro ao comunicar com ${endpoint}: ${detail}`
        };
      }
      const json = await response.json();
      if (!json || !Array.isArray(json.data)) {
        return {
          success: false,
          models: [],
          error: 'Formato inesperado retornado pelo endpoint /models (campo "data" ausente).'
        };
      }
      const parsedModels = json.data.map((raw) => {
        const isFree = this.isModelFree(raw.id, raw);
        let promptPrice;
        let completionPrice;
        if (raw.pricing) {
          promptPrice = Number(raw.pricing.prompt ?? 0);
          completionPrice = Number(raw.pricing.completion ?? 0);
        }
        return {
          id: raw.id,
          name: raw.name || raw.id,
          description: raw.description,
          isFree,
          contextLength: raw.context_length,
          pricing: promptPrice !== void 0 && completionPrice !== void 0 ? { prompt: promptPrice, completion: completionPrice } : void 0
        };
      });
      parsedModels.sort((a, b) => {
        if (a.isFree && !b.isFree) return -1;
        if (!a.isFree && b.isFree) return 1;
        return a.id.localeCompare(b.id);
      });
      return {
        success: true,
        models: parsedModels
      };
    } catch (err) {
      return {
        success: false,
        models: [],
        error: `Falha de conex\xE3o com ${endpoint}: ${err.message}`
      };
    }
  }
  /**
   * Busca modelos disponíveis via GET /models ou /v1/models.
   * Se a requisição falhar e strict for false, retorna lista pré-configurada de fallback.
   */
  async fetchAvailableModels(signal, strict = false) {
    const testResult = await this.testConnectionAndFetchModels(signal);
    if (testResult.success) {
      return testResult.models;
    }
    if (strict) {
      throw new Error(testResult.error || "Falha ao buscar modelos");
    }
    return this.getFallbackModels();
  }
  /**
   * Modelos conhecidos caso a rede esteja indisponível ou o provedor não tenha /models
   */
  getFallbackModels() {
    if (this.providerName === "openrouter") {
      return [
        {
          id: "google/gemini-2.5-flash:free",
          name: "Google Gemini 2.5 Flash (Gratuito)",
          description: "Modelo r\xE1pido e multimodal de alta capacidade sem custo",
          isFree: true,
          contextLength: 1e6
        },
        {
          id: "meta-llama/llama-3.3-70b-instruct:free",
          name: "Meta Llama 3.3 70B (Gratuito)",
          description: "Excelente modelo open-source de 70B par\xE2metros",
          isFree: true,
          contextLength: 128e3
        },
        {
          id: "deepseek/deepseek-r1:free",
          name: "DeepSeek R1 (Gratuito)",
          description: "Modelo de racioc\xEDnio profundo com extended thinking",
          isFree: true,
          contextLength: 64e3
        },
        {
          id: "qwen/qwen-2.5-coder-32b-instruct:free",
          name: "Qwen 2.5 Coder 32B (Gratuito)",
          description: "Especialista em programa\xE7\xE3o e gera\xE7\xE3o de c\xF3digo",
          isFree: true,
          contextLength: 32e3
        },
        {
          id: "anthropic/claude-3.7-sonnet",
          name: "Claude 3.7 Sonnet",
          description: "Estado da arte da Anthropic em racioc\xEDnio e engenharia de software",
          isFree: false,
          contextLength: 2e5
        }
      ];
    }
    if (this.providerName === "ollama") {
      return [
        {
          id: "qwen2.5-coder:7b",
          name: "Qwen 2.5 Coder 7B (Local Ollama)",
          description: "Executado 100% offline em sua m\xE1quina local",
          isFree: true,
          contextLength: 32e3
        },
        {
          id: "llama3.1:8b",
          name: "Llama 3.1 8B (Local Ollama)",
          description: "Executado 100% offline em sua m\xE1quina local",
          isFree: true,
          contextLength: 128e3
        },
        {
          id: "deepseek-r1:8b",
          name: "DeepSeek R1 8B (Local Ollama)",
          description: "Racioc\xEDnio local offline sem custos",
          isFree: true,
          contextLength: 32e3
        }
      ];
    }
    if (this.providerName === "groq") {
      return [
        {
          id: "llama-3.3-70b-versatile",
          name: "Groq Llama 3.3 70B Versatile",
          description: "Infer\xEAncia ultra-r\xE1pida no hardware LPU Groq",
          isFree: true,
          contextLength: 128e3
        },
        {
          id: "llama-3.1-8b-instant",
          name: "Groq Llama 3.1 8B Instant",
          description: "Respostas quase instant\xE2neas com tier gratuito",
          isFree: true,
          contextLength: 128e3
        }
      ];
    }
    return [
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        description: "Modelo compacto e r\xE1pido da OpenAI",
        isFree: false
      }
    ];
  }
};

// src/provider/openapi-client.ts
import { createParser } from "eventsource-parser";
var OpenApiError = class extends Error {
  status;
  details;
  constructor(message, status, details) {
    super(message);
    this.name = "OpenApiError";
    this.status = status;
    this.details = details;
  }
};
var OpenApiClient = class {
  baseUrl;
  apiKey;
  customHeaders;
  constructor(options) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey || "";
    this.customHeaders = options.headers || {};
  }
  getBaseUrl() {
    return this.baseUrl;
  }
  getRequestHeaders() {
    const headers = {
      "Content-Type": "application/json",
      ...this.customHeaders
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }
  /**
   * Executa chamada com streaming SSE para /chat/completions.
   * Acumula texto e tool_calls progressivamente.
   */
  async streamChat(request, callbacks = {}) {
    const endpoint = `${this.baseUrl}/chat/completions`;
    const payload = {
      ...request,
      stream: true
    };
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: this.getRequestHeaders(),
        body: JSON.stringify(payload),
        signal: callbacks.signal
      });
    } catch (err) {
      if (err?.name === "AbortError") {
        throw err;
      }
      throw new OpenApiError(
        `Falha na conex\xE3o de rede com ${endpoint}: ${err.message}`,
        0
      );
    }
    if (!response.ok) {
      let errorBody = null;
      let errorMessage = `Erro HTTP ${response.status} ao chamar provedor OpenAPI (${response.statusText})`;
      try {
        errorBody = await response.json();
        const apiError = errorBody?.error;
        if (apiError && typeof apiError === "object") {
          errorMessage = apiError.message || errorMessage;
        } else if (typeof apiError === "string") {
          errorMessage = apiError;
        }
      } catch {
        try {
          const rawText = await response.text();
          if (rawText) errorMessage += `: ${rawText}`;
        } catch {
        }
      }
      if (response.status === 401) {
        errorMessage = `Chave de API inv\xE1lida ou ausente (401 Unauthorized): ${errorMessage}`;
      } else if (response.status === 429) {
        errorMessage = `Limite de requisi\xE7\xF5es excedido (429 Rate Limit): ${errorMessage}`;
      }
      throw new OpenApiError(errorMessage, response.status, errorBody);
    }
    if (!response.body) {
      throw new OpenApiError("Corpo da resposta vazio recebido do provedor", response.status);
    }
    let accumulatedContent = "";
    const toolCallsMap = /* @__PURE__ */ new Map();
    let finishReason = "stop";
    let responseId = "";
    let usage = void 0;
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    const parser = createParser({
      onEvent: (event) => {
        if (event.data === "[DONE]") {
          return;
        }
        try {
          const chunk = JSON.parse(event.data);
          if (chunk.id) responseId = chunk.id;
          if (chunk.usage) {
            usage = {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens
            };
          }
          const choice = chunk.choices?.[0];
          if (!choice) return;
          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }
          const delta = choice.delta;
          if (!delta) return;
          if (delta.content) {
            accumulatedContent += delta.content;
            if (callbacks.onToken) {
              callbacks.onToken(delta.content);
            }
          }
          if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              const existing = toolCallsMap.get(idx) || {
                id: tc.id || `call_${idx}`,
                name: "",
                arguments: ""
              };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name += tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;
              toolCallsMap.set(idx, existing);
            }
            if (callbacks.onToolCallDelta) {
              const currentToolCalls = Array.from(toolCallsMap.values()).map(
                (entry) => ({
                  id: entry.id,
                  type: "function",
                  function: {
                    name: entry.name,
                    arguments: entry.arguments
                  }
                })
              );
              callbacks.onToolCallDelta(currentToolCalls);
            }
          }
        } catch {
        }
      }
    });
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        parser.feed(text);
      }
      const remainder = decoder.decode();
      if (remainder) {
        parser.feed(remainder);
      }
      parser.reset({ consume: true });
    } catch (err) {
      if (err?.name === "AbortError") {
        throw err;
      }
      throw new OpenApiError(`Erro durante o stream de dados: ${err.message}`, 0);
    }
    const finalToolCalls = Array.from(toolCallsMap.entries()).sort(([idxA], [idxB]) => idxA - idxB).map(([_, entry]) => ({
      id: entry.id,
      type: "function",
      function: {
        name: entry.name,
        arguments: entry.arguments
      }
    }));
    if (finalToolCalls.length > 0 && finishReason === "stop") {
      finishReason = "tool_calls";
    }
    return {
      id: responseId,
      content: accumulatedContent,
      toolCalls: finalToolCalls.length > 0 ? finalToolCalls : void 0,
      finishReason,
      usage
    };
  }
  /**
   * Chamada síncrona sem streaming (caso necessário para modelos que não suportam SSE).
   */
  async createChatCompletion(request, signal) {
    const endpoint = `${this.baseUrl}/chat/completions`;
    const payload = {
      ...request,
      stream: false
    };
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: this.getRequestHeaders(),
        body: JSON.stringify(payload),
        signal
      });
    } catch (err) {
      if (err?.name === "AbortError") {
        throw err;
      }
      throw new OpenApiError(
        `Falha de conex\xE3o com ${endpoint}: ${err.message}`,
        0
      );
    }
    if (!response.ok) {
      let errorBody = null;
      let errorMessage = `Erro HTTP ${response.status} ao chamar provedor OpenAPI (${response.statusText})`;
      try {
        errorBody = await response.json();
        const apiError = errorBody?.error;
        if (apiError && typeof apiError === "object") {
          errorMessage = apiError.message || errorMessage;
        } else if (typeof apiError === "string") {
          errorMessage = apiError;
        }
      } catch {
        try {
          const rawText = await response.text();
          if (rawText) errorMessage += `: ${rawText}`;
        } catch {
        }
      }
      if (response.status === 401) {
        errorMessage = `Chave de API inv\xE1lida ou ausente (401 Unauthorized): ${errorMessage}`;
      } else if (response.status === 429) {
        errorMessage = `Limite de requisi\xE7\xF5es excedido (429 Rate Limit): ${errorMessage}`;
      }
      throw new OpenApiError(errorMessage, response.status, errorBody);
    }
    const data = await response.json();
    const choice = data.choices?.[0];
    const rawToolCalls = choice?.message?.tool_calls;
    const finishReason = choice?.finish_reason || (rawToolCalls?.length ? "tool_calls" : "stop");
    return {
      id: data.id || "",
      content: choice?.message?.content || "",
      toolCalls: rawToolCalls,
      finishReason,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : void 0
    };
  }
};

// src/tools/registry.ts
var ToolRegistry = class {
  tools = /* @__PURE__ */ new Map();
  register(tool) {
    this.tools.set(tool.name, tool);
  }
  get(name) {
    return this.tools.get(name);
  }
  getAll() {
    return Array.from(this.tools.values());
  }
  /**
   * Converte para o formato de tools OpenAPI/OpenAI compatível.
   */
  toOpenAiTools() {
    return this.getAll().map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));
  }
  async executeTool(name, rawArgs) {
    const tool = this.tools.get(name);
    if (!tool) {
      return `Erro: Ferramenta '${name}' n\xE3o encontrada no registro.`;
    }
    let parsedArgs = rawArgs;
    if (typeof rawArgs === "string") {
      try {
        parsedArgs = rawArgs ? JSON.parse(rawArgs) : {};
      } catch (err) {
        return `Erro de sintaxe JSON nos argumentos para a ferramenta '${name}': ${err.message}`;
      }
    }
    try {
      return await tool.execute(parsedArgs);
    } catch (err) {
      return `Erro ao executar a ferramenta '${name}': ${err.message}`;
    }
  }
};

// src/tools/file-tools.ts
import fs2 from "fs";
import path2 from "path";
function createFileTools(workingDir = process.cwd()) {
  const resolveSafePath = (targetPath) => {
    return path2.isAbsolute(targetPath) ? targetPath : path2.resolve(workingDir, targetPath);
  };
  const readFileTool = {
    name: "read_file",
    description: "L\xEA o conte\xFAdo de um arquivo de texto com pagina\xE7\xE3o de linhas opcional.",
    category: "read",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Caminho relativo ou absoluto do arquivo."
        },
        startLine: {
          type: "number",
          description: "Linha inicial (1-indexada, inclusiva). Opcional."
        },
        endLine: {
          type: "number",
          description: "Linha final (1-indexada, inclusiva). Opcional."
        }
      },
      required: ["path"]
    },
    execute: async (args) => {
      const fullPath = resolveSafePath(args.path);
      if (!fs2.existsSync(fullPath)) {
        return `Erro: Arquivo '${args.path}' n\xE3o encontrado.`;
      }
      const stat = fs2.statSync(fullPath);
      if (stat.isDirectory()) {
        return `Erro: '${args.path}' \xE9 um diret\xF3rio, n\xE3o um arquivo.`;
      }
      const content = fs2.readFileSync(fullPath, "utf-8");
      const lines = content.split(/\r?\n/);
      const totalLines = lines.length;
      const start = Math.max(1, args.startLine ?? 1);
      const end = Math.min(totalLines, args.endLine ?? totalLines);
      if (start > totalLines) {
        return `Arquivo tem apenas ${totalLines} linhas (startLine ${start} al\xE9m do final).`;
      }
      const slicedLines = lines.slice(start - 1, end);
      const numberedLines = slicedLines.map((l, i) => `${start + i}: ${l}`).join("\n");
      return `[Arquivo: ${args.path} (${start}-${end} de ${totalLines} linhas)]
${numberedLines}`;
    }
  };
  const editFileTool = {
    name: "edit_file",
    description: "Substitui cirurgicamente um bloco cont\xEDnuo de c\xF3digo (targetContent) por novo conte\xFAdo (replacementContent).",
    category: "write",
    needsConfirmation: () => true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Caminho do arquivo a ser modificado."
        },
        targetContent: {
          type: "string",
          description: "Texto exato a ser substitu\xEDdo (deve existir unicamente no arquivo)."
        },
        replacementContent: {
          type: "string",
          description: "Novo texto para substituir o bloco antigo."
        }
      },
      required: ["path", "targetContent", "replacementContent"]
    },
    execute: async (args) => {
      const fullPath = resolveSafePath(args.path);
      if (!fs2.existsSync(fullPath)) {
        return `Erro: Arquivo '${args.path}' n\xE3o encontrado para edi\xE7\xE3o.`;
      }
      const content = fs2.readFileSync(fullPath, "utf-8");
      const normalizedContent = content.replace(/\r\n/g, "\n");
      const normalizedTarget = args.targetContent.replace(/\r\n/g, "\n");
      const normalizedReplacement = args.replacementContent.replace(/\r\n/g, "\n");
      const occurrences = normalizedContent.split(normalizedTarget).length - 1;
      if (occurrences === 0) {
        return `Erro: 'targetContent' n\xE3o foi encontrado no arquivo '${args.path}'. Verifique espa\xE7amento e quebras de linha.`;
      }
      if (occurrences > 1) {
        return `Erro: 'targetContent' aparece ${occurrences} vezes no arquivo. Forne\xE7a mais linhas de contexto para tornar a substitui\xE7\xE3o un\xEDvoca.`;
      }
      const updated = normalizedContent.replace(normalizedTarget, normalizedReplacement);
      fs2.writeFileSync(fullPath, updated, "utf-8");
      return `\u2714 Arquivo '${args.path}' editado com sucesso.`;
    }
  };
  const createFileTool = {
    name: "create_file",
    description: "Cria um novo arquivo no reposit\xF3rio com o conte\xFAdo informado.",
    category: "write",
    needsConfirmation: () => true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Caminho do novo arquivo."
        },
        content: {
          type: "string",
          description: "Conte\xFAdo a ser gravado no arquivo."
        },
        overwrite: {
          type: "boolean",
          description: "Se true, sobrescreve caso o arquivo j\xE1 exista."
        }
      },
      required: ["path", "content"]
    },
    execute: async (args) => {
      const fullPath = resolveSafePath(args.path);
      if (fs2.existsSync(fullPath) && !args.overwrite) {
        return `Erro: Arquivo '${args.path}' j\xE1 existe. Use overwrite: true para sobrescrever.`;
      }
      const dir = path2.dirname(fullPath);
      if (!fs2.existsSync(dir)) {
        fs2.mkdirSync(dir, { recursive: true });
      }
      fs2.writeFileSync(fullPath, args.content, "utf-8");
      return `\u2714 Arquivo '${args.path}' criado com sucesso (${Buffer.byteLength(args.content, "utf-8")} bytes).`;
    }
  };
  const rewriteFileTool = {
    name: "rewrite_file",
    description: "Reescreve completamente um arquivo com novo conte\xFAdo (sobrescreve todo o arquivo).",
    category: "write",
    needsConfirmation: () => true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Caminho do arquivo a ser reescrito."
        },
        content: {
          type: "string",
          description: "Novo conte\xFAdo completo para o arquivo."
        }
      },
      required: ["path", "content"]
    },
    execute: async (args) => {
      const fullPath = resolveSafePath(args.path);
      const dir = path2.dirname(fullPath);
      if (!fs2.existsSync(dir)) {
        fs2.mkdirSync(dir, { recursive: true });
      }
      fs2.writeFileSync(fullPath, args.content, "utf-8");
      return `\u2714 Arquivo '${args.path}' reescrito com sucesso (${Buffer.byteLength(args.content, "utf-8")} bytes).`;
    }
  };
  const deleteFileTool = {
    name: "delete_file",
    description: "Remove permanentemente um arquivo do sistema.",
    category: "write",
    needsConfirmation: () => true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Caminho do arquivo a ser exclu\xEDdo."
        }
      },
      required: ["path"]
    },
    execute: async (args) => {
      const fullPath = resolveSafePath(args.path);
      if (!fs2.existsSync(fullPath)) {
        return `Erro: Arquivo '${args.path}' n\xE3o encontrado para exclus\xE3o.`;
      }
      const stat = fs2.statSync(fullPath);
      if (stat.isDirectory()) {
        return `Erro: '${args.path}' \xE9 um diret\xF3rio. Use 'delete_directory' para remover pastas.`;
      }
      fs2.unlinkSync(fullPath);
      return `\u2714 Arquivo '${args.path}' exclu\xEDdo com sucesso.`;
    }
  };
  const deleteDirectoryTool = {
    name: "delete_directory",
    description: "Remove permanentemente um diret\xF3rio e seu conte\xFAdo do sistema.",
    category: "write",
    needsConfirmation: () => true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Caminho do diret\xF3rio a ser exclu\xEDdo."
        },
        recursive: {
          type: "boolean",
          description: "Se true, remove subpastas e arquivos recursivamente (padr\xE3o: true)."
        }
      },
      required: ["path"]
    },
    execute: async (args) => {
      const fullPath = resolveSafePath(args.path);
      if (!fs2.existsSync(fullPath)) {
        return `Erro: Diret\xF3rio '${args.path}' n\xE3o encontrado para exclus\xE3o.`;
      }
      const stat = fs2.statSync(fullPath);
      if (!stat.isDirectory()) {
        return `Erro: '${args.path}' \xE9 um arquivo, n\xE3o um diret\xF3rio. Use 'delete_file'.`;
      }
      const isRecursive = args.recursive !== false;
      fs2.rmSync(fullPath, { recursive: isRecursive, force: true });
      return `\u2714 Diret\xF3rio '${args.path}' exclu\xEDdo com sucesso.`;
    }
  };
  const moveFileTool = {
    name: "move_file",
    description: "Move ou renomeia um arquivo ou pasta da origem (source) para o destino (destination).",
    category: "write",
    needsConfirmation: () => true,
    parameters: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Caminho de origem."
        },
        destination: {
          type: "string",
          description: "Caminho de destino."
        },
        overwrite: {
          type: "boolean",
          description: "Se true, sobrescreve caso o destino j\xE1 exista."
        }
      },
      required: ["source", "destination"]
    },
    execute: async (args) => {
      const srcPath = resolveSafePath(args.source);
      const destPath = resolveSafePath(args.destination);
      if (!fs2.existsSync(srcPath)) {
        return `Erro: Origem '${args.source}' n\xE3o encontrada.`;
      }
      if (fs2.existsSync(destPath) && !args.overwrite) {
        return `Erro: Destino '${args.destination}' j\xE1 existe. Use overwrite: true se desejar sobrescrever.`;
      }
      const destDir = path2.dirname(destPath);
      if (!fs2.existsSync(destDir)) {
        fs2.mkdirSync(destDir, { recursive: true });
      }
      fs2.renameSync(srcPath, destPath);
      return `\u2714 '${args.source}' movido com sucesso para '${args.destination}'.`;
    }
  };
  const renameFileTool = {
    name: "rename_file",
    description: "Renomeia ou move um arquivo ou diret\xF3rio de source para destination.",
    category: "write",
    needsConfirmation: () => true,
    parameters: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Caminho atual."
        },
        destination: {
          type: "string",
          description: "Novo caminho / novo nome."
        },
        overwrite: {
          type: "boolean",
          description: "Se true, substitui se o destino j\xE1 existir."
        }
      },
      required: ["source", "destination"]
    },
    execute: async (args) => {
      return moveFileTool.execute(args);
    }
  };
  const copyFileTool = {
    name: "copy_file",
    description: "Copia um arquivo ou diret\xF3rio para o destino.",
    category: "write",
    needsConfirmation: () => true,
    parameters: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Caminho de origem."
        },
        destination: {
          type: "string",
          description: "Caminho de destino."
        },
        overwrite: {
          type: "boolean",
          description: "Se true, sobrescreve caso o arquivo ou diret\xF3rio destino j\xE1 exista."
        }
      },
      required: ["source", "destination"]
    },
    execute: async (args) => {
      const srcPath = resolveSafePath(args.source);
      const destPath = resolveSafePath(args.destination);
      if (!fs2.existsSync(srcPath)) {
        return `Erro: Origem '${args.source}' n\xE3o encontrada.`;
      }
      if (fs2.existsSync(destPath) && !args.overwrite) {
        return `Erro: Destino '${args.destination}' j\xE1 existe. Use overwrite: true para sobrescrever.`;
      }
      const destDir = path2.dirname(destPath);
      if (!fs2.existsSync(destDir)) {
        fs2.mkdirSync(destDir, { recursive: true });
      }
      const stat = fs2.statSync(srcPath);
      if (stat.isDirectory()) {
        fs2.cpSync(srcPath, destPath, { recursive: true, force: !!args.overwrite });
        return `\u2714 Diret\xF3rio '${args.source}' copiado recursivamente para '${args.destination}'.`;
      } else {
        fs2.copyFileSync(srcPath, destPath);
        return `\u2714 Arquivo '${args.source}' copiado para '${args.destination}'.`;
      }
    }
  };
  const createDirectoryTool = {
    name: "create_directory",
    description: "Cria um novo diret\xF3rio no sistema (cria pastas pai automaticamente se necess\xE1rio).",
    category: "write",
    needsConfirmation: () => true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Caminho do diret\xF3rio a ser criado."
        }
      },
      required: ["path"]
    },
    execute: async (args) => {
      const fullPath = resolveSafePath(args.path);
      if (fs2.existsSync(fullPath)) {
        return `Aviso: Diret\xF3rio '${args.path}' j\xE1 existe.`;
      }
      fs2.mkdirSync(fullPath, { recursive: true });
      return `\u2714 Diret\xF3rio '${args.path}' criado com sucesso.`;
    }
  };
  const listDirectoryTool = {
    name: "list_directory",
    description: "Lista arquivos e subpastas de um diret\xF3rio.",
    category: "read",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: 'Caminho do diret\xF3rio a listar (padr\xE3o: "." ou diret\xF3rio atual).'
        },
        recursive: {
          type: "boolean",
          description: "Se true, lista recursivamente (padr\xE3o: false)."
        },
        maxDepth: {
          type: "number",
          description: "Profundidade m\xE1xima para busca recursiva (padr\xE3o: 2)."
        }
      }
    },
    execute: async (args) => {
      const targetDir = resolveSafePath(args.path || ".");
      if (!fs2.existsSync(targetDir)) {
        return `Erro: Diret\xF3rio '${args.path || "."}' n\xE3o existe.`;
      }
      const stat = fs2.statSync(targetDir);
      if (!stat.isDirectory()) {
        return `Erro: '${args.path || "."}' \xE9 um arquivo, n\xE3o um diret\xF3rio.`;
      }
      const maxDepth = args.maxDepth ?? 2;
      const isRecursive = !!args.recursive;
      const results = [];
      const walk = (currentPath, currentDepth) => {
        if (isRecursive && currentDepth > maxDepth) return;
        const entries = fs2.readdirSync(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === ".git" || entry.name === "node_modules") continue;
          const entryRel = path2.relative(targetDir, path2.join(currentPath, entry.name));
          if (entry.isDirectory()) {
            results.push(`\u{1F4C1} ${entryRel}/`);
            if (isRecursive && currentDepth < maxDepth) {
              walk(path2.join(currentPath, entry.name), currentDepth + 1);
            }
          } else {
            const fileStat = fs2.statSync(path2.join(currentPath, entry.name));
            results.push(`\u{1F4C4} ${entryRel} (${fileStat.size} bytes)`);
          }
        }
      };
      walk(targetDir, 1);
      if (results.length === 0) {
        return `Diret\xF3rio '${args.path || "."}' est\xE1 vazio.`;
      }
      return `[Conte\xFAdo de '${args.path || "."}': ${results.length} itens]
` + results.join("\n");
    }
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
    listDirectoryTool
  ];
}

// src/tools/shell-tools.ts
import { execa } from "execa";
function createShellTools(options = {}) {
  const workingDir = options.workingDir || process.cwd();
  const defaultTimeoutMs = options.defaultTimeoutMs || 3e4;
  const runCommandTool = {
    name: "run_command",
    description: "Executa um comando de shell no terminal (ex: testes, linters, git, build).",
    category: "execute",
    needsConfirmation: (args) => {
      const cmd = (args?.command || "").trim().toLowerCase();
      const safePrefixes = ["git status", "git log", "git diff", "dir", "ls", "echo", "cat", "node -v", "pnpm -v"];
      return !safePrefixes.some((p) => cmd.startsWith(p));
    },
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "A linha de comando completa a ser executada."
        },
        timeoutMs: {
          type: "number",
          description: "Timeout em milissegundos (padr\xE3o: 30000ms)."
        }
      },
      required: ["command"]
    },
    execute: async (args) => {
      const isWindows = process.platform === "win32";
      const shell = isWindows ? "powershell.exe" : "/bin/bash";
      const timeout = args.timeoutMs || defaultTimeoutMs;
      try {
        const subprocess = execa(args.command, {
          cwd: workingDir,
          shell: true,
          timeout,
          reject: false,
          all: true
        });
        const result = await subprocess;
        const exitCode = result.exitCode ?? 0;
        const output = result.all || result.stdout || result.stderr || "(Sem sa\xEDda)";
        const truncated = output.length > 8e3 ? output.slice(0, 4e3) + "\n\n... [sa\xEDda truncada] ...\n\n" + output.slice(-4e3) : output;
        return `[C\xF3digo de sa\xEDda: ${exitCode}]
${truncated}`;
      } catch (err) {
        return `Erro ao executar comando: ${err.message}`;
      }
    }
  };
  return [runCommandTool];
}

// src/tools/git-tools.ts
import { execa as execa2 } from "execa";
function createGitTools(workingDir = process.cwd()) {
  const gitCommitTool = {
    name: "git_commit",
    description: "Prepara (stage) arquivos e realiza commit com mensagem sem\xE2ntica Conventional Commits.",
    category: "git",
    needsConfirmation: () => true,
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Mensagem do commit no formato Conventional Commits (ex: feat: adiciona X, fix: corrige Y)."
        },
        files: {
          type: "array",
          description: "Lista de caminhos de arquivos para adicionar ao stage. Se vazio, adiciona todos com `git add -A`.",
          items: { type: "string" }
        }
      },
      required: ["message"]
    },
    execute: async (args) => {
      try {
        if (args.files && args.files.length > 0) {
          await execa2("git", ["add", ...args.files], { cwd: workingDir });
        } else {
          await execa2("git", ["add", "-A"], { cwd: workingDir });
        }
        const { stdout } = await execa2("git", ["commit", "-m", args.message], {
          cwd: workingDir
        });
        return `\u2714 Commit realizado com sucesso:
${stdout.trim()}`;
      } catch (err) {
        return `Erro ao realizar commit: ${err.message}`;
      }
    }
  };
  const gitDiffTool = {
    name: "git_diff",
    description: "Retorna as diferen\xE7as (diff) atuais da \xE1rvore de trabalho ou de arquivos preparados.",
    category: "git",
    parameters: {
      type: "object",
      properties: {
        staged: {
          type: "boolean",
          description: "Se true, exibe diff de arquivos preparados (--cached)."
        }
      }
    },
    execute: async (args) => {
      try {
        const gitArgs = args.staged ? ["diff", "--cached"] : ["diff"];
        const { stdout } = await execa2("git", gitArgs, { cwd: workingDir });
        return stdout ? stdout : "(Nenhuma altera\xE7\xE3o identificada no diff)";
      } catch (err) {
        return `Erro ao ler git diff: ${err.message}`;
      }
    }
  };
  return [gitCommitTool, gitDiffTool];
}

// src/core/permissions.ts
var SecurityGuard = class {
  config;
  alwaysApprovedCategories = /* @__PURE__ */ new Set();
  alwaysApprovedTools = /* @__PURE__ */ new Set();
  confirmHandler;
  constructor(config, confirmHandler) {
    this.config = config;
    this.confirmHandler = confirmHandler;
  }
  setConfirmHandler(handler) {
    this.confirmHandler = handler;
  }
  getMode() {
    return this.config.mode || "auto-safe";
  }
  setMode(mode) {
    this.config.mode = mode;
  }
  async authorize(tool, args) {
    const mode = this.getMode();
    if (mode === "always-allow") {
      return { allowed: true };
    }
    if (tool.category === "read") {
      if (this.config.allowFileRead) {
        return { allowed: true };
      }
    }
    if (this.alwaysApprovedTools.has(tool.name) || this.alwaysApprovedCategories.has(tool.category)) {
      return { allowed: true };
    }
    if (mode === "auto-safe") {
      if (tool.needsConfirmation && !tool.needsConfirmation(args)) {
        return { allowed: true };
      }
      if (tool.category === "write" && this.config.allowFileWrite) {
        return { allowed: true };
      }
      if (tool.category === "execute" && this.config.allowShellExecution) {
        return { allowed: true };
      }
    }
    if (this.confirmHandler) {
      const decision = await this.confirmHandler({
        toolName: tool.name,
        category: tool.category,
        args
      });
      if (decision === "yes") {
        return { allowed: true };
      }
      if (decision === "always") {
        this.alwaysApprovedTools.add(tool.name);
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: `A\xE7\xE3o cancelada pelo usu\xE1rio para a ferramenta '${tool.name}'.`
      };
    }
    return {
      allowed: false,
      reason: `Execu\xE7\xE3o da ferramenta '${tool.name}' requer autoriza\xE7\xE3o pr\xE9via.`
    };
  }
};

// src/context/codebase-crawler.ts
import fs3 from "fs";
import path3 from "path";
import fg from "fast-glob";
import ignore from "ignore";
var CodebaseCrawler = class {
  rootDir;
  maxFiles;
  defaultIgnores = [
    "node_modules/**",
    ".git/**",
    "dist/**",
    "build/**",
    "coverage/**",
    ".next/**",
    ".turbo/**",
    "target/**",
    "vendor/**",
    "**/.DS_Store",
    "**/*.log"
  ];
  constructor(options = {}) {
    this.rootDir = path3.resolve(options.rootDir || process.cwd());
    this.maxFiles = options.maxFiles || 5e3;
  }
  getRootDir() {
    return this.rootDir;
  }
  loadGitignore() {
    const ig = ignore();
    ig.add(this.defaultIgnores);
    const gitignorePath = path3.join(this.rootDir, ".gitignore");
    if (fs3.existsSync(gitignorePath)) {
      try {
        const content = fs3.readFileSync(gitignorePath, "utf-8");
        ig.add(content);
      } catch {
      }
    }
    return ig;
  }
  /**
   * Coleta a lista de arquivos relativos do repositório respeitando .gitignore.
   */
  async listFiles() {
    const ig = this.loadGitignore();
    const allEntries = await fg(["**/*"], {
      cwd: this.rootDir,
      dot: true,
      onlyFiles: true,
      ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"]
    });
    const filtered = allEntries.filter((file) => {
      const normalized = file.replace(/\\/g, "/");
      return !ig.ignores(normalized);
    });
    return filtered.slice(0, this.maxFiles);
  }
  /**
   * Gera um resumo da estrutura do repositório para inclusão no contexto do LLM.
   */
  async getStructureSummary() {
    const files = await this.listFiles();
    if (files.length === 0) {
      return "(Nenhum arquivo encontrado no reposit\xF3rio)";
    }
    const preview = files.slice(0, 80);
    const lines = preview.map((f) => `  - ${f}`);
    if (files.length > 80) {
      lines.push(`  ... e mais ${files.length - 80} arquivos.`);
    }
    return `Estrutura do Reposit\xF3rio (${files.length} arquivos):
${lines.join("\n")}`;
  }
};

// src/context/git-context.ts
import { execa as execa3 } from "execa";
var GitContext = class {
  cwd;
  constructor(cwd = process.cwd()) {
    this.cwd = cwd;
  }
  async isGitRepo() {
    try {
      await execa3("git", ["rev-parse", "--is-inside-work-tree"], { cwd: this.cwd });
      return true;
    } catch {
      return false;
    }
  }
  async getCurrentBranch() {
    try {
      const { stdout } = await execa3("git", ["branch", "--show-current"], { cwd: this.cwd });
      return stdout.trim();
    } catch {
      return void 0;
    }
  }
  async getStatusSummary() {
    const isRepo = await this.isGitRepo();
    if (!isRepo) {
      return {
        isGitRepo: false,
        modifiedFiles: [],
        stagedFiles: [],
        untrackedFiles: []
      };
    }
    const branch = await this.getCurrentBranch();
    let statusOutput = "";
    try {
      const { stdout } = await execa3("git", ["status", "--short"], { cwd: this.cwd });
      statusOutput = stdout.trim();
    } catch {
    }
    const modifiedFiles = [];
    const stagedFiles = [];
    const untrackedFiles = [];
    if (statusOutput) {
      const lines = statusOutput.split("\n");
      for (const line of lines) {
        if (!line) continue;
        const indexStatus = line[0];
        const worktreeStatus = line[1];
        const file = line.slice(3).trim();
        if (indexStatus === "?" && worktreeStatus === "?") {
          untrackedFiles.push(file);
        } else {
          if (indexStatus && indexStatus !== " ") {
            stagedFiles.push(file);
          }
          if (worktreeStatus && worktreeStatus !== " ") {
            modifiedFiles.push(file);
          }
        }
      }
    }
    let cachedDiff = "";
    try {
      const { stdout } = await execa3("git", ["diff", "--cached", "--stat"], { cwd: this.cwd });
      cachedDiff = stdout.trim();
    } catch {
    }
    return {
      isGitRepo: true,
      currentBranch: branch,
      modifiedFiles,
      stagedFiles,
      untrackedFiles,
      cachedDiff: cachedDiff || void 0
    };
  }
  async getFormattedContext() {
    const summary = await this.getStatusSummary();
    if (!summary.isGitRepo) {
      return "Contexto Git: (Diret\xF3rio n\xE3o \xE9 um reposit\xF3rio Git)";
    }
    const parts = [
      `Contexto Git:`,
      `  - Branch atual: ${summary.currentBranch || "detached/desconhecida"}`
    ];
    if (summary.stagedFiles.length > 0) {
      parts.push(`  - Arquivos preparados (staged): ${summary.stagedFiles.join(", ")}`);
    }
    if (summary.modifiedFiles.length > 0) {
      parts.push(`  - Arquivos modificados (unstaged): ${summary.modifiedFiles.join(", ")}`);
    }
    if (summary.untrackedFiles.length > 0) {
      parts.push(`  - Arquivos n\xE3o rastreados (untracked): ${summary.untrackedFiles.join(", ")}`);
    }
    if (summary.stagedFiles.length === 0 && summary.modifiedFiles.length === 0 && summary.untrackedFiles.length === 0) {
      parts.push("  - \xC1rvore de trabalho limpa (nenhuma altera\xE7\xE3o pendente).");
    }
    return parts.join("\n");
  }
};

// src/core/prompts.ts
function buildSystemPrompt(context) {
  const parts = [
    `Voc\xEA \xE9 o **Antigravity CLI Agent**, um assistente de engenharia de software avan\xE7ado que roda diretamente no terminal do desenvolvedor.`,
    `Seu objetivo \xE9 auxiliar o desenvolvedor analisando o reposit\xF3rio, lendo e manipulando c\xF3digo e arquivos, executando testes e comandos, e mantendo o fluxo de trabalho de forma assertiva e segura.`,
    ``,
    `### Diretrizes Operacionais:`,
    `1. **L\xEDngua:** Sempre responda em Portugu\xEAs do Brasil com clareza t\xE9cnica e concis\xE3o.`,
    `2. **Consci\xEAncia de Sistema e Arquivos:** Voc\xEA tem ferramentas reais para ler arquivos (\`read_file\`), editar cirurgicamente (\`edit_file\`), criar arquivos (\`create_file\`), reescrever arquivos (\`rewrite_file\`), apagar arquivos (\`delete_file\`), apagar diret\xF3rios (\`delete_directory\`), mover/renomear (\`move_file\`, \`rename_file\`), copiar (\`copy_file\`), criar diret\xF3rios (\`create_directory\`), listar diret\xF3rios (\`list_directory\`), inspecionar git (\`git_diff\`, \`git_commit\`) e rodar comandos de terminal (\`run_command\`).`,
    `3. **A\xE7\xF5es Cir\xFArgicas:** Antes de editar ou modificar arquivos, leia-os primeiro quando necess\xE1rio para entender o contexto.`,
    `4. **Seguran\xE7a:** Nunca execute comandos ou exclus\xF5es destrutivas sem necessidade e seja transparente sobre o que cada ferramenta far\xE1.`,
    `5. **Testes & Diagn\xF3stico:** Ao investigar erros ou rodar testes, use \`run_command\` para validar e inspecione a sa\xEDda do compilador ou runner antes de propor corre\xE7\xF5es.`,
    ``,
    `### Ambiente Atual:`,
    `- Diret\xF3rio de Trabalho: \`${context.workingDirectory}\``
  ];
  if (context.gitContext) {
    parts.push(``, `### Informa\xE7\xF5es do Git:`, context.gitContext);
  }
  if (context.repoStructure) {
    parts.push(``, `### Estrutura de Arquivos:`, context.repoStructure);
  }
  if (context.activeSkills && context.activeSkills.length > 0) {
    parts.push(``, `### Skills Ativas:`);
    for (const skill of context.activeSkills) {
      parts.push(
        `--- IN\xCDCIO DA SKILL: ${skill.name} ---`,
        skill.description ? `Descri\xE7\xE3o: ${skill.description}
` : "",
        skill.content,
        `--- FIM DA SKILL: ${skill.name} ---`
      );
    }
  }
  if (context.agentMemory) {
    parts.push(``, context.agentMemory);
  }
  if (context.customAddition) {
    parts.push(``, `### Instru\xE7\xF5es Customizadas do Usu\xE1rio:`, context.customAddition);
  }
  return parts.join("\n");
}

// src/core/tool-cache.ts
import crypto from "crypto";
import path4 from "path";
var ToolCache = class {
  cache = /* @__PURE__ */ new Map();
  hits = 0;
  misses = 0;
  defaultTtlMs;
  constructor(defaultTtlMs = 6e4) {
    this.defaultTtlMs = defaultTtlMs;
  }
  hashKey(toolName, args) {
    const sortedArgs = JSON.stringify(args, Object.keys(args || {}).sort());
    return `${toolName}:${crypto.createHash("sha256").update(sortedArgs).digest("hex")}`;
  }
  isCacheable(toolName) {
    const cacheableTools = ["read_file", "list_directory", "git_status", "read_skill", "read_memory"];
    return cacheableTools.includes(toolName);
  }
  get(toolName, args) {
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
  set(toolName, args, output, ttlMs = this.defaultTtlMs) {
    if (!this.isCacheable(toolName)) return;
    const key = this.hashKey(toolName, args);
    const now = Date.now();
    const rawPath = args.path || args.targetPath || args.file;
    const targetPath = rawPath ? path4.normalize(rawPath).toLowerCase() : void 0;
    this.cache.set(key, {
      toolName,
      args,
      targetPath,
      output,
      createdAt: now,
      expiresAt: now + ttlMs
    });
  }
  /**
   * Invalida entradas de cache quando um arquivo for modificado ou removido
   */
  invalidateForPath(targetPath) {
    const normalized = path4.normalize(targetPath).toLowerCase();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.toolName === "list_directory") {
        this.cache.delete(key);
      } else if (entry.targetPath && (entry.targetPath === normalized || entry.targetPath.includes(normalized) || normalized.includes(entry.targetPath))) {
        this.cache.delete(key);
      }
    }
  }
  invalidateAll() {
    this.cache.clear();
  }
  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      itemsCount: this.cache.size
    };
  }
};

// src/context/token-tracker.ts
function resolveContextWindow(modelId, reportedContextLength) {
  if (reportedContextLength && reportedContextLength > 0) {
    return reportedContextLength;
  }
  const id = (modelId || "").toLowerCase();
  if (id.includes("gemini-1.5") || id.includes("gemini-2.0") || id.includes("gemini-exp")) {
    if (id.includes("2m")) return 2e6;
    return 1e6;
  }
  if (id.includes("claude-3") || id.includes("claude-sonnet") || id.includes("claude-opus") || id.includes("claude-haiku")) {
    return 2e5;
  }
  if (id.includes("gpt-4o") || id.includes("gpt-4-turbo") || id.includes("o1") || id.includes("o3") || id.includes("gpt-4.5")) {
    return 128e3;
  }
  if (id.includes("deepseek")) {
    if (id.includes("r1") || id.includes("v3")) return 128e3;
    return 64e3;
  }
  if (id.includes("llama-3.1") || id.includes("llama-3.2") || id.includes("llama-3.3") || id.includes("qwen-2.5")) {
    return 128e3;
  }
  if (id.includes("mistral-large") || id.includes("codestral")) {
    return 128e3;
  }
  if (id.includes("2m")) return 2e6;
  if (id.includes("1m")) return 1e6;
  if (id.includes("200k")) return 2e5;
  if (id.includes("128k")) return 128e3;
  if (id.includes("64k")) return 64e3;
  if (id.includes("32k")) return 32768;
  if (id.includes("16k")) return 16384;
  if (id.includes("8k")) return 8192;
  if (id.includes("4k")) return 4096;
  return 128e3;
}
function estimateTokens(input) {
  if (typeof input === "string") {
    if (input.length === 0) return 0;
    const words = input.trim().split(/\s+/).length;
    const charEstimate = Math.ceil(input.length / 3.7);
    return Math.max(1, Math.round(charEstimate * 0.7 + words * 1.3 * 0.3));
  }
  if (Array.isArray(input)) {
    let total = 3;
    for (const msg of input) {
      total += estimateMessageTokens(msg);
    }
    return total;
  }
  if (input && typeof input === "object") {
    return estimateMessageTokens(input);
  }
  return 0;
}
function estimateMessageTokens(msg) {
  let tokens = 4;
  if (msg.content) {
    tokens += estimateTokens(msg.content);
  }
  if (msg.name) {
    tokens += estimateTokens(msg.name);
  }
  if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) {
      tokens += 8;
      if (tc.function) {
        tokens += estimateTokens(tc.function.name);
        if (tc.function.arguments) {
          tokens += estimateTokens(tc.function.arguments);
        }
      }
    }
  }
  return tokens;
}
function formatTokenCount(tokens) {
  if (tokens >= 1e6) {
    return `${(tokens / 1e6).toFixed(1)}M`;
  }
  if (tokens >= 1e3) {
    return `${(tokens / 1e3).toFixed(1)}k`;
  }
  return tokens.toString();
}
function calculateTokenStats(messages, modelId, reportedContextLength) {
  const currentTokens = estimateTokens(messages);
  const maxTokens = resolveContextWindow(modelId, reportedContextLength);
  const percentage = Math.min(100, Number((currentTokens / maxTokens * 100).toFixed(1)));
  const isNearLimit = percentage >= 75;
  return {
    currentTokens,
    maxTokens,
    percentage,
    formattedCurrent: formatTokenCount(currentTokens),
    formattedMax: formatTokenCount(maxTokens),
    isNearLimit
  };
}

// src/context/context-compactor.ts
function compactHistory(messages, options = {}) {
  const maxRecent = options.maxRecentMessages ?? 4;
  const tokensBefore = estimateTokens(messages);
  if (messages.length <= maxRecent + 1) {
    return {
      compactedMessages: [...messages],
      tokensBefore,
      tokensAfter: tokensBefore,
      tokensSaved: 0,
      compactedCount: 0
    };
  }
  let systemPrompt = null;
  let remaining = [...messages];
  if (remaining.length > 0 && remaining[0].role === "system") {
    systemPrompt = remaining[0];
    remaining = remaining.slice(1);
  }
  const keepRecent = remaining.slice(-maxRecent);
  const toSummarize = remaining.slice(0, -maxRecent);
  if (toSummarize.length === 0) {
    return {
      compactedMessages: [...messages],
      tokensBefore,
      tokensAfter: tokensBefore,
      tokensSaved: 0,
      compactedCount: 0
    };
  }
  const summaryLines = [
    "\u2726 [HIST\xD3RICO COMPACTADO DA SESS\xC3O ANTERIOR]",
    `Foram resumidas ${toSummarize.length} mensagens anteriores para economia de contexto:`
  ];
  for (const msg of toSummarize) {
    if (msg.role === "user" && msg.content) {
      const preview = msg.content.length > 120 ? `${msg.content.slice(0, 117)}...` : msg.content;
      summaryLines.push(`\u2022 Usu\xE1rio solicitou: "${preview.replace(/\n/g, " ")}"`);
    } else if (msg.role === "assistant" && msg.content) {
      const preview = msg.content.length > 150 ? `${msg.content.slice(0, 147)}...` : msg.content;
      summaryLines.push(`\u2022 Assistente respondeu: "${preview.replace(/\n/g, " ")}"`);
    } else if (msg.role === "tool" && msg.content) {
      const preview = msg.content.length > 100 ? `${msg.content.slice(0, 97)}...` : msg.content;
      summaryLines.push(`\u2022 Ferramenta [${msg.name || "exec"}] retornou: "${preview.replace(/\n/g, " ")}"`);
    }
  }
  const summaryMessage = {
    role: "system",
    content: summaryLines.join("\n")
  };
  const compactedMessages = [];
  if (systemPrompt) {
    compactedMessages.push(systemPrompt);
  }
  compactedMessages.push(summaryMessage);
  compactedMessages.push(...keepRecent);
  const tokensAfter = estimateTokens(compactedMessages);
  const tokensSaved = Math.max(0, tokensBefore - tokensAfter);
  return {
    compactedMessages,
    tokensBefore,
    tokensAfter,
    tokensSaved,
    compactedCount: toSummarize.length
  };
}
function shouldAutoCompact(currentTokens, maxTokens, threshold = 0.75) {
  if (maxTokens <= 0) return false;
  return currentTokens / maxTokens >= threshold;
}

// src/core/agent-loop.ts
var AgentLoop = class {
  client;
  model;
  tools;
  securityGuard;
  toolCache;
  messages = [];
  maxIterations;
  reportedContextLength;
  constructor(options) {
    this.client = options.client;
    this.model = options.model;
    this.tools = options.tools;
    this.securityGuard = options.securityGuard;
    this.maxIterations = options.maxIterations ?? 15;
    this.toolCache = options.toolCache ?? new ToolCache();
    this.reportedContextLength = options.reportedContextLength;
    this.messages.push({
      role: "system",
      content: options.systemPrompt
    });
  }
  getMessages() {
    return [...this.messages];
  }
  setMessages(messages) {
    this.messages = [...messages];
  }
  setClient(client) {
    this.client = client;
  }
  setModel(model, contextLength) {
    this.model = model;
    if (contextLength !== void 0) {
      this.reportedContextLength = contextLength;
    }
  }
  getModel() {
    return this.model;
  }
  getTools() {
    return this.tools;
  }
  getSecurityGuard() {
    return this.securityGuard;
  }
  getToolCache() {
    return this.toolCache;
  }
  getTokenStats() {
    return calculateTokenStats(this.messages, this.model, this.reportedContextLength);
  }
  compactContext(maxRecentMessages) {
    const result = compactHistory(this.messages, { maxRecentMessages });
    this.messages = result.compactedMessages;
    return result;
  }
  updateSystemPrompt(systemPrompt) {
    if (this.messages.length > 0 && this.messages[0].role === "system") {
      this.messages[0].content = systemPrompt;
    } else {
      this.messages.unshift({
        role: "system",
        content: systemPrompt
      });
    }
  }
  appendUserMessage(content) {
    this.messages.push({
      role: "user",
      content
    });
  }
  /**
   * Executa a iteração agêntica completa até o modelo retornar uma resposta final sem tool calls
   * ou atingir o número máximo de iterações.
   */
  async runTurn(userPrompt, callbacks = {}, signal) {
    if (userPrompt) {
      this.appendUserMessage(userPrompt);
    }
    const stats = this.getTokenStats();
    if (shouldAutoCompact(stats.currentTokens, stats.maxTokens, 0.75)) {
      const compaction = this.compactContext(4);
      if (callbacks.onAutoCompact) {
        callbacks.onAutoCompact(compaction);
      }
    }
    const availableTools = this.tools.toOpenAiTools();
    let iteration = 0;
    let finalAssistantText = "";
    while (iteration < this.maxIterations) {
      iteration++;
      let accumulatedContent = "";
      let streamedToolCalls;
      const response = await this.client.streamChat(
        {
          model: this.model,
          messages: this.messages,
          tools: availableTools.length > 0 ? availableTools : void 0,
          stream: true
        },
        {
          onToken: (tok) => {
            accumulatedContent += tok;
            if (callbacks.onToken) {
              callbacks.onToken(tok);
            }
          },
          onToolCallDelta: (tcs) => {
            streamedToolCalls = tcs;
          },
          signal
        }
      );
      finalAssistantText = response.content || accumulatedContent;
      const toolCalls = response.toolCalls || streamedToolCalls;
      this.messages.push({
        role: "assistant",
        content: finalAssistantText || null,
        tool_calls: toolCalls
      });
      if (!toolCalls || toolCalls.length === 0) {
        if (callbacks.onStepFinish) {
          callbacks.onStepFinish(iteration);
        }
        break;
      }
      for (const tc of toolCalls) {
        const toolDef = this.tools.get(tc.function.name);
        let parsedArgs = {};
        try {
          parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          parsedArgs = {};
        }
        if (callbacks.onToolCallStart) {
          callbacks.onToolCallStart({
            id: tc.id,
            name: tc.function.name,
            args: parsedArgs
          });
        }
        let output = "";
        if (!toolDef) {
          output = `Erro: Ferramenta '${tc.function.name}' n\xE3o est\xE1 registrada no agente.`;
        } else {
          const auth = await this.securityGuard.authorize(toolDef, parsedArgs);
          if (!auth.allowed) {
            output = `A\xE7\xE3o bloqueada: ${auth.reason || "Permiss\xE3o negada"}`;
          } else {
            const cachedOutput = this.toolCache.get(tc.function.name, parsedArgs);
            if (cachedOutput !== null) {
              output = cachedOutput;
            } else {
              output = await this.tools.executeTool(tc.function.name, parsedArgs);
              this.toolCache.set(tc.function.name, parsedArgs, output);
            }
            const mutatingTools = [
              "edit_file",
              "create_file",
              "rewrite_file",
              "delete_file",
              "delete_directory",
              "move_file",
              "rename_file",
              "copy_file",
              "create_directory"
            ];
            if (mutatingTools.includes(tc.function.name)) {
              const targetPath = parsedArgs.path || parsedArgs.targetPath || parsedArgs.destinationPath || "";
              this.toolCache.invalidateForPath(targetPath);
            }
          }
        }
        if (callbacks.onToolCallResult) {
          callbacks.onToolCallResult({
            id: tc.id,
            name: tc.function.name,
            output
          });
        }
        this.messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.function.name,
          content: output
        });
      }
      if (callbacks.onStepFinish) {
        callbacks.onStepFinish(iteration);
      }
    }
    return finalAssistantText;
  }
};

// src/plugins/plugin-loader.ts
import fs4 from "fs";
import path5 from "path";
import os2 from "os";
import { pathToFileURL } from "url";
var PluginLoader = class {
  toolRegistry;
  config;
  workingDirectory;
  slashCommands = /* @__PURE__ */ new Map();
  loadedPlugins = /* @__PURE__ */ new Map();
  constructor(options) {
    this.toolRegistry = options.toolRegistry;
    this.config = options.config;
    this.workingDirectory = options.workingDirectory || process.cwd();
  }
  getSlashCommands() {
    return Array.from(this.slashCommands.values());
  }
  getSlashCommand(name) {
    const cleanName = name.startsWith("/") ? name.slice(1) : name;
    return this.slashCommands.get(cleanName);
  }
  registerSlashCommand(command) {
    const cleanName = command.name.startsWith("/") ? command.name.slice(1) : command.name;
    this.slashCommands.set(cleanName, {
      ...command,
      name: cleanName
    });
  }
  getLoadedPlugins() {
    return Array.from(this.loadedPlugins.values());
  }
  async loadPluginFromModule(manifest) {
    const context = {
      workingDirectory: this.workingDirectory,
      config: this.config,
      registerTool: (tool) => this.toolRegistry.register(tool),
      registerSlashCommand: (cmd) => this.registerSlashCommand(cmd),
      log: (msg) => console.log(`[Plugin:${manifest.name}] ${msg}`)
    };
    await manifest.activate(context);
    this.loadedPlugins.set(manifest.name, manifest);
  }
  async installPlugin(sourcePath) {
    try {
      const resolvedSource = path5.isAbsolute(sourcePath) ? sourcePath : path5.resolve(this.workingDirectory, sourcePath);
      if (!fs4.existsSync(resolvedSource)) {
        return { success: false, message: `Origem '${sourcePath}' n\xE3o encontrada.` };
      }
      const pluginName = path5.basename(resolvedSource);
      const targetDir = path5.join(this.workingDirectory, ".cli", "plugins", pluginName);
      if (!fs4.existsSync(targetDir)) {
        fs4.mkdirSync(targetDir, { recursive: true });
      }
      const stat = fs4.statSync(resolvedSource);
      if (stat.isDirectory()) {
        fs4.cpSync(resolvedSource, targetDir, { recursive: true });
      } else {
        fs4.copyFileSync(resolvedSource, path5.join(targetDir, path5.basename(resolvedSource)));
      }
      await this.loadPluginFromDirectory(targetDir);
      const manifest = this.loadedPlugins.get(pluginName);
      return {
        success: true,
        message: `Plugin '${pluginName}' instalado com sucesso em '.cli/plugins/${pluginName}'.`,
        manifest
      };
    } catch (err) {
      return {
        success: false,
        message: `Erro ao instalar plugin: ${err.message}`
      };
    }
  }
  async loadPluginFromDirectory(pluginDir) {
    const dirName = path5.basename(pluginDir);
    const candidateScriptPaths = [
      path5.join(pluginDir, "index.js"),
      path5.join(pluginDir, "index.mjs"),
      path5.join(pluginDir, "main.js")
    ];
    for (const filePath of candidateScriptPaths) {
      if (fs4.existsSync(filePath)) {
        try {
          const fileUrl = pathToFileURL(filePath).href;
          const module = await import(fileUrl);
          const manifest = module.default || module;
          if (manifest && typeof manifest.activate === "function") {
            await this.loadPluginFromModule(manifest);
            return manifest;
          }
        } catch (err) {
          console.warn(`Aviso: Falha ao carregar script de plugin ${filePath}: ${err.message}`);
        }
      }
    }
    const geminiManifestPath = [
      path5.join(pluginDir, "gemini-extension.json"),
      path5.join(pluginDir, "gemini-plugin.json"),
      path5.join(pluginDir, "plugin.json")
    ].find((p) => fs4.existsSync(p));
    if (geminiManifestPath) {
      try {
        const rawJson = JSON.parse(fs4.readFileSync(geminiManifestPath, "utf-8"));
        const name = rawJson.name || dirName;
        const description = rawJson.description || "Plugin compat\xEDvel com Gemini CLI";
        const version = rawJson.version || "1.0.0";
        const manifest = {
          name,
          version,
          description,
          activate: (ctx) => {
            ctx.registerSlashCommand({
              name: `plugin:${name}`,
              description: `Comando do plugin ${name} (${description})`,
              handler: async () => `Plugin Gemini CLI '${name}' v${version} ativo.`
            });
          }
        };
        await this.loadPluginFromModule(manifest);
        return manifest;
      } catch (err) {
        console.warn(`Aviso: Falha ao carregar manifest Gemini CLI de ${geminiManifestPath}: ${err.message}`);
      }
    }
    const claudeManifestPath = [
      path5.join(pluginDir, ".mcp.json"),
      path5.join(pluginDir, "claude-plugin.json"),
      path5.join(pluginDir, "mcp.json")
    ].find((p) => fs4.existsSync(p));
    if (claudeManifestPath) {
      try {
        const rawJson = JSON.parse(fs4.readFileSync(claudeManifestPath, "utf-8"));
        const name = rawJson.name || dirName;
        const description = rawJson.description || "Plugin compat\xEDvel com Claude Code / MCP";
        const version = rawJson.version || "1.0.0";
        const manifest = {
          name,
          version,
          description,
          activate: (ctx) => {
            ctx.registerSlashCommand({
              name: `mcp:${name}`,
              description: `Servidor MCP ${name} (${description})`,
              handler: async () => `Servidor MCP Claude Code '${name}' registrado.`
            });
          }
        };
        await this.loadPluginFromModule(manifest);
        return manifest;
      } catch (err) {
        console.warn(`Aviso: Falha ao carregar manifest Claude Code de ${claudeManifestPath}: ${err.message}`);
      }
    }
    return null;
  }
  async discoverAndLoad() {
    const pluginDirs = [
      path5.join(this.workingDirectory, ".cli", "plugins"),
      path5.join(this.workingDirectory, ".gemini", "plugins"),
      path5.join(this.workingDirectory, ".claude", "plugins")
    ];
    if (process.platform === "win32") {
      const appData = process.env.APPDATA || path5.join(os2.homedir(), "AppData", "Roaming");
      pluginDirs.push(path5.join(appData, "agent-cli", "plugins"));
    } else {
      const xdg = process.env.XDG_CONFIG_HOME || path5.join(os2.homedir(), ".config");
      pluginDirs.push(path5.join(xdg, "agent-cli", "plugins"));
    }
    for (const baseDir of pluginDirs) {
      if (!fs4.existsSync(baseDir)) continue;
      const entries = fs4.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pluginDir = path5.join(baseDir, entry.name);
        await this.loadPluginFromDirectory(pluginDir);
      }
    }
    return this.getLoadedPlugins();
  }
};

// src/skills/skill-manager.ts
import fs5 from "fs";
import path6 from "path";
import os3 from "os";
import fg2 from "fast-glob";
var SkillManager = class {
  workspaceDir;
  activeSkillNames;
  includeGlobal;
  skillsCache = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    this.workspaceDir = options.workspaceDir || process.cwd();
    this.activeSkillNames = new Set(options.activeSkills || []);
    this.includeGlobal = options.includeGlobal ?? true;
  }
  parseSkillFile(filePath) {
    try {
      if (!fs5.existsSync(filePath)) return null;
      const raw = fs5.readFileSync(filePath, "utf-8");
      let name = path6.basename(path6.dirname(filePath));
      let description = "";
      let body = raw;
      const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        body = frontmatterMatch[2];
        const nameMatch = frontmatter.match(/name:\s*([^\r\n]+)/);
        if (nameMatch) {
          name = nameMatch[1].trim().replace(/^['"]|['"]$/g, "");
        }
        const descMatch = frontmatter.match(/description:\s*([^\r\n]+)/);
        if (descMatch) {
          description = descMatch[1].trim().replace(/^['"]|['"]$/g, "");
        }
      } else {
        const titleMatch = raw.match(/^#\s+(.+)$/m);
        if (titleMatch) {
          description = titleMatch[1].trim();
        }
      }
      if (!description) {
        description = `Instru\xE7\xF5es da skill '${name}'`;
      }
      return {
        name,
        description,
        filePath,
        content: body.trim(),
        isActive: this.activeSkillNames.has(name)
      };
    } catch {
      return null;
    }
  }
  async discoverSkills() {
    this.skillsCache.clear();
    const searchPatterns = [];
    const localDir = this.workspaceDir.replace(/\\/g, "/");
    searchPatterns.push(
      `${localDir}/.skills/**/SKILL.md`,
      `${localDir}/skills/**/SKILL.md`,
      `${localDir}/.agent/skills/**/SKILL.md`
    );
    if (this.includeGlobal) {
      const homeDir = os3.homedir().replace(/\\/g, "/");
      searchPatterns.push(
        `${homeDir}/.skills/**/SKILL.md`,
        `${homeDir}/.agent/skills/**/SKILL.md`,
        `${homeDir}/.gemini/config/plugins/**/skills/**/SKILL.md`
      );
      if (process.platform === "win32" && process.env.APPDATA) {
        const appData = process.env.APPDATA.replace(/\\/g, "/");
        searchPatterns.push(`${appData}/agent-cli/skills/**/SKILL.md`);
      }
    }
    try {
      const matches = await fg2(searchPatterns, {
        onlyFiles: true,
        caseSensitiveMatch: false,
        suppressErrors: true,
        deep: 6
      });
      for (const m of matches) {
        const skill = this.parseSkillFile(m);
        if (skill && !this.skillsCache.has(skill.name)) {
          this.skillsCache.set(skill.name, skill);
        }
      }
    } catch {
    }
    return Array.from(this.skillsCache.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
  getSkills() {
    return Array.from(this.skillsCache.values());
  }
  getSkill(name) {
    return this.skillsCache.get(name);
  }
  isSkillActive(name) {
    return this.activeSkillNames.has(name);
  }
  toggleSkill(name) {
    const isNowActive = !this.activeSkillNames.has(name);
    if (isNowActive) {
      this.activeSkillNames.add(name);
    } else {
      this.activeSkillNames.delete(name);
    }
    const skill = this.skillsCache.get(name);
    if (skill) {
      skill.isActive = isNowActive;
    }
    return isNowActive;
  }
  getActiveSkills() {
    return Array.from(this.skillsCache.values()).filter((s) => this.activeSkillNames.has(s.name));
  }
  getInjectedSkillsPrompt() {
    return this.getActiveSkills().map((s) => ({
      name: s.name,
      description: s.description,
      content: s.content
    }));
  }
  /**
   * Ferramentas para o LLM consultar e ler skills
   */
  createSkillTools() {
    const listSkillsTool = {
      name: "list_skills",
      description: "Lista todas as skills dispon\xEDveis no ambiente do usu\xE1rio (locais e globais).",
      category: "read",
      parameters: {
        type: "object",
        properties: {}
      },
      execute: async () => {
        const skills = await this.discoverSkills();
        if (skills.length === 0) {
          return "Nenhuma skill encontrada nos diret\xF3rios locais ou globais (.skills/, .agent/skills/, etc.).";
        }
        const lines = skills.map((s) => {
          const status = s.isActive ? "[ATIVA]" : "[INATIVA]";
          return `\u2022 ${s.name} ${status} - ${s.description}`;
        });
        return `[Skills Dispon\xEDveis (${skills.length})]:
` + lines.join("\n");
      }
    };
    const readSkillTool = {
      name: "read_skill",
      description: "L\xEA as instru\xE7\xF5es completas de uma skill espec\xEDfica.",
      category: "read",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Nome da skill a ser lida."
          }
        },
        required: ["name"]
      },
      execute: async (args) => {
        let skill = this.getSkill(args.name);
        if (!skill) {
          await this.discoverSkills();
          skill = this.getSkill(args.name);
        }
        if (!skill) {
          return `Erro: Skill '${args.name}' n\xE3o foi encontrada. Use 'list_skills' para ver as dispon\xEDveis.`;
        }
        return `[Skill: ${skill.name}]
Descri\xE7\xE3o: ${skill.description}
Origem: ${skill.filePath}

Instru\xE7\xF5es:
${skill.content}`;
      }
    };
    return [listSkillsTool, readSkillTool];
  }
};

// src/tui/app.tsx
import { useState as useState10, useEffect as useEffect5 } from "react";
import { Box as Box12, Text as Text12, useApp } from "ink";

// src/tui/theme.ts
var themes = {
  dark: {
    primary: "cyan",
    secondary: "blue",
    success: "green",
    warning: "yellow",
    error: "red",
    muted: "gray",
    border: "cyan"
  },
  light: {
    primary: "blue",
    secondary: "magenta",
    success: "green",
    warning: "yellow",
    error: "red",
    muted: "gray",
    border: "blue"
  },
  dracula: {
    primary: "magenta",
    secondary: "cyan",
    success: "green",
    warning: "yellow",
    error: "red",
    muted: "gray",
    border: "magenta"
  },
  cyberpunk: {
    primary: "yellow",
    secondary: "cyan",
    success: "greenBright",
    warning: "magenta",
    error: "redBright",
    muted: "gray",
    border: "yellow"
  }
};
function getTheme(themeName = "dark") {
  return themes[themeName] || themes.dark;
}

// src/tui/components/compose.tsx
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { jsx, jsxs } from "react/jsx-runtime";
var Compose = ({
  onSubmit,
  onChange,
  theme,
  placeholder = "Digite uma mensagem ou / para ver comandos...",
  disabled = false
}) => {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  useInput((input, key) => {
    if (disabled) return;
    if (key.upArrow && !value.startsWith("/")) {
      if (history.length > 0) {
        const nextIdx = historyIndex + 1;
        if (nextIdx < history.length) {
          setHistoryIndex(nextIdx);
          const historicalText = history[history.length - 1 - nextIdx];
          setValue(historicalText);
          onChange?.(historicalText);
        }
      }
    } else if (key.downArrow && !value.startsWith("/")) {
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        const historicalText = history[history.length - 1 - nextIdx];
        setValue(historicalText);
        onChange?.(historicalText);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setValue("");
        onChange?.("");
      }
    }
  });
  const handleChange = (newValue) => {
    setValue(newValue);
    onChange?.(newValue);
  };
  const handleSubmit = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);
    setValue("");
    onSubmit(trimmed);
  };
  return /* @__PURE__ */ jsxs(
    Box,
    {
      borderStyle: "round",
      borderColor: disabled ? theme.muted : theme.border,
      paddingX: 1,
      flexDirection: "row",
      children: [
        /* @__PURE__ */ jsxs(Text, { color: theme.primary, bold: true, children: [
          "\u276F",
          " "
        ] }),
        disabled ? /* @__PURE__ */ jsx(Text, { color: theme.muted, children: "Aguardando resposta do agente..." }) : /* @__PURE__ */ jsx(
          TextInput,
          {
            value,
            onChange: handleChange,
            onSubmit: handleSubmit,
            placeholder
          }
        )
      ]
    }
  );
};

// src/tui/components/command-menu.tsx
import { useState as useState2, useEffect } from "react";
import { Box as Box2, Text as Text2, useInput as useInput2 } from "ink";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var CommandMenu = ({
  input,
  commands,
  onSelect,
  theme
}) => {
  const [selectedIndex, setSelectedIndex] = useState2(0);
  const query = input.startsWith("/") ? input.slice(1).toLowerCase().trim() : "";
  const filtered = commands.filter((c) => {
    const cleanName = c.name.startsWith("/") ? c.name.slice(1) : c.name;
    return cleanName.toLowerCase().includes(query) || c.description.toLowerCase().includes(query);
  });
  useEffect(() => {
    setSelectedIndex(0);
  }, [input]);
  useInput2((_, key) => {
    if (filtered.length === 0) return;
    if (key.upArrow) {
      setSelectedIndex((prev) => prev > 0 ? prev - 1 : filtered.length - 1);
    } else if (key.downArrow) {
      setSelectedIndex((prev) => prev < filtered.length - 1 ? prev + 1 : 0);
    } else if (key.tab || key.return && input.startsWith("/") && !input.includes(" ")) {
      const selected = filtered[selectedIndex];
      if (selected) {
        const fullCmd = selected.name.startsWith("/") ? selected.name : `/${selected.name}`;
        onSelect(fullCmd);
      }
    }
  });
  if (!input.startsWith("/") || filtered.length === 0) {
    return null;
  }
  return /* @__PURE__ */ jsxs2(
    Box2,
    {
      flexDirection: "column",
      borderStyle: "single",
      borderColor: theme.primary,
      paddingX: 1,
      marginTop: 0,
      children: [
        /* @__PURE__ */ jsx2(Text2, { color: theme.muted, bold: true, children: "Comandos dispon\xEDveis (Navegue com \u2191/\u2193, selecione com Tab ou Enter):" }),
        filtered.slice(0, 8).map((cmd, idx) => {
          const isSelected = idx === selectedIndex;
          const prefix = isSelected ? "\u25B6 " : "  ";
          const formattedName = cmd.name.startsWith("/") ? cmd.name : `/${cmd.name}`;
          return /* @__PURE__ */ jsxs2(Box2, { flexDirection: "row", children: [
            /* @__PURE__ */ jsxs2(Text2, { color: isSelected ? theme.primary : void 0, bold: isSelected, children: [
              prefix,
              formattedName.padEnd(14)
            ] }),
            /* @__PURE__ */ jsxs2(Text2, { color: theme.muted, children: [
              " - ",
              cmd.description
            ] })
          ] }, cmd.name);
        })
      ]
    }
  );
};

// src/tui/components/stream-view.tsx
import { Box as Box3, Text as Text3 } from "ink";
import Spinner from "ink-spinner";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var StreamView = ({
  content,
  isStreaming,
  theme
}) => {
  if (!content && !isStreaming) {
    return null;
  }
  const lines = content.split("\n");
  let inCodeBlock = false;
  return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", marginY: 1, children: [
    lines.map((line, idx) => {
      if (line.trim().startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        return /* @__PURE__ */ jsx3(Text3, { color: theme.warning, dimColor: true, children: line }, idx);
      }
      if (inCodeBlock) {
        return /* @__PURE__ */ jsx3(Box3, { paddingLeft: 2, children: /* @__PURE__ */ jsx3(Text3, { color: "cyan", children: line }) }, idx);
      }
      if (line.startsWith("#")) {
        return /* @__PURE__ */ jsx3(Text3, { color: theme.primary, bold: true, children: line }, idx);
      }
      if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        return /* @__PURE__ */ jsxs3(Text3, { color: "white", children: [
          /* @__PURE__ */ jsx3(Text3, { color: theme.primary, children: " \u2022 " }),
          line.trim().slice(2)
        ] }, idx);
      }
      return /* @__PURE__ */ jsx3(Text3, { color: "white", children: line }, idx);
    }),
    isStreaming && /* @__PURE__ */ jsxs3(Box3, { marginTop: 1, flexDirection: "row", children: [
      /* @__PURE__ */ jsx3(Text3, { color: theme.primary, children: /* @__PURE__ */ jsx3(Spinner, { type: "dots" }) }),
      /* @__PURE__ */ jsx3(Text3, { color: theme.muted, children: " Gerando resposta..." })
    ] })
  ] });
};

// src/tui/components/model-selector.tsx
import { useState as useState3 } from "react";
import { Box as Box4, Text as Text4, useInput as useInput3 } from "ink";
import TextInput2 from "ink-text-input";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var ModelSelector = ({
  models,
  currentModel,
  onSelect,
  onClose,
  theme
}) => {
  const [selectedIndex, setSelectedIndex] = useState3(0);
  const [filterFreeOnly, setFilterFreeOnly] = useState3(false);
  const [searchQuery, setSearchQuery] = useState3("");
  const [isSearching, setIsSearching] = useState3(false);
  const filtered = models.filter((m) => {
    if (filterFreeOnly && !m.isFree) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return m.id.toLowerCase().includes(q) || m.name && m.name.toLowerCase().includes(q);
    }
    return true;
  });
  useInput3((input, key) => {
    if (key.escape) {
      if (isSearching) {
        setIsSearching(false);
        return;
      }
      onClose();
      return;
    }
    if (isSearching) {
      if (key.return) {
        setIsSearching(false);
      }
      return;
    }
    if (input.toLowerCase() === "s") {
      setIsSearching(true);
      return;
    }
    if (input.toLowerCase() === "f" || key.tab) {
      setFilterFreeOnly((prev) => !prev);
      setSelectedIndex(0);
      return;
    }
    if (filtered.length > 0) {
      if (key.upArrow) {
        setSelectedIndex((prev) => prev > 0 ? prev - 1 : filtered.length - 1);
      } else if (key.downArrow) {
        setSelectedIndex((prev) => prev < filtered.length - 1 ? prev + 1 : 0);
      } else if (key.return) {
        const selected = filtered[selectedIndex];
        if (selected) {
          onSelect(selected.id);
        }
      }
    }
  });
  const windowSize = 8;
  const windowStart = Math.max(0, Math.min(selectedIndex - 3, Math.max(0, filtered.length - windowSize)));
  const visibleModels = filtered.slice(windowStart, windowStart + windowSize);
  const selectedModelInfo = filtered[selectedIndex];
  return /* @__PURE__ */ jsxs4(
    Box4,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: theme.primary,
      paddingX: 1,
      marginY: 1,
      children: [
        /* @__PURE__ */ jsxs4(Box4, { justifyContent: "space-between", marginBottom: 1, children: [
          /* @__PURE__ */ jsxs4(Text4, { color: theme.primary, bold: true, children: [
            "\u2726 Cat\xE1logo Real de Modelos LLM (",
            filtered.length,
            " dispon\xEDveis)"
          ] }),
          /* @__PURE__ */ jsxs4(Box4, { flexDirection: "row", children: [
            /* @__PURE__ */ jsx4(Text4, { color: filterFreeOnly ? theme.success : theme.muted, children: filterFreeOnly ? "[Apenas Free/Gratuitos]" : "[Todos os Modelos]" }),
            /* @__PURE__ */ jsx4(Text4, { color: theme.muted, children: " | Esc para fechar" })
          ] })
        ] }),
        isSearching ? /* @__PURE__ */ jsxs4(Box4, { borderStyle: "single", borderColor: theme.primary, paddingX: 1, marginY: 0, children: [
          /* @__PURE__ */ jsx4(Text4, { color: theme.primary, bold: true, children: "Buscar: " }),
          /* @__PURE__ */ jsx4(
            TextInput2,
            {
              value: searchQuery,
              onChange: (val) => {
                setSearchQuery(val);
                setSelectedIndex(0);
              },
              onSubmit: () => setIsSearching(false),
              placeholder: "Digite parte do nome ou id do modelo..."
            }
          )
        ] }) : searchQuery && /* @__PURE__ */ jsx4(Box4, { marginBottom: 1, children: /* @__PURE__ */ jsxs4(Text4, { color: theme.secondary, children: [
          'Filtro de busca ativo: "',
          searchQuery,
          `" (Pressione 's' para alterar)`
        ] }) }),
        filtered.length === 0 ? /* @__PURE__ */ jsx4(Text4, { color: theme.muted, children: "Nenhum modelo encontrado para o filtro atual." }) : visibleModels.map((m, idx) => {
          const actualIdx = windowStart + idx;
          const isSelected = actualIdx === selectedIndex;
          const isCurrent = m.id === currentModel;
          const prefix = isSelected ? "\u25B6 " : "  ";
          const tag = m.isFree ? "[FREE]" : "[PAID]";
          const currentMarker = isCurrent ? " (atual)" : "";
          const ctx = m.contextLength ? ` (${(m.contextLength / 1e3).toFixed(0)}k ctx)` : "";
          return /* @__PURE__ */ jsxs4(Box4, { flexDirection: "row", children: [
            /* @__PURE__ */ jsxs4(Text4, { color: isSelected ? theme.primary : void 0, bold: isSelected, children: [
              prefix,
              m.id
            ] }),
            /* @__PURE__ */ jsxs4(Text4, { color: m.isFree ? theme.success : theme.muted, children: [
              " ",
              tag
            ] }),
            /* @__PURE__ */ jsx4(Text4, { color: theme.muted, children: ctx }),
            /* @__PURE__ */ jsx4(Text4, { color: theme.secondary, children: currentMarker })
          ] }, m.id);
        }),
        selectedModelInfo && /* @__PURE__ */ jsxs4(
          Box4,
          {
            marginTop: 1,
            borderStyle: "single",
            borderColor: theme.border,
            paddingX: 1,
            flexDirection: "column",
            children: [
              /* @__PURE__ */ jsxs4(Text4, { color: theme.primary, bold: true, children: [
                selectedModelInfo.name || selectedModelInfo.id,
                " ",
                selectedModelInfo.isFree ? "\u2022 Gratuito" : "\u2022 Pago"
              ] }),
              selectedModelInfo.description && /* @__PURE__ */ jsx4(Text4, { color: theme.muted, children: selectedModelInfo.description.slice(0, 160) })
            ]
          }
        ),
        /* @__PURE__ */ jsx4(Box4, { marginTop: 1, justifyContent: "space-between", children: /* @__PURE__ */ jsxs4(Text4, { color: theme.muted, children: [
          "Navegue \u2191/\u2193 (",
          filtered.length > 0 ? selectedIndex + 1 : 0,
          "/",
          filtered.length,
          ") \u2022 Enter seleciona \u2022 'f' alterna Free \u2022 's' busca"
        ] }) })
      ]
    }
  );
};

// src/tui/components/confirm-dialog.tsx
import { Box as Box5, Text as Text5, useInput as useInput4 } from "ink";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var ConfirmDialog = ({
  toolName,
  category,
  args,
  onDecision,
  theme
}) => {
  useInput4((input) => {
    const key = input.toLowerCase();
    if (key === "y" || key === "s") {
      onDecision("yes");
    } else if (key === "n") {
      onDecision("no");
    } else if (key === "a") {
      onDecision("always");
    }
  });
  const formattedArgs = JSON.stringify(args, null, 2);
  return /* @__PURE__ */ jsxs5(
    Box5,
    {
      flexDirection: "column",
      borderStyle: "double",
      borderColor: theme.warning,
      paddingX: 1,
      marginY: 1,
      children: [
        /* @__PURE__ */ jsx5(Text5, { color: theme.warning, bold: true, children: "\u26A0 Solicita\xE7\xE3o de Confirma\xE7\xE3o de Seguran\xE7a" }),
        /* @__PURE__ */ jsxs5(Box5, { marginY: 1, flexDirection: "column", children: [
          /* @__PURE__ */ jsxs5(Text5, { children: [
            "O agente deseja executar a ferramenta: ",
            /* @__PURE__ */ jsx5(Text5, { color: theme.primary, bold: true, children: toolName }),
            " (Categoria: ",
            category,
            ")"
          ] }),
          /* @__PURE__ */ jsx5(Text5, { color: theme.muted, children: "Argumentos:" }),
          /* @__PURE__ */ jsx5(Text5, { color: "cyan", children: formattedArgs })
        ] }),
        /* @__PURE__ */ jsxs5(Box5, { flexDirection: "row", children: [
          /* @__PURE__ */ jsx5(Text5, { bold: true, children: "Pressione: " }),
          /* @__PURE__ */ jsx5(Text5, { color: theme.success, bold: true, children: "[Y] Sim " }),
          /* @__PURE__ */ jsx5(Text5, { color: theme.error, bold: true, children: "[N] N\xE3o " }),
          /* @__PURE__ */ jsx5(Text5, { color: theme.primary, bold: true, children: "[A] Sempre aprovar nesta sess\xE3o" })
        ] })
      ]
    }
  );
};

// src/tui/components/config-wizard.tsx
import { useState as useState4, useEffect as useEffect2 } from "react";
import { Box as Box6, Text as Text6, useInput as useInput5 } from "ink";
import TextInput3 from "ink-text-input";
import Spinner2 from "ink-spinner";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var PROVIDERS = [
  {
    name: "openrouter",
    label: "OpenRouter",
    url: "https://openrouter.ai/api/v1",
    description: "Acesso a centenas de modelos, incluindo modelos :free gratuitos"
  },
  {
    name: "ollama",
    label: "Ollama Local",
    url: "http://localhost:11434/v1",
    description: "100% gratuito e offline em http://localhost:11434 (sem API key)"
  },
  {
    name: "groq",
    label: "Groq Cloud",
    url: "https://api.groq.com/openai/v1",
    description: "Infer\xEAncia ultra-r\xE1pida LPU com tier gratuito"
  },
  {
    name: "custom",
    label: "OpenAPI Customizado",
    url: "http://localhost:8000/v1",
    description: "Provedor personalizado compat\xEDvel com OpenAPI / OpenAI"
  }
];
var ConfigWizard = ({
  currentProvider,
  currentModel,
  theme,
  onSave,
  onClose
}) => {
  const [step, setStep] = useState4(1);
  const [providerIndex, setProviderIndex] = useState4(() => {
    const idx = PROVIDERS.findIndex((p) => p.name === currentProvider);
    return idx >= 0 ? idx : 0;
  });
  const [baseUrl, setBaseUrl] = useState4(PROVIDERS[0].url);
  const [apiKey, setApiKey] = useState4("");
  const [testing, setTesting] = useState4(false);
  const [testError, setTestError] = useState4(null);
  const [fetchedModels, setFetchedModels] = useState4([]);
  const [modelIndex, setModelIndex] = useState4(0);
  useEffect2(() => {
    setBaseUrl(PROVIDERS[providerIndex].url);
  }, [providerIndex]);
  const runConnectionTest = async () => {
    setTesting(true);
    setTestError(null);
    const providerObj = PROVIDERS[providerIndex];
    const catalog = new ModelCatalog({
      baseUrl,
      apiKey: apiKey || (providerObj.name === "ollama" ? "ollama" : ""),
      providerName: providerObj.name
    });
    try {
      const res = await catalog.testConnectionAndFetchModels();
      if (!res.success) {
        setTestError(res.error || "Falha de conex\xE3o com o provedor.");
        setTesting(false);
      } else {
        setFetchedModels(res.models);
        setModelIndex(0);
        setTesting(false);
        setStep(5);
      }
    } catch (err) {
      setTestError(err.message);
      setTesting(false);
    }
  };
  useInput5((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (step === 1) {
      if (key.upArrow) {
        setProviderIndex((prev) => prev > 0 ? prev - 1 : PROVIDERS.length - 1);
      } else if (key.downArrow) {
        setProviderIndex((prev) => prev < PROVIDERS.length - 1 ? prev + 1 : 0);
      } else if (key.return) {
        setStep(2);
      }
      return;
    }
    if (step === 4) {
      if (testError) {
        if (input.toLowerCase() === "r") {
          runConnectionTest();
        } else if (input.toLowerCase() === "c") {
          setStep(3);
        } else if (key.return) {
          const catalog = new ModelCatalog({
            baseUrl,
            apiKey,
            providerName: PROVIDERS[providerIndex].name
          });
          setFetchedModels(catalog.getFallbackModels());
          setModelIndex(0);
          setStep(5);
        }
      }
      return;
    }
    if (step === 5) {
      if (key.upArrow) {
        setModelIndex((prev) => prev > 0 ? prev - 1 : fetchedModels.length - 1);
      } else if (key.downArrow) {
        setModelIndex((prev) => prev < fetchedModels.length - 1 ? prev + 1 : 0);
      } else if (key.return) {
        const selected = fetchedModels[modelIndex]?.id || currentModel;
        onSave({
          provider: PROVIDERS[providerIndex].name,
          baseUrl,
          apiKey: apiKey || (PROVIDERS[providerIndex].name === "ollama" ? "ollama" : ""),
          model: selected
        });
      }
    }
  });
  return /* @__PURE__ */ jsxs6(
    Box6,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: theme.primary,
      paddingX: 1,
      marginY: 1,
      children: [
        /* @__PURE__ */ jsxs6(Box6, { justifyContent: "space-between", marginBottom: 1, children: [
          /* @__PURE__ */ jsxs6(Text6, { color: theme.primary, bold: true, children: [
            "\u2726 Assistente de Configura\xE7\xE3o por Etapas (Etapa ",
            step,
            " de 5)"
          ] }),
          /* @__PURE__ */ jsx6(Text6, { color: theme.muted, children: "[Esc para Cancelar]" })
        ] }),
        step === 1 && /* @__PURE__ */ jsxs6(Box6, { flexDirection: "column", children: [
          /* @__PURE__ */ jsx6(Text6, { bold: true, color: theme.secondary, children: "Etapa 1: Escolha o Provedor OpenAPI (Navegue com \u2191/\u2193 e confirme com Enter):" }),
          PROVIDERS.map((p, idx) => {
            const isSelected = idx === providerIndex;
            return /* @__PURE__ */ jsx6(Box6, { flexDirection: "column", marginY: 0, children: /* @__PURE__ */ jsxs6(Box6, { flexDirection: "row", children: [
              /* @__PURE__ */ jsxs6(Text6, { color: isSelected ? theme.primary : void 0, bold: isSelected, children: [
                isSelected ? "\u25B6 " : "  ",
                p.label.padEnd(20)
              ] }),
              /* @__PURE__ */ jsxs6(Text6, { color: theme.muted, children: [
                "- ",
                p.description
              ] })
            ] }) }, p.name);
          })
        ] }),
        step === 2 && /* @__PURE__ */ jsxs6(Box6, { flexDirection: "column", children: [
          /* @__PURE__ */ jsx6(Text6, { bold: true, color: theme.secondary, children: "Etapa 2: URL Base da API do Provedor:" }),
          /* @__PURE__ */ jsx6(Text6, { color: theme.muted, children: "Pressione Enter para confirmar a URL ou digite para alterar:" }),
          /* @__PURE__ */ jsx6(Box6, { borderStyle: "single", borderColor: theme.border, marginY: 1, paddingX: 1, children: /* @__PURE__ */ jsx6(
            TextInput3,
            {
              value: baseUrl,
              onChange: setBaseUrl,
              onSubmit: () => setStep(3)
            }
          ) }),
          /* @__PURE__ */ jsx6(Text6, { color: theme.muted, children: "Pressione Enter para prosseguir para a chave de API." })
        ] }),
        step === 3 && /* @__PURE__ */ jsxs6(Box6, { flexDirection: "column", children: [
          /* @__PURE__ */ jsxs6(Text6, { bold: true, color: theme.secondary, children: [
            "Etapa 3: Chave de API (API Key) para '",
            PROVIDERS[providerIndex].label,
            "':"
          ] }),
          PROVIDERS[providerIndex].name === "ollama" ? /* @__PURE__ */ jsx6(Text6, { color: theme.success, children: "\u2714 Ollama local n\xE3o requer chave. Pressione Enter para testar conex\xE3o." }) : /* @__PURE__ */ jsx6(Text6, { color: theme.muted, children: "Digite ou cole sua chave de API abaixo:" }),
          /* @__PURE__ */ jsx6(Box6, { borderStyle: "single", borderColor: theme.border, marginY: 1, paddingX: 1, children: /* @__PURE__ */ jsx6(
            TextInput3,
            {
              value: apiKey,
              onChange: setApiKey,
              mask: "*",
              onSubmit: () => {
                setStep(4);
                runConnectionTest();
              }
            }
          ) }),
          /* @__PURE__ */ jsx6(Text6, { color: theme.muted, children: "Pressione Enter para testar a conex\xE3o com o provedor." })
        ] }),
        step === 4 && /* @__PURE__ */ jsxs6(Box6, { flexDirection: "column", marginY: 1, children: [
          testing && /* @__PURE__ */ jsx6(Box6, { flexDirection: "row", children: /* @__PURE__ */ jsxs6(Text6, { color: theme.warning, children: [
            /* @__PURE__ */ jsx6(Spinner2, { type: "dots" }),
            " Testando conex\xE3o real com ",
            baseUrl,
            "..."
          ] }) }),
          !testing && testError && /* @__PURE__ */ jsxs6(Box6, { flexDirection: "column", children: [
            /* @__PURE__ */ jsx6(Text6, { color: theme.error, bold: true, children: "\u2716 Falha na conex\xE3o ou autentica\xE7\xE3o:" }),
            /* @__PURE__ */ jsx6(Text6, { color: theme.error, children: testError }),
            /* @__PURE__ */ jsxs6(Box6, { marginTop: 1, flexDirection: "column", children: [
              /* @__PURE__ */ jsxs6(Text6, { color: theme.primary, children: [
                "\u2022 Pressione ",
                /* @__PURE__ */ jsx6(Text6, { bold: true, children: "'r'" }),
                " para tentar novamente."
              ] }),
              /* @__PURE__ */ jsxs6(Text6, { color: theme.secondary, children: [
                "\u2022 Pressione ",
                /* @__PURE__ */ jsx6(Text6, { bold: true, children: "'c'" }),
                " para corrigir a chave de API."
              ] }),
              /* @__PURE__ */ jsxs6(Text6, { color: theme.muted, children: [
                "\u2022 Pressione ",
                /* @__PURE__ */ jsx6(Text6, { bold: true, children: "Enter" }),
                " para ignorar e salvar assim mesmo."
              ] })
            ] })
          ] })
        ] }),
        step === 5 && /* @__PURE__ */ jsxs6(Box6, { flexDirection: "column", children: [
          /* @__PURE__ */ jsxs6(Box6, { justifyContent: "space-between", children: [
            /* @__PURE__ */ jsx6(Text6, { bold: true, color: theme.secondary, children: "Etapa 5: Selecione o Modelo Padr\xE3o (Enter para salvar):" }),
            /* @__PURE__ */ jsxs6(Text6, { color: theme.success, children: [
              "\u2714 ",
              fetchedModels.length,
              " modelos liberados encontrados"
            ] })
          ] }),
          /* @__PURE__ */ jsx6(Box6, { flexDirection: "column", marginY: 1, children: fetchedModels.slice(Math.max(0, modelIndex - 4), modelIndex + 5).map((m, idx) => {
            const actualIdx = Math.max(0, modelIndex - 4) + idx;
            const isSelected = actualIdx === modelIndex;
            const tag = m.isFree ? "[FREE]" : "[PAID]";
            return /* @__PURE__ */ jsxs6(Box6, { flexDirection: "row", children: [
              /* @__PURE__ */ jsxs6(Text6, { color: isSelected ? theme.primary : void 0, bold: isSelected, children: [
                isSelected ? "\u25B6 " : "  ",
                m.id
              ] }),
              /* @__PURE__ */ jsxs6(Text6, { color: m.isFree ? theme.success : theme.muted, children: [
                " ",
                tag
              ] })
            ] }, m.id);
          }) }),
          /* @__PURE__ */ jsxs6(Text6, { color: theme.muted, children: [
            "Navegue com \u2191/\u2193 (",
            modelIndex + 1,
            "/",
            fetchedModels.length,
            "). Pressione Enter para concluir e salvar."
          ] })
        ] })
      ]
    }
  );
};

// src/tui/components/permissions-modal.tsx
import { useState as useState5 } from "react";
import { Box as Box7, Text as Text7, useInput as useInput6 } from "ink";
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var MODES = [
  {
    id: "auto-safe",
    title: "auto-safe (Recomendado)",
    description: "Leituras s\xE3o autom\xE1ticas. Pede confirma\xE7\xE3o para modifica\xE7\xF5es de arquivos e comandos shell."
  },
  {
    id: "ask",
    title: "ask (Estrito)",
    description: "Sempre pede autoriza\xE7\xE3o antes de executar ferramentas sens\xEDveis, escritas e comandos."
  },
  {
    id: "always-allow",
    title: "always-allow (Livre / Perigoso)",
    description: "Permite todas as opera\xE7\xF5es de arquivos e shell automaticamente sem pedir confirma\xE7\xE3o."
  }
];
var PermissionsModal = ({
  currentMode,
  theme,
  onSelectMode,
  onClose
}) => {
  const [selectedIndex, setSelectedIndex] = useState5(() => {
    const idx = MODES.findIndex((m) => m.id === currentMode);
    return idx >= 0 ? idx : 0;
  });
  useInput6((_, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((prev) => prev > 0 ? prev - 1 : MODES.length - 1);
    } else if (key.downArrow) {
      setSelectedIndex((prev) => prev < MODES.length - 1 ? prev + 1 : 0);
    } else if (key.return) {
      onSelectMode(MODES[selectedIndex].id);
    }
  });
  return /* @__PURE__ */ jsxs7(
    Box7,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: theme.primary,
      paddingX: 1,
      marginY: 1,
      children: [
        /* @__PURE__ */ jsxs7(Box7, { justifyContent: "space-between", marginBottom: 1, children: [
          /* @__PURE__ */ jsx7(Text7, { color: theme.primary, bold: true, children: "\u2726 Gerenciamento de Permiss\xF5es de Execu\xE7\xE3o" }),
          /* @__PURE__ */ jsx7(Text7, { color: theme.muted, children: "[Esc para Fechar]" })
        ] }),
        /* @__PURE__ */ jsx7(Box7, { marginBottom: 1, children: /* @__PURE__ */ jsx7(Text7, { color: theme.secondary, bold: true, children: "Selecione o n\xEDvel de permiss\xE3o (Navegue com \u2191/\u2193 e confirme com Enter):" }) }),
        MODES.map((m, idx) => {
          const isSelected = idx === selectedIndex;
          const isCurrent = m.id === currentMode;
          return /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", marginY: 0, children: [
            /* @__PURE__ */ jsxs7(Box7, { flexDirection: "row", children: [
              /* @__PURE__ */ jsxs7(Text7, { color: isSelected ? theme.primary : void 0, bold: isSelected, children: [
                isSelected ? "\u25B6 " : "  ",
                m.title
              ] }),
              isCurrent && /* @__PURE__ */ jsx7(Text7, { color: theme.success, children: " (ativo)" })
            ] }),
            /* @__PURE__ */ jsx7(Box7, { paddingLeft: 4, children: /* @__PURE__ */ jsxs7(Text7, { color: theme.muted, children: [
              "\u21B3 ",
              m.description
            ] }) })
          ] }, m.id);
        }),
        /* @__PURE__ */ jsx7(Box7, { marginTop: 1, children: /* @__PURE__ */ jsx7(Text7, { color: theme.muted, children: "Enter para confirmar novo modo de permiss\xE3o \u2022 Esc para cancelar" }) })
      ]
    }
  );
};

// src/tui/components/skills-modal.tsx
import { useState as useState6, useEffect as useEffect3 } from "react";
import { Box as Box8, Text as Text8, useInput as useInput7 } from "ink";
import Spinner3 from "ink-spinner";
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
var SkillsModal = ({
  skillManager,
  theme,
  onToggleSkill,
  onClose
}) => {
  const [skills, setSkills] = useState6([]);
  const [loading, setLoading] = useState6(true);
  const [selectedIndex, setSelectedIndex] = useState6(0);
  useEffect3(() => {
    skillManager.discoverSkills().then((discovered) => {
      setSkills(discovered);
      setLoading(false);
    });
  }, [skillManager]);
  useInput7((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (skills.length === 0) return;
    if (key.upArrow) {
      setSelectedIndex((prev) => prev > 0 ? prev - 1 : skills.length - 1);
    } else if (key.downArrow) {
      setSelectedIndex((prev) => prev < skills.length - 1 ? prev + 1 : 0);
    } else if (key.return || input === " ") {
      const selected = skills[selectedIndex];
      if (selected) {
        onToggleSkill(selected.name);
        setSkills(
          (prev) => prev.map(
            (s, idx) => idx === selectedIndex ? { ...s, isActive: !s.isActive } : s
          )
        );
      }
    }
  });
  const selectedSkill = skills[selectedIndex];
  return /* @__PURE__ */ jsxs8(
    Box8,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: theme.primary,
      paddingX: 1,
      marginY: 1,
      children: [
        /* @__PURE__ */ jsxs8(Box8, { justifyContent: "space-between", marginBottom: 1, children: [
          /* @__PURE__ */ jsx8(Text8, { color: theme.primary, bold: true, children: "\u2726 Cat\xE1logo de Skills (SKILL.md)" }),
          /* @__PURE__ */ jsx8(Text8, { color: theme.muted, children: "[Esc para Fechar]" })
        ] }),
        loading && /* @__PURE__ */ jsx8(Box8, { flexDirection: "row", children: /* @__PURE__ */ jsxs8(Text8, { color: theme.warning, children: [
          /* @__PURE__ */ jsx8(Spinner3, { type: "dots" }),
          " Buscando skills nos diret\xF3rios locais e globais..."
        ] }) }),
        !loading && skills.length === 0 && /* @__PURE__ */ jsxs8(Box8, { flexDirection: "column", children: [
          /* @__PURE__ */ jsx8(Text8, { color: theme.muted, children: "Nenhuma skill encontrada (.skills/, skills/, ~/.gemini/config/plugins/.../skills/)." }),
          /* @__PURE__ */ jsx8(Text8, { color: theme.secondary, children: "Voc\xEA pode criar um arquivo SKILL.md dentro de .skills/nome-da-skill/ para definir instru\xE7\xF5es personalizadas." })
        ] }),
        !loading && skills.length > 0 && /* @__PURE__ */ jsxs8(Box8, { flexDirection: "column", children: [
          /* @__PURE__ */ jsx8(Box8, { marginBottom: 1, children: /* @__PURE__ */ jsx8(Text8, { color: theme.secondary, bold: true, children: "Selecione uma skill (Espa\xE7o ou Enter para ativar/desativar):" }) }),
          skills.slice(Math.max(0, selectedIndex - 4), selectedIndex + 5).map((s, idx) => {
            const actualIdx = Math.max(0, selectedIndex - 4) + idx;
            const isSelected = actualIdx === selectedIndex;
            const statusTag = s.isActive ? "[ATIVA]" : "[INATIVA]";
            return /* @__PURE__ */ jsxs8(Box8, { flexDirection: "row", children: [
              /* @__PURE__ */ jsxs8(Text8, { color: isSelected ? theme.primary : void 0, bold: isSelected, children: [
                isSelected ? "\u25B6 " : "  ",
                s.name.padEnd(26)
              ] }),
              /* @__PURE__ */ jsxs8(Text8, { color: s.isActive ? theme.success : theme.muted, children: [
                " ",
                statusTag,
                " "
              ] }),
              /* @__PURE__ */ jsxs8(Text8, { color: theme.muted, children: [
                " - ",
                s.description.slice(0, 50)
              ] })
            ] }, s.name);
          }),
          selectedSkill && /* @__PURE__ */ jsxs8(
            Box8,
            {
              marginTop: 1,
              borderStyle: "single",
              borderColor: theme.border,
              paddingX: 1,
              flexDirection: "column",
              children: [
                /* @__PURE__ */ jsxs8(Text8, { bold: true, color: theme.primary, children: [
                  "Skill: ",
                  selectedSkill.name,
                  " (",
                  selectedSkill.isActive ? "Ativa no Agente" : "Inativa",
                  ")"
                ] }),
                /* @__PURE__ */ jsxs8(Text8, { color: theme.secondary, children: [
                  "Caminho: ",
                  selectedSkill.filePath
                ] }),
                /* @__PURE__ */ jsxs8(Text8, { color: theme.muted, children: [
                  selectedSkill.content.slice(0, 200),
                  "..."
                ] })
              ]
            }
          ),
          /* @__PURE__ */ jsx8(Box8, { marginTop: 1, children: /* @__PURE__ */ jsxs8(Text8, { color: theme.muted, children: [
            "Navegue com \u2191/\u2193 (",
            selectedIndex + 1,
            "/",
            skills.length,
            ") \u2022 Espa\xE7o/Enter para alternar \u2022 Esc para sair"
          ] }) })
        ] })
      ]
    }
  );
};

// src/tui/components/plugins-modal.tsx
import { useState as useState7 } from "react";
import { Box as Box9, Text as Text9, useInput as useInput8 } from "ink";
import TextInput4 from "ink-text-input";
import { jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
var PluginsModal = ({
  pluginLoader,
  theme,
  onClose
}) => {
  const [plugins, setPlugins] = useState7(() => pluginLoader.getLoadedPlugins());
  const [selectedIndex, setSelectedIndex] = useState7(0);
  const [isInstalling, setIsInstalling] = useState7(false);
  const [installPath, setInstallPath] = useState7("");
  const [statusMessage, setStatusMessage] = useState7(null);
  const handleInstallSubmit = async (pathInput) => {
    if (!pathInput.trim()) {
      setIsInstalling(false);
      return;
    }
    setStatusMessage("Instalando plugin...");
    const res = await pluginLoader.installPlugin(pathInput.trim());
    if (res.success) {
      setStatusMessage(`\u2714 ${res.message}`);
      setPlugins(pluginLoader.getLoadedPlugins());
      setIsInstalling(false);
      setInstallPath("");
    } else {
      setStatusMessage(`\u2716 ${res.message}`);
    }
  };
  useInput8((input, key) => {
    if (key.escape) {
      if (isInstalling) {
        setIsInstalling(false);
        return;
      }
      onClose();
      return;
    }
    if (isInstalling) {
      return;
    }
    if (input.toLowerCase() === "i") {
      setIsInstalling(true);
      setStatusMessage(null);
      return;
    }
    if (plugins.length > 0) {
      if (key.upArrow) {
        setSelectedIndex((prev) => prev > 0 ? prev - 1 : plugins.length - 1);
      } else if (key.downArrow) {
        setSelectedIndex((prev) => prev < plugins.length - 1 ? prev + 1 : 0);
      }
    }
  });
  return /* @__PURE__ */ jsxs9(
    Box9,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: theme.primary,
      paddingX: 1,
      marginY: 1,
      children: [
        /* @__PURE__ */ jsxs9(Box9, { justifyContent: "space-between", marginBottom: 1, children: [
          /* @__PURE__ */ jsx9(Text9, { color: theme.primary, bold: true, children: "\u2726 Plugins & Extens\xF5es Compat\xEDveis (Claude Code / Gemini CLI)" }),
          /* @__PURE__ */ jsx9(Text9, { color: theme.muted, children: "[Esc para Fechar]" })
        ] }),
        statusMessage && /* @__PURE__ */ jsx9(Box9, { marginY: 0, children: /* @__PURE__ */ jsx9(Text9, { color: statusMessage.startsWith("\u2714") ? theme.success : theme.error, children: statusMessage }) }),
        isInstalling ? /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", marginY: 1, children: [
          /* @__PURE__ */ jsx9(Text9, { bold: true, color: theme.secondary, children: "Instalar Plugin a partir de Diret\xF3rio Local ou Pacote:" }),
          /* @__PURE__ */ jsx9(Text9, { color: theme.muted, children: "Digite o caminho da pasta com o plugin (ou Esc para cancelar):" }),
          /* @__PURE__ */ jsx9(Box9, { borderStyle: "single", borderColor: theme.border, paddingX: 1, marginY: 1, children: /* @__PURE__ */ jsx9(
            TextInput4,
            {
              value: installPath,
              onChange: setInstallPath,
              onSubmit: handleInstallSubmit,
              placeholder: "./meu-plugin ou /caminho/para/plugin"
            }
          ) })
        ] }) : /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", children: [
          plugins.length === 0 ? /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", marginY: 1, children: [
            /* @__PURE__ */ jsx9(Text9, { color: theme.muted, children: "Nenhum plugin instalado em .cli/plugins/ ou diret\xF3rios compat\xEDveis." }),
            /* @__PURE__ */ jsx9(Text9, { color: theme.secondary, children: "Pressione 'i' para instalar um plugin a partir de um caminho local." })
          ] }) : /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", marginY: 1, children: [
            /* @__PURE__ */ jsxs9(Text9, { bold: true, color: theme.secondary, children: [
              "Plugins Instalados (",
              plugins.length,
              "):"
            ] }),
            plugins.map((p, idx) => {
              const isSelected = idx === selectedIndex;
              return /* @__PURE__ */ jsxs9(Box9, { flexDirection: "row", children: [
                /* @__PURE__ */ jsxs9(Text9, { color: isSelected ? theme.primary : void 0, bold: isSelected, children: [
                  isSelected ? "\u25B6 " : "  ",
                  p.name,
                  " (v",
                  p.version,
                  ")"
                ] }),
                p.description && /* @__PURE__ */ jsxs9(Text9, { color: theme.muted, children: [
                  " - ",
                  p.description
                ] })
              ] }, p.name);
            })
          ] }),
          /* @__PURE__ */ jsx9(Box9, { marginTop: 1, children: /* @__PURE__ */ jsxs9(Text9, { color: theme.muted, children: [
            "Pressione ",
            /* @__PURE__ */ jsx9(Text9, { color: theme.primary, bold: true, children: "'i'" }),
            " para instalar novo plugin \u2022 Esc para sair"
          ] }) })
        ] })
      ]
    }
  );
};

// src/tui/components/subagents-modal.tsx
import { useState as useState8, useEffect as useEffect4 } from "react";
import { Box as Box10, Text as Text10, useInput as useInput9 } from "ink";
import { jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
var SubagentsModal = ({
  subagentManager,
  theme,
  onClose
}) => {
  const [tasks, setTasks] = useState8(() => subagentManager.getAllSubagents());
  const [selectedIndex, setSelectedIndex] = useState8(0);
  useEffect4(() => {
    const unsubscribe = subagentManager.subscribe(() => {
      setTasks(subagentManager.getAllSubagents());
    });
    return unsubscribe;
  }, [subagentManager]);
  useInput9((input, key) => {
    if (key.escape || input === "q" || input === "Q") {
      onClose();
      return;
    }
    if (tasks.length === 0) return;
    if (key.upArrow) {
      setSelectedIndex((prev) => prev > 0 ? prev - 1 : tasks.length - 1);
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => prev < tasks.length - 1 ? prev + 1 : 0);
    }
  });
  const selectedTask = tasks[selectedIndex];
  return /* @__PURE__ */ jsxs10(
    Box10,
    {
      flexDirection: "column",
      borderStyle: "double",
      borderColor: theme.primary,
      paddingX: 1,
      paddingY: 1,
      marginY: 1,
      children: [
        /* @__PURE__ */ jsxs10(Box10, { justifyContent: "space-between", marginBottom: 1, children: [
          /* @__PURE__ */ jsx10(Text10, { color: theme.primary, bold: true, children: "\u26A1 Monitor de Subagentes em Segundo Plano (Real-time)" }),
          /* @__PURE__ */ jsx10(Text10, { color: theme.muted, children: "Pressione [Esc] ou [Q] para fechar" })
        ] }),
        tasks.length === 0 ? /* @__PURE__ */ jsx10(Box10, { marginY: 1, children: /* @__PURE__ */ jsx10(Text10, { color: theme.muted, children: "Nenhum subagente em execu\xE7\xE3o. O agente principal pode iniciar tarefas paralelas via 'spawn_subagent'." }) }) : /* @__PURE__ */ jsxs10(Box10, { flexDirection: "column", children: [
          /* @__PURE__ */ jsx10(Box10, { marginBottom: 1, children: /* @__PURE__ */ jsxs10(Text10, { color: theme.secondary, bold: true, children: [
            "Subagentes Ativos/Conclu\xEDdos (",
            tasks.length,
            "):"
          ] }) }),
          /* @__PURE__ */ jsxs10(Box10, { flexDirection: "row", children: [
            /* @__PURE__ */ jsx10(Box10, { flexDirection: "column", width: "45%", paddingRight: 1, children: tasks.map((t, idx) => {
              const isSelected = idx === selectedIndex;
              let statusColor = theme.muted;
              if (t.status === "running") statusColor = theme.warning;
              if (t.status === "completed") statusColor = theme.success;
              if (t.status === "failed") statusColor = theme.error;
              return /* @__PURE__ */ jsx10(Box10, { children: /* @__PURE__ */ jsxs10(Text10, { color: isSelected ? theme.primary : void 0, bold: isSelected, children: [
                isSelected ? "\u25B6 " : "  ",
                /* @__PURE__ */ jsxs10(Text10, { color: statusColor, children: [
                  "[",
                  t.status.toUpperCase(),
                  "]"
                ] }),
                " ",
                t.name.slice(0, 18),
                " (",
                (t.elapsedMs / 1e3).toFixed(0),
                "s)"
              ] }) }, t.id);
            }) }),
            selectedTask && /* @__PURE__ */ jsxs10(
              Box10,
              {
                flexDirection: "column",
                width: "55%",
                borderStyle: "single",
                borderColor: theme.muted,
                paddingX: 1,
                children: [
                  /* @__PURE__ */ jsxs10(Text10, { bold: true, color: theme.primary, children: [
                    selectedTask.name,
                    " (",
                    selectedTask.id,
                    ")"
                  ] }),
                  /* @__PURE__ */ jsxs10(Text10, { color: theme.muted, children: [
                    "Iniciado: ",
                    new Date(selectedTask.startedAt).toLocaleTimeString()
                  ] }),
                  /* @__PURE__ */ jsxs10(Text10, { color: theme.muted, children: [
                    "Prompt: ",
                    selectedTask.prompt.slice(0, 80),
                    "..."
                  ] }),
                  /* @__PURE__ */ jsxs10(Box10, { marginY: 1, flexDirection: "column", children: [
                    /* @__PURE__ */ jsx10(Text10, { color: theme.secondary, bold: true, children: "Logs em tempo real:" }),
                    selectedTask.logs.slice(-5).map((log, lIdx) => /* @__PURE__ */ jsx10(Text10, { color: theme.muted, children: log }, lIdx))
                  ] }),
                  selectedTask.result && /* @__PURE__ */ jsxs10(Box10, { flexDirection: "column", marginTop: 1, children: [
                    /* @__PURE__ */ jsx10(Text10, { color: theme.success, bold: true, children: "Resultado:" }),
                    /* @__PURE__ */ jsxs10(Text10, { children: [
                      selectedTask.result.slice(0, 200),
                      "..."
                    ] })
                  ] }),
                  selectedTask.error && /* @__PURE__ */ jsxs10(Box10, { flexDirection: "column", marginTop: 1, children: [
                    /* @__PURE__ */ jsx10(Text10, { color: theme.error, bold: true, children: "Erro:" }),
                    /* @__PURE__ */ jsx10(Text10, { color: theme.error, children: selectedTask.error })
                  ] })
                ]
              }
            )
          ] })
        ] })
      ]
    }
  );
};

// src/tui/components/sessions-modal.tsx
import { useState as useState9 } from "react";
import { Box as Box11, Text as Text11, useInput as useInput10 } from "ink";
import { jsx as jsx11, jsxs as jsxs11 } from "react/jsx-runtime";
var SessionsModal = ({
  sessionManager,
  currentSessionId,
  theme,
  onResume,
  onClose
}) => {
  const [sessions, setSessions] = useState9(() => sessionManager.listSessions());
  const [selectedIndex, setSelectedIndex] = useState9(0);
  useInput10((input, key) => {
    if (key.escape || input === "q" || input === "Q") {
      onClose();
      return;
    }
    if (sessions.length === 0) return;
    if (key.upArrow) {
      setSelectedIndex((prev) => prev > 0 ? prev - 1 : sessions.length - 1);
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => prev < sessions.length - 1 ? prev + 1 : 0);
    }
    if (key.return) {
      const selected = sessions[selectedIndex];
      if (selected) {
        onResume(selected.id);
      }
    }
    if (input === "d" || input === "D") {
      const selected = sessions[selectedIndex];
      if (selected && selected.id !== currentSessionId) {
        sessionManager.deleteSession(selected.id);
        const updated = sessionManager.listSessions();
        setSessions(updated);
        setSelectedIndex((prev) => Math.min(prev, Math.max(0, updated.length - 1)));
      }
    }
  });
  return /* @__PURE__ */ jsxs11(
    Box11,
    {
      flexDirection: "column",
      borderStyle: "double",
      borderColor: theme.primary,
      paddingX: 1,
      paddingY: 1,
      marginY: 1,
      children: [
        /* @__PURE__ */ jsxs11(Box11, { justifyContent: "space-between", marginBottom: 1, children: [
          /* @__PURE__ */ jsx11(Text11, { color: theme.primary, bold: true, children: "\u{1F4C1} Hist\xF3rico de Sess\xF5es Anteriores Salvas" }),
          /* @__PURE__ */ jsx11(Text11, { color: theme.muted, children: "[Enter] Retomar \u2022 [D] Excluir \u2022 [Esc] Fechar" })
        ] }),
        sessions.length === 0 ? /* @__PURE__ */ jsx11(Box11, { marginY: 1, children: /* @__PURE__ */ jsx11(Text11, { color: theme.muted, children: "Nenhuma sess\xE3o anterior gravada em disco." }) }) : /* @__PURE__ */ jsxs11(Box11, { flexDirection: "column", children: [
          /* @__PURE__ */ jsxs11(Box11, { justifyContent: "space-between", marginBottom: 1, children: [
            /* @__PURE__ */ jsx11(Text11, { color: theme.muted, children: "Selecione uma sess\xE3o anterior para retomar todo o hist\xF3rico:" }),
            /* @__PURE__ */ jsxs11(Text11, { color: theme.secondary, children: [
              "Total: ",
              sessions.length,
              " sess\xF5es"
            ] })
          ] }),
          sessions.map((s, idx) => {
            const isSelected = idx === selectedIndex;
            const isCurrent = s.id === currentSessionId;
            const dateStr = new Date(s.updatedAt).toLocaleString();
            return /* @__PURE__ */ jsxs11(Box11, { justifyContent: "space-between", marginY: 0, children: [
              /* @__PURE__ */ jsx11(Box11, { children: /* @__PURE__ */ jsxs11(Text11, { color: isSelected ? theme.primary : void 0, bold: isSelected, children: [
                isSelected ? "\u25B6 " : "  ",
                /* @__PURE__ */ jsx11(Text11, { bold: true, children: s.title.slice(0, 35) }),
                isCurrent && /* @__PURE__ */ jsx11(Text11, { color: theme.warning, children: " (atual)" })
              ] }) }),
              /* @__PURE__ */ jsx11(Box11, { children: /* @__PURE__ */ jsxs11(Text11, { color: theme.muted, children: [
                "[",
                s.model,
                "] \u2022 ",
                s.messageCount,
                " msgs \u2022 ",
                dateStr
              ] }) })
            ] }, s.id);
          })
        ] })
      ]
    }
  );
};

// src/tui/app.tsx
import { jsx as jsx12, jsxs as jsxs12 } from "react/jsx-runtime";
var AppContainer = ({
  config: initialConfig,
  agentLoop,
  availableModels: initialAvailableModels,
  availableCommands,
  workingDir,
  gitBranch,
  onUpdateModel,
  onUpdateProvider,
  onUpdatePermissions,
  skillManager,
  pluginLoader,
  subagentManager,
  sessionManager,
  initialSessionId,
  initialPrompt
}) => {
  const { exit } = useApp();
  const [currentConfig, setCurrentConfig] = useState10(initialConfig);
  const [modelsList, setModelsList] = useState10(initialAvailableModels);
  const theme = getTheme(currentConfig.theme);
  const [activeSession, setActiveSession] = useState10(() => {
    if (!sessionManager) return null;
    if (initialSessionId) {
      const loaded = sessionManager.loadSession(initialSessionId);
      if (loaded) return loaded;
    }
    return sessionManager.createSession({
      provider: initialConfig.currentProvider,
      model: initialConfig.currentModel,
      workingDirectory: workingDir
    });
  });
  const [messages, setMessages] = useState10(() => {
    const entries = [];
    if (activeSession && activeSession.messages && activeSession.messages.length > 0) {
      agentLoop.setMessages(activeSession.messages);
      for (const m of activeSession.messages) {
        if (m.role === "system") continue;
        if (m.role === "user" && m.content) {
          entries.push({ role: "user", content: m.content });
        } else if (m.role === "assistant" && m.content) {
          entries.push({ role: "assistant", content: m.content });
        } else if (m.role === "tool" && m.content) {
          entries.push({ role: "tool", content: `[${m.name || "tool"}]: ${m.content.slice(0, 150)}` });
        }
      }
      entries.push({
        role: "system",
        content: `\u2714 Sess\xE3o '${activeSession.id}' retomada (${activeSession.messages.length} mensagens).`
      });
      return entries;
    }
    const activeProv = currentConfig.providers.find((p) => p.name === currentConfig.currentProvider);
    const isLocal = currentConfig.currentProvider === "ollama" || (activeProv?.baseUrl || "").includes("localhost") || (activeProv?.baseUrl || "").includes("127.0.0.1");
    if (!isLocal && (!activeProv || !activeProv.apiKey || activeProv.apiKey.trim() === "")) {
      entries.push({
        role: "system",
        content: `\u2726 Bem-vindo ao Antigravity CLI Agent!
\u2139 Chave de API n\xE3o configurada para o provedor '${currentConfig.currentProvider}'.
Digite /config para abrir o assistente interativo por etapas e configurar sua API Key.`
      });
    }
    return entries;
  });
  const [currentInput, setCurrentInput] = useState10("");
  const [streamingContent, setStreamingContent] = useState10("");
  const [isStreaming, setIsStreaming] = useState10(false);
  const [tokenStats, setTokenStats] = useState10(() => agentLoop.getTokenStats());
  const [showConfigWizard, setShowConfigWizard] = useState10(false);
  const [showModelSelector, setShowModelSelector] = useState10(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState10(false);
  const [showSkillsModal, setShowSkillsModal] = useState10(false);
  const [showPluginsModal, setShowPluginsModal] = useState10(false);
  const [showSubagentsModal, setShowSubagentsModal] = useState10(false);
  const [showSessionsModal, setShowSessionsModal] = useState10(false);
  const [pendingConfirm, setPendingConfirm] = useState10(null);
  useEffect5(() => {
    agentLoop.getSecurityGuard().setConfirmHandler(async (details) => {
      return new Promise((resolve) => {
        setPendingConfirm({
          toolName: details.toolName,
          category: details.category,
          args: details.args,
          resolve
        });
      });
    });
  }, [agentLoop]);
  useEffect5(() => {
    if (initialPrompt) {
      handleUserSubmit(initialPrompt);
    }
  }, []);
  const refreshModels = async () => {
    const activeProv = currentConfig.providers.find((p) => p.name === currentConfig.currentProvider);
    if (!activeProv) return;
    const catalog = new ModelCatalog({
      baseUrl: activeProv.baseUrl,
      apiKey: activeProv.apiKey,
      providerName: activeProv.name
    });
    const fetched = await catalog.fetchAvailableModels();
    setModelsList(fetched);
  };
  const persistCurrentSession = () => {
    if (sessionManager && activeSession) {
      const loopMsgs = agentLoop.getMessages();
      activeSession.messages = loopMsgs;
      activeSession.tokenCount = tokenStats.currentTokens;
      activeSession.model = currentConfig.currentModel;
      activeSession.provider = currentConfig.currentProvider;
      sessionManager.saveSession(activeSession);
    }
  };
  const resumeSessionById = (sessionId) => {
    if (!sessionManager) return;
    const loaded = sessionManager.loadSession(sessionId);
    if (!loaded) return;
    setActiveSession(loaded);
    agentLoop.setMessages(loaded.messages);
    agentLoop.setModel(loaded.model);
    setCurrentConfig((prev) => ({
      ...prev,
      currentProvider: loaded.provider,
      currentModel: loaded.model
    }));
    const entries = [];
    for (const m of loaded.messages) {
      if (m.role === "system") continue;
      if (m.role === "user" && m.content) {
        entries.push({ role: "user", content: m.content });
      } else if (m.role === "assistant" && m.content) {
        entries.push({ role: "assistant", content: m.content });
      } else if (m.role === "tool" && m.content) {
        entries.push({ role: "tool", content: `[${m.name || "tool"}]: ${m.content.slice(0, 150)}` });
      }
    }
    entries.push({
      role: "system",
      content: `\u2714 Sess\xE3o '${loaded.id}' retomada (${loaded.messages.length} mensagens).`
    });
    setMessages(entries);
    setTokenStats(agentLoop.getTokenStats());
  };
  const handleUserSubmit = async (promptText) => {
    const trimmed = promptText.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("/")) {
      const [cmd, ...args] = trimmed.split(" ");
      const commandLower = cmd.toLowerCase();
      if (commandLower === "/exit" || commandLower === "/quit") {
        persistCurrentSession();
        exit();
        return;
      }
      if (commandLower === "/clear") {
        setMessages([]);
        setStreamingContent("");
        return;
      }
      if (commandLower === "/config") {
        setShowConfigWizard(true);
        return;
      }
      if (commandLower === "/models") {
        await refreshModels();
        setShowModelSelector(true);
        return;
      }
      if (commandLower === "/permissions") {
        setShowPermissionsModal(true);
        return;
      }
      if (commandLower === "/skills") {
        setShowSkillsModal(true);
        return;
      }
      if (commandLower === "/plugins") {
        setShowPluginsModal(true);
        return;
      }
      if (commandLower === "/compact") {
        const result = agentLoop.compactContext(4);
        setTokenStats(agentLoop.getTokenStats());
        persistCurrentSession();
        setMessages((prev) => [
          ...prev,
          { role: "user", content: promptText },
          {
            role: "system",
            content: `\u2714 Compacta\xE7\xE3o manual de contexto realizada!
${result.compactedCount} mensagens anteriores foram resumidas.
Tokens economizados: ~${result.tokensSaved} tokens.`
          }
        ]);
        return;
      }
      if (commandLower === "/subagents") {
        setShowSubagentsModal(true);
        return;
      }
      if (commandLower === "/sessions") {
        setShowSessionsModal(true);
        return;
      }
      if (commandLower === "/resume") {
        const targetId = args[0]?.trim();
        if (!targetId) {
          setShowSessionsModal(true);
          return;
        }
        if (sessionManager) {
          const loaded = sessionManager.loadSession(targetId);
          if (loaded) {
            resumeSessionById(loaded.id);
            return;
          } else {
            setMessages((prev) => [
              ...prev,
              { role: "user", content: promptText },
              { role: "system", content: `\u2716 Sess\xE3o com ID '${targetId}' n\xE3o encontrada.` }
            ]);
            return;
          }
        }
      }
      if (commandLower === "/help") {
        setMessages((prev) => [
          ...prev,
          { role: "user", content: promptText },
          {
            role: "system",
            content: `Comandos Slash Dispon\xEDveis:
` + availableCommands.map((c) => `  ${c.name.padEnd(16)} - ${c.description}`).join("\n") + `

Atalhos:
  \u2022 /config      - Assistente interativo em etapas de Provedor e API Key
  \u2022 /models      - Cat\xE1logo e seletor de modelos liberados pela chave
  \u2022 /permissions - Modos de permiss\xE3o (ask, auto-safe, always-allow)
  \u2022 /skills      - Cat\xE1logo e ativa\xE7\xE3o de SKILL.md no agente
  \u2022 /plugins     - Plugins e servidores MCP compat\xEDveis
  \u2022 /compact     - Compacta\xE7\xE3o manual de contexto para economizar tokens
  \u2022 /subagents   - Painel e logs em tempo real dos subagentes em segundo plano
  \u2022 /sessions    - Hist\xF3rico de sess\xF5es anteriores salvas
  \u2022 /resume <id> - Retoma uma sess\xE3o anterior salva
  \u2022 /clear       - Limpa o hist\xF3rico de chat da tela
  \u2022 /exit        - Salva a sess\xE3o e encerra o assistente`
          }
        ]);
        return;
      }
      if (pluginLoader) {
        const pluginCmd = pluginLoader.getSlashCommand(commandLower);
        if (pluginCmd) {
          try {
            const result = await pluginCmd.handler(args.join(" "), {
              workingDirectory: workingDir,
              config: currentConfig,
              registerTool: (t) => agentLoop.getTools().register(t),
              registerSlashCommand: (c) => pluginLoader.registerSlashCommand(c),
              log: (m) => {
              }
            });
            if (result) {
              setMessages((prev) => [
                ...prev,
                { role: "user", content: promptText },
                { role: "assistant", content: result }
              ]);
            }
          } catch (err) {
            setMessages((prev) => [
              ...prev,
              { role: "system", content: `Erro ao executar plugin: ${err.message}` }
            ]);
          }
          return;
        }
      }
      setMessages((prev) => [
        ...prev,
        { role: "user", content: promptText },
        {
          role: "system",
          content: `Comando n\xE3o reconhecido ou incompleto: "${promptText}". Digite /help para ver os comandos dispon\xEDveis ou /config para configurar o assistente.`
        }
      ]);
      return;
    }
    const activeProv = currentConfig.providers.find((p) => p.name === currentConfig.currentProvider);
    const isLocal = currentConfig.currentProvider === "ollama" || (activeProv?.baseUrl || "").includes("localhost") || (activeProv?.baseUrl || "").includes("127.0.0.1");
    if (!isLocal && (!activeProv || !activeProv.apiKey || activeProv.apiKey.trim() === "")) {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: promptText },
        {
          role: "system",
          content: `\u2716 Chave de API n\xE3o configurada para o provedor '${currentConfig.currentProvider}'.
Digite /config para configurar sua chave de API pelo assistente por etapas antes de enviar mensagens.`
        }
      ]);
      return;
    }
    setMessages((prev) => [...prev, { role: "user", content: promptText }]);
    setIsStreaming(true);
    setStreamingContent("");
    try {
      let accumulated = "";
      await agentLoop.runTurn(
        promptText,
        {
          onToken: (tok) => {
            accumulated += tok;
            setStreamingContent(accumulated);
          },
          onToolCallStart: (tc) => {
            setMessages((prev) => [
              ...prev,
              { role: "tool", content: `[Executando ferramenta: ${tc.name}...]` }
            ]);
          },
          onToolCallResult: (res) => {
            setMessages((prev) => [
              ...prev,
              { role: "tool", content: `[Resultado de ${res.name}]: ${res.output.slice(0, 300)}` }
            ]);
          },
          onAutoCompact: (compaction) => {
            setMessages((prev) => [
              ...prev,
              {
                role: "system",
                content: `\u26A1 Auto-compacta\xE7\xE3o de contexto acionada (~${compaction.tokensSaved} tokens liberados).`
              }
            ]);
          }
        }
      );
      setMessages((prev) => [...prev, { role: "assistant", content: accumulated }]);
    } catch (err) {
      const errMsg = err.message;
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: errMsg.includes("401") ? `Erro de Autentica\xE7\xE3o (401 Unauthorized): Chave inv\xE1lida ou n\xE3o autorizada pelo provedor.
Digite /config para atualizar sua chave de API.` : `Erro durante a execu\xE7\xE3o: ${errMsg}`
        }
      ]);
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      const updatedStats = agentLoop.getTokenStats();
      setTokenStats(updatedStats);
      persistCurrentSession();
    }
  };
  const isModalActive = showConfigWizard || showModelSelector || showPermissionsModal || showSkillsModal || showPluginsModal || showSubagentsModal || showSessionsModal || !!pendingConfirm;
  return /* @__PURE__ */ jsxs12(Box12, { flexDirection: "column", padding: 1, children: [
    /* @__PURE__ */ jsxs12(
      Box12,
      {
        borderStyle: "round",
        borderColor: theme.primary,
        paddingX: 1,
        flexDirection: "column",
        children: [
          /* @__PURE__ */ jsxs12(Box12, { justifyContent: "space-between", children: [
            /* @__PURE__ */ jsx12(Text12, { color: theme.primary, bold: true, children: "\u2726 Antigravity CLI Agent v0.1.0" }),
            /* @__PURE__ */ jsxs12(Text12, { color: theme.muted, children: [
              "Dir: ",
              /* @__PURE__ */ jsx12(Text12, { bold: true, children: workingDir })
            ] }),
            /* @__PURE__ */ jsx12(Text12, { color: theme.muted, children: gitBranch ? `git:(${gitBranch})` : "sem git" })
          ] }),
          /* @__PURE__ */ jsxs12(Box12, { justifyContent: "space-between", marginTop: 0, children: [
            /* @__PURE__ */ jsxs12(Text12, { color: theme.secondary, children: [
              "Provedor: ",
              /* @__PURE__ */ jsx12(Text12, { bold: true, children: currentConfig.currentProvider }),
              " | Modelo:",
              " ",
              /* @__PURE__ */ jsx12(Text12, { bold: true, children: currentConfig.currentModel })
            ] }),
            /* @__PURE__ */ jsxs12(Text12, { color: tokenStats.isNearLimit ? theme.warning : theme.success, bold: true, children: [
              "Tokens: ",
              tokenStats.formattedCurrent,
              " / ",
              tokenStats.formattedMax,
              " (",
              tokenStats.percentage,
              "%)"
            ] })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsxs12(Box12, { flexDirection: "column", marginY: 1, children: [
      messages.map((m, idx) => {
        if (m.role === "user") {
          return /* @__PURE__ */ jsxs12(Box12, { marginY: 0, children: [
            /* @__PURE__ */ jsxs12(Text12, { color: theme.primary, bold: true, children: [
              "Voc\xEA:",
              " "
            ] }),
            /* @__PURE__ */ jsx12(Text12, { children: m.content })
          ] }, idx);
        }
        if (m.role === "assistant") {
          return /* @__PURE__ */ jsxs12(Box12, { marginY: 0, flexDirection: "column", children: [
            /* @__PURE__ */ jsx12(Text12, { color: theme.success, bold: true, children: "Assistente:" }),
            /* @__PURE__ */ jsx12(Text12, { children: m.content })
          ] }, idx);
        }
        if (m.role === "tool") {
          return /* @__PURE__ */ jsx12(Text12, { color: theme.warning, children: m.content }, idx);
        }
        return /* @__PURE__ */ jsx12(Text12, { color: theme.muted, children: m.content }, idx);
      }),
      isStreaming && /* @__PURE__ */ jsx12(
        StreamView,
        {
          content: streamingContent,
          isStreaming,
          theme
        }
      )
    ] }),
    showConfigWizard && /* @__PURE__ */ jsx12(
      ConfigWizard,
      {
        currentProvider: currentConfig.currentProvider,
        currentModel: currentConfig.currentModel,
        theme,
        onSave: ({ provider, baseUrl, apiKey, model }) => {
          setShowConfigWizard(false);
          if (onUpdateProvider) {
            onUpdateProvider(provider, baseUrl, apiKey, model);
          }
          const updatedProviders = currentConfig.providers.map(
            (p) => p.name === provider ? { ...p, baseUrl, apiKey } : p
          );
          if (!updatedProviders.some((p) => p.name === provider)) {
            updatedProviders.push({ name: provider, baseUrl, apiKey, headers: {}, description: "Configurado via wizard" });
          }
          const newCfg = {
            ...currentConfig,
            currentProvider: provider,
            currentModel: model,
            providers: updatedProviders
          };
          setCurrentConfig(newCfg);
          agentLoop.setClient(new OpenApiClient({ baseUrl, apiKey }));
          agentLoop.setModel(model);
          setTokenStats(agentLoop.getTokenStats());
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              content: `\u2714 Configura\xE7\xE3o atualizada com sucesso!
Provedor: ${provider} | Modelo: ${model}`
            }
          ]);
          refreshModels();
          persistCurrentSession();
        },
        onClose: () => setShowConfigWizard(false)
      }
    ),
    showModelSelector && /* @__PURE__ */ jsx12(
      ModelSelector,
      {
        models: modelsList,
        currentModel: currentConfig.currentModel,
        onSelect: (modelId) => {
          onUpdateModel(modelId);
          const found = modelsList.find((m) => m.id === modelId);
          agentLoop.setModel(modelId, found?.contextLength);
          setCurrentConfig((prev) => ({ ...prev, currentModel: modelId }));
          setTokenStats(agentLoop.getTokenStats());
          setShowModelSelector(false);
          setMessages((prev) => [
            ...prev,
            { role: "system", content: `\u2714 Modelo ativo alterado para: ${modelId}` }
          ]);
          persistCurrentSession();
        },
        onClose: () => setShowModelSelector(false),
        theme
      }
    ),
    showPermissionsModal && /* @__PURE__ */ jsx12(
      PermissionsModal,
      {
        currentMode: currentConfig.permissions.mode || "auto-safe",
        theme,
        onSelectMode: (mode) => {
          if (onUpdatePermissions) {
            onUpdatePermissions(mode);
          }
          agentLoop.getSecurityGuard().setMode(mode);
          setCurrentConfig((prev) => ({
            ...prev,
            permissions: { ...prev.permissions, mode }
          }));
          setShowPermissionsModal(false);
          setMessages((prev) => [
            ...prev,
            { role: "system", content: `\u2714 Modo de permiss\xF5es definido para: '${mode}'` }
          ]);
        },
        onClose: () => setShowPermissionsModal(false)
      }
    ),
    showSkillsModal && skillManager && /* @__PURE__ */ jsx12(
      SkillsModal,
      {
        skillManager,
        theme,
        onToggleSkill: (skillName) => {
          const isNowActive = skillManager.toggleSkill(skillName);
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              content: `\u2714 Skill '${skillName}' ${isNowActive ? "ativada" : "desativada"}.`
            }
          ]);
        },
        onClose: () => setShowSkillsModal(false)
      }
    ),
    showPluginsModal && pluginLoader && /* @__PURE__ */ jsx12(
      PluginsModal,
      {
        pluginLoader,
        theme,
        onClose: () => setShowPluginsModal(false)
      }
    ),
    showSubagentsModal && subagentManager && /* @__PURE__ */ jsx12(
      SubagentsModal,
      {
        subagentManager,
        theme,
        onClose: () => setShowSubagentsModal(false)
      }
    ),
    showSessionsModal && sessionManager && /* @__PURE__ */ jsx12(
      SessionsModal,
      {
        sessionManager,
        currentSessionId: activeSession?.id,
        theme,
        onResume: (sessionId) => {
          resumeSessionById(sessionId);
          setShowSessionsModal(false);
        },
        onClose: () => setShowSessionsModal(false)
      }
    ),
    pendingConfirm && /* @__PURE__ */ jsx12(
      ConfirmDialog,
      {
        toolName: pendingConfirm.toolName,
        category: pendingConfirm.category,
        args: pendingConfirm.args,
        onDecision: (decision) => {
          pendingConfirm.resolve(decision);
          setPendingConfirm(null);
        },
        theme
      }
    ),
    /* @__PURE__ */ jsx12(
      Compose,
      {
        onSubmit: handleUserSubmit,
        onChange: setCurrentInput,
        theme,
        disabled: isStreaming || isModalActive
      }
    ),
    /* @__PURE__ */ jsx12(
      CommandMenu,
      {
        input: currentInput,
        commands: availableCommands,
        onSelect: (cmdName) => {
          handleUserSubmit(cmdName);
          setCurrentInput("");
        },
        theme
      }
    ),
    /* @__PURE__ */ jsx12(Box12, { marginTop: 1, justifyContent: "space-between", children: /* @__PURE__ */ jsxs12(Text12, { color: theme.muted, children: [
      "Digite ",
      /* @__PURE__ */ jsx12(Text12, { color: theme.primary, children: "/" }),
      " para menu de comandos \u2022",
      " ",
      /* @__PURE__ */ jsx12(Text12, { color: theme.primary, children: "/config" }),
      " por etapas \u2022",
      " ",
      /* @__PURE__ */ jsx12(Text12, { color: theme.primary, children: "/models" }),
      " modelos \u2022",
      " ",
      /* @__PURE__ */ jsx12(Text12, { color: theme.primary, children: "/subagents" }),
      " subagentes \u2022",
      " ",
      /* @__PURE__ */ jsx12(Text12, { color: theme.primary, children: "/sessions" }),
      " sess\xF5es"
    ] }) })
  ] });
};

// src/config/interactive-config.ts
import readline from "readline";
function askQuestion(rl, query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer.trim());
    });
  });
}
async function runInteractiveConfigWizard(configManager = defaultConfigManager, io) {
  const rl = readline.createInterface({
    input: io?.input || process.stdin,
    output: io?.output || process.stdout
  });
  try {
    const config = configManager.loadConfig();
    console.log("\n======================================================");
    console.log("\u2726 Assistente Interativo de Configura\xE7\xE3o de Provedor \u2726");
    console.log("======================================================\n");
    console.log("Etapa 1/5: Escolha o Provedor de Modelos:");
    console.log("  1) OpenRouter (Acesso a centenas de modelos, incluindo :free)");
    console.log("  2) Ollama Local (100% gratuito e offline em http://localhost:11434)");
    console.log("  3) Groq Cloud (Infer\xEAncia ultra-r\xE1pida LPU com tier gratuito)");
    console.log("  4) Provedor Customizado compat\xEDvel com OpenAPI / OpenAI");
    const providerChoice = await askQuestion(rl, "\nSelecione o provedor [1-4] (padr\xE3o: 1): ");
    let providerName = "openrouter";
    let defaultUrl = "https://openrouter.ai/api/v1";
    if (providerChoice === "2" || providerChoice.toLowerCase() === "ollama") {
      providerName = "ollama";
      defaultUrl = "http://localhost:11434/v1";
    } else if (providerChoice === "3" || providerChoice.toLowerCase() === "groq") {
      providerName = "groq";
      defaultUrl = "https://api.groq.com/openai/v1";
    } else if (providerChoice === "4" || providerChoice.toLowerCase() === "custom") {
      providerName = "custom";
      defaultUrl = "http://localhost:8000/v1";
    }
    console.log(`
Etapa 2/5: URL Base da API do Provedor:`);
    const customUrl = await askQuestion(rl, `Informe a URL base [Enter para manter '${defaultUrl}']: `);
    const baseUrl = customUrl || defaultUrl;
    console.log(`
Etapa 3/5: Chave de API (API Key) para '${providerName}':`);
    if (providerName === "ollama") {
      console.log("  (Ollama local normalmente n\xE3o requer chave. Pressione Enter para prosseguir)");
    } else if (providerName === "openrouter") {
      console.log("  (Obtenha sua chave gratuita ou pr\xE9-paga em https://openrouter.ai/keys)");
    } else if (providerName === "groq") {
      console.log("  (Obtenha sua chave gratuita em https://console.groq.com/keys)");
    }
    const existingKey = config.providers.find((p) => p.name === providerName)?.apiKey || "";
    const keyPrompt = existingKey ? `Cole sua API Key [Enter para manter a existente]: ` : `Cole sua API Key: `;
    const enteredKey = await askQuestion(rl, keyPrompt);
    const apiKey = enteredKey || (existingKey || (providerName === "ollama" ? "ollama" : ""));
    console.log(`
Etapa 4/5: Testando conex\xE3o real e buscando modelos liberados pela chave...`);
    const catalog = new ModelCatalog({
      baseUrl,
      apiKey,
      providerName
    });
    const testRes = await catalog.testConnectionAndFetchModels();
    let availableModels = [];
    if (!testRes.success) {
      console.log(`
\u2716 Falha na conex\xE3o/autentica\xE7\xE3o: ${testRes.error}`);
      const proceed = await askQuestion(
        rl,
        "Deseja salvar a configura\xE7\xE3o mesmo assim e usar modelos padr\xE3o? (s/N): "
      );
      if (proceed.toLowerCase() !== "s" && proceed.toLowerCase() !== "sim") {
        throw new Error(`Configura\xE7\xE3o cancelada devido a erro de conex\xE3o: ${testRes.error}`);
      }
      availableModels = catalog.getFallbackModels();
    } else {
      availableModels = testRes.models;
      const freeCount = availableModels.filter((m) => m.isFree).length;
      console.log(`\u2714 Conex\xE3o estabelecida com sucesso!`);
      console.log(`\u2714 Total de modelos liberados encontrados: ${availableModels.length} (${freeCount} gratuitos / :free)
`);
    }
    console.log("Etapa 5/5: Escolha o Modelo Padr\xE3o:");
    const displayList = availableModels.slice(0, 15);
    displayList.forEach((m, idx) => {
      const tag = m.isFree ? "[GRATUITO / FREE]" : "[PAGO]";
      console.log(`  ${idx + 1}) ${m.id} ${tag}`);
    });
    if (availableModels.length > 15) {
      console.log(`  ... e mais ${availableModels.length - 15} modelos dispon\xEDveis.`);
    }
    const defaultModelChoice = displayList[0]?.id || "google/gemini-2.5-flash:free";
    const modelAnswer = await askQuestion(
      rl,
      `
Selecione o n\xFAmero [1-${displayList.length}] ou digite o ID do modelo [Enter para '${defaultModelChoice}']: `
    );
    let selectedModel = defaultModelChoice;
    if (modelAnswer) {
      const num = parseInt(modelAnswer, 10);
      if (!isNaN(num) && num >= 1 && num <= displayList.length) {
        selectedModel = displayList[num - 1].id;
      } else {
        selectedModel = modelAnswer;
      }
    }
    configManager.addOrUpdateProvider({
      name: providerName,
      baseUrl,
      apiKey,
      headers: {},
      description: `Configurado em ${(/* @__PURE__ */ new Date()).toLocaleDateString()}`
    });
    configManager.setCurrentProvider(providerName);
    configManager.setCurrentModel(selectedModel);
    console.log("\n======================================================");
    console.log("\u2714 Configura\xE7\xE3o conclu\xEDda e salva com sucesso!");
    console.log(`  Provedor ativo: ${providerName}`);
    console.log(`  URL: ${baseUrl}`);
    console.log(`  Modelo: ${selectedModel}`);
    console.log(`  Arquivo de configura\xE7\xE3o: ${configManager.getConfigPath()}`);
    console.log("======================================================\n");
    return {
      provider: providerName,
      baseUrl,
      apiKey,
      selectedModel
    };
  } finally {
    rl.close();
  }
}

// src/context/agent-memory.ts
import fs6 from "fs";
import path7 from "path";
var AgentMemoryManager = class {
  memoryFilePath;
  constructor(workspaceDir = process.cwd()) {
    this.memoryFilePath = path7.join(workspaceDir, ".agent-memory.json");
  }
  getFilePath() {
    return this.memoryFilePath;
  }
  loadMemory() {
    if (!fs6.existsSync(this.memoryFilePath)) {
      return { version: 1, facts: {} };
    }
    try {
      const raw = fs6.readFileSync(this.memoryFilePath, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        version: parsed.version || 1,
        facts: parsed.facts || {}
      };
    } catch {
      return { version: 1, facts: {} };
    }
  }
  saveFact(key, fact) {
    const memory = this.loadMemory();
    memory.facts[key] = {
      fact,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    fs6.writeFileSync(this.memoryFilePath, JSON.stringify(memory, null, 2), "utf-8");
  }
  deleteFact(key) {
    const memory = this.loadMemory();
    if (memory.facts[key]) {
      delete memory.facts[key];
      fs6.writeFileSync(this.memoryFilePath, JSON.stringify(memory, null, 2), "utf-8");
      return true;
    }
    return false;
  }
  getFormattedContext() {
    const memory = this.loadMemory();
    const entries = Object.entries(memory.facts);
    if (entries.length === 0) {
      return "";
    }
    const lines = [
      "### Mem\xF3ria de Longo Prazo do Projeto (Fatos Aprendidos Anteriores):",
      ...entries.map(([k, v]) => `\u2022 [${k}]: ${v.fact}`)
    ];
    return lines.join("\n");
  }
  createMemoryTools() {
    return [
      {
        name: "save_memory",
        description: "Grava uma prefer\xEAncia, fato arquitetural ou diretriz importante sobre o projeto na mem\xF3ria de longo prazo cont\xEDnua.",
        category: "write",
        parameters: {
          type: "object",
          properties: {
            key: {
              type: "string",
              description: 'Identificador curto do fato ou prefer\xEAncia (ex: "prefer_typescript", "test_runner", "build_command").'
            },
            fact: {
              type: "string",
              description: "Descri\xE7\xE3o detalhada do fato ou conven\xE7\xE3o aprendida."
            }
          },
          required: ["key", "fact"]
        },
        execute: async (args) => {
          this.saveFact(args.key, args.fact);
          return `\u2714 Fato salvo com sucesso na mem\xF3ria de longo prazo: [${args.key}] => "${args.fact}"`;
        }
      },
      {
        name: "read_memory",
        description: "L\xEA todos os fatos gravados na mem\xF3ria de longo prazo do agente para este projeto.",
        category: "read",
        parameters: {
          type: "object",
          properties: {}
        },
        execute: async () => {
          const formatted = this.getFormattedContext();
          return formatted || "Nenhum fato gravado na mem\xF3ria de longo prazo at\xE9 o momento.";
        }
      }
    ];
  }
};

// src/subagents/subagent-manager.ts
import crypto2 from "crypto";
var SubagentManager = class {
  tasks = /* @__PURE__ */ new Map();
  listeners = [];
  defaultClient;
  defaultModel;
  defaultTools;
  defaultSecurityGuard;
  constructor(defaults) {
    if (defaults) {
      this.defaultClient = defaults.client;
      this.defaultModel = defaults.model;
      this.defaultTools = defaults.tools;
      this.defaultSecurityGuard = defaults.securityGuard;
    }
  }
  setDefaults(defaults) {
    this.defaultClient = defaults.client;
    this.defaultModel = defaults.model;
    this.defaultTools = defaults.tools;
    this.defaultSecurityGuard = defaults.securityGuard;
  }
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
  notify(task) {
    for (const listener of this.listeners) {
      try {
        listener({ ...task, logs: [...task.logs] });
      } catch {
      }
    }
  }
  getAllSubagents() {
    return Array.from(this.tasks.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }
  getSubagent(id) {
    return this.tasks.get(id);
  }
  spawnSubagent(options) {
    const id = `subagent-${Date.now().toString(36)}-${crypto2.randomBytes(2).toString("hex")}`;
    const startedAt = (/* @__PURE__ */ new Date()).toISOString();
    const client = options.client || this.defaultClient;
    const model = options.model || this.defaultModel || "gpt-4o";
    const tools = options.tools || this.defaultTools || new ToolRegistry();
    const securityGuard = options.securityGuard || this.defaultSecurityGuard || new SecurityGuard({
      mode: "auto-safe",
      allowFileRead: true,
      allowFileWrite: true,
      allowShellExecution: true,
      autoApprovedCommands: []
    });
    if (!client) {
      throw new Error("SubagentManager precisa de um OpenApiClient configurado para iniciar subagentes.");
    }
    const task = {
      id,
      name: options.name,
      prompt: options.prompt,
      status: "running",
      startedAt,
      elapsedMs: 0,
      logs: [`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] Subagente '${options.name}' iniciado`]
    };
    this.tasks.set(id, task);
    this.notify(task);
    const startTime = Date.now();
    (async () => {
      try {
        const subLoop = new AgentLoop({
          client,
          model,
          tools,
          securityGuard,
          systemPrompt: options.systemPrompt || `Voc\xEA \xE9 um subagente especializado focado estritamente na tarefa: "${options.name}". Seja direto, execute ferramentas se necess\xE1rio e retorne um relat\xF3rio objetivo.`,
          maxIterations: 8
        });
        const result = await subLoop.runTurn(options.prompt, {
          onToken: (tok) => {
          },
          onToolCallStart: (tc) => {
            task.logs.push(`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] Ferramenta iniciada: ${tc.name}`);
            task.elapsedMs = Date.now() - startTime;
            this.notify(task);
          },
          onToolCallResult: (res) => {
            task.logs.push(`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] Ferramenta conclu\xEDda: ${res.name}`);
            task.elapsedMs = Date.now() - startTime;
            this.notify(task);
          }
        });
        task.status = "completed";
        task.result = result;
        task.completedAt = (/* @__PURE__ */ new Date()).toISOString();
        task.elapsedMs = Date.now() - startTime;
        task.logs.push(`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] Subagente conclu\xEDdo com sucesso.`);
        this.notify(task);
      } catch (err) {
        task.status = "failed";
        task.error = err.message;
        task.completedAt = (/* @__PURE__ */ new Date()).toISOString();
        task.elapsedMs = Date.now() - startTime;
        task.logs.push(`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] Falha: ${err.message}`);
        this.notify(task);
      }
    })();
    return task;
  }
  createSubagentTools() {
    return [
      {
        name: "spawn_subagent",
        description: "Inicia um subagente em segundo plano para realizar tarefas paralelas, investiga\xE7\xF5es ou an\xE1lises ass\xEDncronas.",
        category: "execute",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: 'Nome curto descritivo da tarefa (ex: "An\xE1lise de logs", "Pesquisa de imports").'
            },
            prompt: {
              type: "string",
              description: "Instru\xE7\xF5es completas para o subagente executar em segundo plano."
            }
          },
          required: ["name", "prompt"]
        },
        execute: async (args) => {
          try {
            const task = this.spawnSubagent({
              name: args.name,
              prompt: args.prompt
            });
            return `\u2714 Subagente iniciado em segundo plano com ID: ${task.id} (Nome: "${task.name}"). Voc\xEA pode verificar o status posteriormente usando get_subagent_status.`;
          } catch (err) {
            return `Erro ao iniciar subagente: ${err.message}`;
          }
        }
      },
      {
        name: "get_subagent_status",
        description: "Verifica o status e o resultado de um subagente executando em segundo plano pelo seu ID.",
        category: "read",
        parameters: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: 'ID do subagente (ex: "subagent-...").'
            }
          },
          required: ["id"]
        },
        execute: async (args) => {
          const task = this.getSubagent(args.id);
          if (!task) {
            return `Erro: Subagente com ID '${args.id}' n\xE3o encontrado.`;
          }
          const info = [
            `Subagente: ${task.name} (${task.id})`,
            `Status: ${task.status.toUpperCase()}`,
            `Tempo decorrido: ${(task.elapsedMs / 1e3).toFixed(1)}s`,
            `\xDAltimos logs:
${task.logs.slice(-4).join("\n")}`
          ];
          if (task.result) {
            info.push(`
Resultado:
${task.result}`);
          }
          if (task.error) {
            info.push(`
Erro: ${task.error}`);
          }
          return info.join("\n");
        }
      },
      {
        name: "list_subagents",
        description: "Lista todos os subagentes criados e seus respectivos status de execu\xE7\xE3o.",
        category: "read",
        parameters: {
          type: "object",
          properties: {}
        },
        execute: async () => {
          const all = this.getAllSubagents();
          if (all.length === 0) {
            return "Nenhum subagente foi executado nesta sess\xE3o.";
          }
          return `Subagentes (${all.length}):
` + all.map(
            (t) => `\u2022 [${t.status.toUpperCase()}] ${t.id} - ${t.name} (${(t.elapsedMs / 1e3).toFixed(1)}s)`
          ).join("\n");
        }
      }
    ];
  }
};

// src/session/session-manager.ts
import fs7 from "fs";
import path8 from "path";
import os4 from "os";
import crypto3 from "crypto";
var SessionManager = class {
  sessionsDir;
  constructor(customDir) {
    if (customDir) {
      this.sessionsDir = customDir;
    } else {
      const home = os4.homedir();
      this.sessionsDir = path8.join(home, ".agent-cli", "sessions");
    }
    if (!fs7.existsSync(this.sessionsDir)) {
      fs7.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }
  getSessionsDir() {
    return this.sessionsDir;
  }
  generateSessionId() {
    const timestamp = Date.now().toString(36);
    const rand = crypto3.randomBytes(3).toString("hex");
    return `sess-${timestamp}-${rand}`;
  }
  createSession(params) {
    const id = this.generateSessionId();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const session = {
      id,
      title: params.initialTitle || "Nova Sess\xE3o",
      createdAt: now,
      updatedAt: now,
      provider: params.provider,
      model: params.model,
      workingDirectory: params.workingDirectory,
      messageCount: 0,
      tokenCount: 0,
      messages: []
    };
    this.saveSession(session);
    return session;
  }
  saveSession(session) {
    session.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    session.messageCount = session.messages.length;
    if (session.title === "Nova Sess\xE3o" && session.messages.length > 0) {
      const firstUserMsg = session.messages.find((m) => m.role === "user");
      if (firstUserMsg && firstUserMsg.content) {
        session.title = firstUserMsg.content.slice(0, 50).trim();
      }
    }
    const filePath = path8.join(this.sessionsDir, `${session.id}.json`);
    fs7.writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8");
  }
  loadSession(id) {
    const cleanId = id.endsWith(".json") ? id.replace(".json", "") : id;
    const filePath = path8.join(this.sessionsDir, `${cleanId}.json`);
    if (!fs7.existsSync(filePath)) {
      return null;
    }
    try {
      const raw = fs7.readFileSync(filePath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  listSessions() {
    if (!fs7.existsSync(this.sessionsDir)) return [];
    const files = fs7.readdirSync(this.sessionsDir);
    const sessions = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = fs7.readFileSync(path8.join(this.sessionsDir, f), "utf-8");
        const parsed = JSON.parse(raw);
        sessions.push({
          id: parsed.id,
          title: parsed.title || "Sess\xE3o sem t\xEDtulo",
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt,
          provider: parsed.provider,
          model: parsed.model,
          workingDirectory: parsed.workingDirectory,
          messageCount: parsed.messages ? parsed.messages.length : parsed.messageCount || 0,
          tokenCount: parsed.tokenCount || 0
        });
      } catch {
      }
    }
    return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  getLatestSession() {
    const list = this.listSessions();
    if (list.length === 0) return null;
    return this.loadSession(list[0].id);
  }
  deleteSession(id) {
    const cleanId = id.endsWith(".json") ? id.replace(".json", "") : id;
    const filePath = path8.join(this.sessionsDir, `${cleanId}.json`);
    if (fs7.existsSync(filePath)) {
      fs7.unlinkSync(filePath);
      return true;
    }
    return false;
  }
};

// src/cli.ts
async function listAvailableModels(options) {
  const config = defaultConfigManager.loadConfig();
  let provider = defaultConfigManager.getActiveProvider();
  if (options.providerName) {
    const found = config.providers.find((p) => p.name === options.providerName);
    if (found) {
      provider = found;
    } else {
      provider = {
        name: options.providerName,
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: options.apiKey || "",
        headers: {}
      };
    }
  }
  const apiKey = options.apiKey || provider.apiKey;
  console.log(`Buscando modelos dispon\xEDveis para o provedor '${provider.name}' (${provider.baseUrl})...
`);
  const catalog = new ModelCatalog({
    baseUrl: provider.baseUrl,
    apiKey,
    providerName: provider.name
  });
  const models = await catalog.fetchAvailableModels();
  console.log("Modelos Dispon\xEDveis:");
  for (const m of models) {
    const tag = m.isFree ? "[GRATUITO / FREE]" : "[PAGO]";
    const ctx = m.contextLength ? ` (${(m.contextLength / 1e3).toFixed(0)}k ctx)` : "";
    console.log(`  \u2022 ${m.id} ${tag}${ctx}`);
    if (m.description) {
      console.log(`    \u21B3 ${m.description}`);
    }
  }
  console.log(`
Total: ${models.length} modelos encontrados.`);
}
function createCli() {
  const program = new Command();
  program.name("agent").description("Assistente de c\xF3digo AI para terminal com consci\xEAncia de reposit\xF3rio").version("0.1.0").option("-p, --provider <provider>", "Define o provedor OpenAPI ativo (ex: openrouter, ollama, groq)").option("-m, --model <model>", "Define o modelo LLM a ser utilizado").option("-k, --key <key>", "Define temporariamente a API Key para a sess\xE3o").option("--models", "Lista todos os modelos dispon\xEDveis e identifica os gratuitos (:free)").option("--resume [sessionId]", "Retoma uma sess\xE3o de conversa anterior salva em disco").argument("[prompt...]", "Prompt opcional para executar em modo n\xE3o-interativo ou iniciar sess\xE3o").action(async (promptParts, options) => {
    if (options.models) {
      await listAvailableModels({
        providerName: options.provider,
        apiKey: options.key
      });
      return;
    }
    const config = defaultConfigManager.loadConfig();
    if (options.provider) {
      defaultConfigManager.setCurrentProvider(options.provider);
    }
    if (options.model) {
      defaultConfigManager.setCurrentModel(options.model);
    }
    const activeProvider = defaultConfigManager.getActiveProvider();
    const apiKey = options.key || activeProvider.apiKey;
    const model = options.model || config.currentModel;
    const tools = new ToolRegistry();
    for (const t of createFileTools()) tools.register(t);
    for (const t of createShellTools()) tools.register(t);
    for (const t of createGitTools()) tools.register(t);
    const memoryManager = new AgentMemoryManager(process.cwd());
    for (const t of memoryManager.createMemoryTools()) tools.register(t);
    const skillManager = new SkillManager({
      workspaceDir: process.cwd(),
      activeSkills: config.activeSkills
    });
    for (const t of skillManager.createSkillTools()) tools.register(t);
    await skillManager.discoverSkills();
    const pluginLoader = new PluginLoader({
      toolRegistry: tools,
      config
    });
    await pluginLoader.discoverAndLoad();
    const securityGuard = new SecurityGuard(config.permissions);
    const crawler = new CodebaseCrawler();
    const gitContext = new GitContext();
    const [repoStructure, gitSummary] = await Promise.all([
      crawler.getStructureSummary(),
      gitContext.getFormattedContext()
    ]);
    const systemPrompt = buildSystemPrompt({
      workingDirectory: process.cwd(),
      repoStructure,
      gitContext: gitSummary,
      customAddition: config.systemPromptAddition,
      activeSkills: skillManager.getInjectedSkillsPrompt(),
      agentMemory: memoryManager.getFormattedContext()
    });
    const client = new OpenApiClient({
      baseUrl: activeProvider.baseUrl,
      apiKey
    });
    const subagentManager = new SubagentManager();
    subagentManager.setDefaults({
      client,
      model,
      tools,
      securityGuard
    });
    for (const t of subagentManager.createSubagentTools()) tools.register(t);
    const toolCache = new ToolCache();
    const agentLoop = new AgentLoop({
      client,
      model,
      tools,
      securityGuard,
      systemPrompt,
      maxIterations: config.maxToolIterations,
      toolCache
    });
    const sessionManager = new SessionManager();
    let initialSessionId;
    if (options.resume) {
      if (typeof options.resume === "string") {
        initialSessionId = options.resume;
      } else {
        const latest = sessionManager.getLatestSession();
        if (latest) {
          initialSessionId = latest.id;
        }
      }
    }
    const promptText = promptParts.join(" ").trim();
    if (promptText) {
      process.stdout.write(`
\u2726 Antigravity Agent [${model}]

`);
      await agentLoop.runTurn(promptText, {
        onToken: (tok) => process.stdout.write(tok),
        onToolCallStart: (tc) => console.log(`
\u2699 [Ferramenta: ${tc.name}]`),
        onToolCallResult: (res) => console.log(`\u2714 [Resultado: ${res.name}]`)
      });
      process.stdout.write("\n\n");
      return;
    }
    const catalog = new ModelCatalog({
      baseUrl: activeProvider.baseUrl,
      apiKey,
      providerName: activeProvider.name
    });
    const availableModels = await catalog.fetchAvailableModels();
    const baseCommands = [
      { name: "/help", description: "Exibe lista de ajuda e comandos" },
      { name: "/config", description: "Configura\xE7\xE3o interativa de provedor e API Key por etapas" },
      { name: "/models", description: "Cat\xE1logo e seletor de modelos liberados pela chave" },
      { name: "/permissions", description: "Configurar modo de permiss\xF5es (ask, auto-safe, always-allow)" },
      { name: "/skills", description: "Gerenciar e ativar skills (SKILL.md) no agente" },
      { name: "/plugins", description: "Gerenciar plugins e extens\xF5es compat\xEDveis" },
      { name: "/compact", description: "Compacta\xE7\xE3o de contexto manual para liberar tokens" },
      { name: "/subagents", description: "Monitorar subagentes em segundo plano em tempo real" },
      { name: "/sessions", description: "Hist\xF3rico e altern\xE2ncia de sess\xF5es salvas" },
      { name: "/clear", description: "Limpa a tela e o hist\xF3rico da sess\xE3o" },
      { name: "/exit", description: "Salva a sess\xE3o e encerra o assistente" }
    ];
    for (const cmd of pluginLoader.getSlashCommands()) {
      baseCommands.push({
        name: `/${cmd.name}`,
        description: cmd.description
      });
    }
    const branch = await gitContext.getCurrentBranch();
    render(
      React11.createElement(AppContainer, {
        config,
        agentLoop,
        availableModels,
        availableCommands: baseCommands,
        workingDir: process.cwd(),
        gitBranch: branch,
        skillManager,
        pluginLoader,
        subagentManager,
        sessionManager,
        initialSessionId,
        onUpdateModel: (newModel) => {
          defaultConfigManager.setCurrentModel(newModel);
        },
        onUpdateProvider: (provider, baseUrl, key, newModel) => {
          defaultConfigManager.addOrUpdateProvider({
            name: provider,
            baseUrl,
            apiKey: key,
            headers: {},
            description: "Configurado via assistente"
          });
          defaultConfigManager.setCurrentProvider(provider);
          defaultConfigManager.setCurrentModel(newModel);
        },
        onUpdatePermissions: (mode) => {
          defaultConfigManager.setPermissionsMode(mode);
        }
      })
    );
  });
  program.command("config").description("Gerencia as configura\xE7\xF5es e credenciais do assistente passo a passo").option("--wizard", "Inicia o assistente interativo passo a passo").option("--list", "Exibe a configura\xE7\xE3o atual completa").option("--set-key <key>", "Salva a API Key do provedor ativo").option("--set-provider <provider>", "Altera o provedor padr\xE3o").option("--set-model <model>", "Altera o modelo padr\xE3o").option("--reset", "Restaura a configura\xE7\xE3o para os padr\xF5es originais").action(async (options) => {
    if (options.reset) {
      defaultConfigManager.resetToDefaults();
      console.log("\u2714 Configura\xE7\xE3o restaurada para os padr\xF5es originais.");
      return;
    }
    if (options.setProvider) {
      defaultConfigManager.setCurrentProvider(options.setProvider);
      console.log(`\u2714 Provedor ativo definido para: ${options.setProvider}`);
    }
    if (options.setModel) {
      defaultConfigManager.setCurrentModel(options.setModel);
      console.log(`\u2714 Modelo padr\xE3o definido para: ${options.setModel}`);
    }
    if (options.setKey) {
      const active = defaultConfigManager.getActiveProvider();
      defaultConfigManager.setProviderApiKey(active.name, options.setKey);
      console.log(`\u2714 Chave de API atualizada para o provedor '${active.name}'.`);
    }
    if (options.list) {
      const config = defaultConfigManager.loadConfig();
      console.log("\n--- Configura\xE7\xE3o Atual ---");
      console.log(`Arquivo: ${defaultConfigManager.getConfigPath()}`);
      console.log(`Provedor ativo: ${config.currentProvider}`);
      console.log(`Modelo ativo: ${config.currentModel}`);
      console.log(`Modo de permiss\xF5es: ${config.permissions.mode || "auto-safe"}`);
      console.log(`Skills ativas: ${(config.activeSkills || []).join(", ") || "(nenhuma)"}`);
      console.log(`Tema: ${config.theme}`);
      console.log("\nProvedores cadastrados:");
      for (const prov of config.providers) {
        const isSelected = prov.name === config.currentProvider ? " (ativo)" : "";
        const hasKey = prov.apiKey ? "\u2714 chave configurada" : "\u2716 sem chave";
        console.log(`  \u2022 ${prov.name}${isSelected}: ${prov.baseUrl} [${hasKey}]`);
      }
      console.log("---------------------------\n");
      return;
    }
    if (!options.setKey && !options.setProvider && !options.setModel) {
      await runInteractiveConfigWizard(defaultConfigManager);
    }
  });
  program.command("models").description("Lista os modelos dispon\xEDveis do provedor ativo e verifica modelos gratuitos").option("-p, --provider <provider>", "Provedor para consulta").option("-k, --key <key>", "Chave de API tempor\xE1ria").action(async (options) => {
    await listAvailableModels({
      providerName: options.provider,
      apiKey: options.key
    });
  });
  program.command("permissions").description("Visualiza ou altera o modo de permiss\xF5es de execu\xE7\xE3o (ask, auto-safe, always-allow)").argument("[mode]", "Modo de permiss\xE3o desejado: ask | auto-safe | always-allow").action(async (mode) => {
    const config = defaultConfigManager.loadConfig();
    if (!mode) {
      console.log(`
Modo de permiss\xE3o atual: '${config.permissions.mode || "auto-safe"}'`);
      console.log("Op\xE7\xF5es dispon\xEDveis:");
      console.log("  \u2022 auto-safe    (Recomendado: leituras autom\xE1ticas, confirma\xE7\xE3o para escrita/shell)");
      console.log("  \u2022 ask          (Estrito: pede confirma\xE7\xE3o para todas a\xE7\xF5es sens\xEDveis)");
      console.log("  \u2022 always-allow (Livre: sem pedidos de confirma\xE7\xE3o)\n");
      return;
    }
    const validModes = ["ask", "auto-safe", "always-allow"];
    if (!validModes.includes(mode)) {
      console.error(`Modo inv\xE1lido '${mode}'. Escolha um entre: ${validModes.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    defaultConfigManager.setPermissionsMode(mode);
    console.log(`\u2714 Modo de permiss\xE3o alterado com sucesso para: '${mode}'.`);
  });
  program.command("skills").description("Lista e inspeciona skills dispon\xEDveis (SKILL.md)").action(async () => {
    const config = defaultConfigManager.loadConfig();
    const skillManager = new SkillManager({
      workspaceDir: process.cwd(),
      activeSkills: config.activeSkills
    });
    const skills = await skillManager.discoverSkills();
    console.log(`
Skills Encontradas (${skills.length}):`);
    for (const s of skills) {
      const status = s.isActive ? "[ATIVA]" : "[INATIVA]";
      console.log(`  \u2022 ${s.name.padEnd(24)} ${status} - ${s.description}`);
    }
    console.log("\nUse /skills na TUI para ativar/desativar interativamente.\n");
  });
  program.command("plugins").description("Gerencia plugins compat\xEDveis com Claude Code e Gemini CLI").option("--install <path>", "Instala um plugin a partir de um diret\xF3rio ou arquivo local").action(async (options) => {
    const config = defaultConfigManager.loadConfig();
    const tools = new ToolRegistry();
    const loader = new PluginLoader({ toolRegistry: tools, config });
    await loader.discoverAndLoad();
    if (options.install) {
      console.log(`Instalando plugin de '${options.install}'...`);
      const res = await loader.installPlugin(options.install);
      if (res.success) {
        console.log(`\u2714 ${res.message}`);
      } else {
        console.error(`\u2716 ${res.message}`);
        process.exitCode = 1;
      }
      return;
    }
    const plugins = loader.getLoadedPlugins();
    console.log(`
Plugins Carregados (${plugins.length}):`);
    for (const p of plugins) {
      console.log(`  \u2022 ${p.name} (v${p.version}) - ${p.description || "(sem descri\xE7\xE3o)"}`);
    }
    console.log("\nPara instalar: agent plugins --install <caminho-do-plugin>\n");
  });
  program.command("sessions").description("Lista as sess\xF5es anteriores gravadas em disco").action(async () => {
    const sessionManager = new SessionManager();
    const sessions = sessionManager.listSessions();
    console.log(`
Sess\xF5es Salvas (${sessions.length}):`);
    if (sessions.length === 0) {
      console.log("  (Nenhuma sess\xE3o anterior encontrada)");
    } else {
      for (const s of sessions) {
        const dateStr = new Date(s.updatedAt).toLocaleString();
        console.log(`  \u2022 [${s.id}] ${s.title.padEnd(30)} | ${s.model} | ${s.messageCount} msgs (${dateStr})`);
      }
    }
    console.log("\nPara retomar: agent --resume <sessionId>\n");
  });
  program.command("memory").description("Gerencia a mem\xF3ria cont\xEDnua de longo prazo do projeto").option("--list", "Lista todos os fatos aprendidos gravados").option("--set <entry>", "Define um fato no formato chave=valor").action(async (options) => {
    const memoryManager = new AgentMemoryManager(process.cwd());
    if (options.set) {
      const parts = options.set.split("=");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const fact = parts.slice(1).join("=").trim();
        memoryManager.saveFact(key, fact);
        console.log(`\u2714 Fato gravado na mem\xF3ria: [${key}] => "${fact}"`);
        return;
      }
    }
    const mem = memoryManager.loadMemory();
    const keys = Object.keys(mem.facts);
    console.log(`
Mem\xF3ria do Projeto (${keys.length} fatos gravados):`);
    if (keys.length === 0) {
      console.log("  (Nenhum fato gravado ainda)");
    } else {
      for (const k of keys) {
        console.log(`  \u2022 [${k}]: ${mem.facts[k].fact}`);
      }
    }
    console.log("");
  });
  return program;
}

// src/index.ts
async function main(argv = process.argv) {
  const cli = createCli();
  await cli.parseAsync(argv);
}
if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js")) {
  main().catch((err) => {
    console.error("Erro na execu\xE7\xE3o do CLI:", err);
    process.exit(1);
  });
}
export {
  main
};
//# sourceMappingURL=index.js.map