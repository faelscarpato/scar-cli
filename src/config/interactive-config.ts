import readline from 'node:readline';
import { ConfigManager, defaultConfigManager } from './config-manager.js';
import { ModelCatalog } from '../provider/model-catalog.js';
import { ModelInfo } from '../provider/types.js';

function askQuestion(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer.trim());
    });
  });
}

export interface WizardResult {
  provider: string;
  baseUrl: string;
  apiKey: string;
  selectedModel: string;
}

export async function runInteractiveConfigWizard(
  configManager: ConfigManager = defaultConfigManager,
  io?: { input: NodeJS.ReadableStream; output: NodeJS.WritableStream },
): Promise<WizardResult> {
  const rl = readline.createInterface({
    input: io?.input || process.stdin,
    output: io?.output || process.stdout,
  });

  try {
    const config = configManager.loadConfig();
    console.log('\n======================================================');
    console.log('✦ Assistente Interativo de Configuração de Provedor ✦');
    console.log('======================================================\n');

    // ETAPA 1: Provedor
    console.log('Etapa 1/5: Escolha o Provedor de Modelos:');
    console.log('  1) OpenRouter (Acesso a centenas de modelos, incluindo :free)');
    console.log('  2) Ollama Local (100% gratuito e offline em http://localhost:11434)');
    console.log('  3) Groq Cloud (Inferência ultra-rápida LPU com tier gratuito)');
    console.log('  4) Provedor Customizado compatível com OpenAPI / OpenAI');

    const providerChoice = await askQuestion(rl, '\nSelecione o provedor [1-4] (padrão: 1): ');
    let providerName = 'openrouter';
    let defaultUrl = 'https://openrouter.ai/api/v1';

    if (providerChoice === '2' || providerChoice.toLowerCase() === 'ollama') {
      providerName = 'ollama';
      defaultUrl = 'http://localhost:11434/v1';
    } else if (providerChoice === '3' || providerChoice.toLowerCase() === 'groq') {
      providerName = 'groq';
      defaultUrl = 'https://api.groq.com/openai/v1';
    } else if (providerChoice === '4' || providerChoice.toLowerCase() === 'custom') {
      providerName = 'custom';
      defaultUrl = 'http://localhost:8000/v1';
    }

    // ETAPA 2: URL Base
    console.log(`\nEtapa 2/5: URL Base da API do Provedor:`);
    const customUrl = await askQuestion(rl, `Informe a URL base [Enter para manter '${defaultUrl}']: `);
    const baseUrl = customUrl || defaultUrl;

    // ETAPA 3: Chave de API
    console.log(`\nEtapa 3/5: Chave de API (API Key) para '${providerName}':`);
    if (providerName === 'ollama') {
      console.log('  (Ollama local normalmente não requer chave. Pressione Enter para prosseguir)');
    } else if (providerName === 'openrouter') {
      console.log('  (Obtenha sua chave gratuita ou pré-paga em https://openrouter.ai/keys)');
    } else if (providerName === 'groq') {
      console.log('  (Obtenha sua chave gratuita em https://console.groq.com/keys)');
    }

    const existingKey = config.providers.find((p) => p.name === providerName)?.apiKey || '';
    const keyPrompt = existingKey
      ? `Cole sua API Key [Enter para manter a existente]: `
      : `Cole sua API Key: `;
    const enteredKey = await askQuestion(rl, keyPrompt);
    const apiKey = enteredKey || (existingKey || (providerName === 'ollama' ? 'ollama' : ''));

    // ETAPA 4: Teste Real de Conexão e Carregamento de Modelos
    console.log(`\nEtapa 4/5: Testando conexão real e buscando modelos liberados pela chave...`);
    const catalog = new ModelCatalog({
      baseUrl,
      apiKey,
      providerName,
    });

    const testRes = await catalog.testConnectionAndFetchModels();
    let availableModels: ModelInfo[] = [];

    if (!testRes.success) {
      console.log(`\n✖ Falha na conexão/autenticação: ${testRes.error}`);
      const proceed = await askQuestion(
        rl,
        'Deseja salvar a configuração mesmo assim e usar modelos padrão? (s/N): ',
      );
      if (proceed.toLowerCase() !== 's' && proceed.toLowerCase() !== 'sim') {
        throw new Error(`Configuração cancelada devido a erro de conexão: ${testRes.error}`);
      }
      availableModels = catalog.getFallbackModels();
    } else {
      availableModels = testRes.models;
      const freeCount = availableModels.filter((m) => m.isFree).length;
      console.log(`✔ Conexão estabelecida com sucesso!`);
      console.log(`✔ Total de modelos liberados encontrados: ${availableModels.length} (${freeCount} gratuitos / :free)\n`);
    }

    // ETAPA 5: Seleção do Modelo Inicial
    console.log('Etapa 5/5: Escolha o Modelo Padrão:');
    const displayList = availableModels.slice(0, 15);
    displayList.forEach((m, idx) => {
      const tag = m.isFree ? '[GRATUITO / FREE]' : '[PAGO]';
      console.log(`  ${idx + 1}) ${m.id} ${tag}`);
    });

    if (availableModels.length > 15) {
      console.log(`  ... e mais ${availableModels.length - 15} modelos disponíveis.`);
    }

    const defaultModelChoice = displayList[0]?.id || 'google/gemini-2.5-flash:free';
    const modelAnswer = await askQuestion(
      rl,
      `\nSelecione o número [1-${displayList.length}] ou digite o ID do modelo [Enter para '${defaultModelChoice}']: `,
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

    // Salvar configuração persistente
    configManager.addOrUpdateProvider({
      name: providerName,
      baseUrl,
      apiKey,
      headers: {},
      description: `Configurado em ${new Date().toLocaleDateString()}`,
    });
    configManager.setCurrentProvider(providerName);
    configManager.setCurrentModel(selectedModel);

    console.log('\n======================================================');
    console.log('✔ Configuração concluída e salva com sucesso!');
    console.log(`  Provedor ativo: ${providerName}`);
    console.log(`  URL: ${baseUrl}`);
    console.log(`  Modelo: ${selectedModel}`);
    console.log(`  Arquivo de configuração: ${configManager.getConfigPath()}`);
    console.log('======================================================\n');

    return {
      provider: providerName,
      baseUrl,
      apiKey,
      selectedModel,
    };
  } finally {
    rl.close();
  }
}
