import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { ThemeColors } from '../theme.js';
import { ModelCatalog } from '../../provider/model-catalog.js';
import { ModelInfo } from '../../provider/types.js';

export interface ConfigWizardProps {
  currentProvider: string;
  currentModel: string;
  theme: ThemeColors;
  onSave: (result: {
    provider: string;
    baseUrl: string;
    apiKey: string;
    model: string;
  }) => void;
  onClose: () => void;
}

const PROVIDERS = [
  {
    name: 'openrouter',
    label: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1',
    description: 'Acesso a centenas de modelos, incluindo modelos :free gratuitos',
  },
  {
    name: 'ollama',
    label: 'Ollama Local',
    url: 'http://localhost:11434/v1',
    description: '100% gratuito e offline em http://localhost:11434 (sem API key)',
  },
  {
    name: 'groq',
    label: 'Groq Cloud',
    url: 'https://api.groq.com/openai/v1',
    description: 'Inferência ultra-rápida LPU com tier gratuito',
  },
  {
    name: 'custom',
    label: 'OpenAPI Customizado',
    url: 'http://localhost:8000/v1',
    description: 'Provedor personalizado compatível com OpenAPI / OpenAI',
  },
];

export const ConfigWizard: React.FC<ConfigWizardProps> = ({
  currentProvider,
  currentModel,
  theme,
  onSave,
  onClose,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [providerIndex, setProviderIndex] = useState(() => {
    const idx = PROVIDERS.findIndex((p) => p.name === currentProvider);
    return idx >= 0 ? idx : 0;
  });

  const [baseUrl, setBaseUrl] = useState(PROVIDERS[0].url);
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [fetchedModels, setFetchedModels] = useState<ModelInfo[]>([]);
  const [modelIndex, setModelIndex] = useState(0);

  // Atualiza default url quando troca de provedor
  useEffect(() => {
    setBaseUrl(PROVIDERS[providerIndex].url);
  }, [providerIndex]);

  const runConnectionTest = async () => {
    setTesting(true);
    setTestError(null);

    const providerObj = PROVIDERS[providerIndex];
    const catalog = new ModelCatalog({
      baseUrl,
      apiKey: apiKey || (providerObj.name === 'ollama' ? 'ollama' : ''),
      providerName: providerObj.name,
    });

    try {
      const res = await catalog.testConnectionAndFetchModels();
      if (!res.success) {
        setTestError(res.error || 'Falha de conexão com o provedor.');
        setTesting(false);
      } else {
        setFetchedModels(res.models);
        setModelIndex(0);
        setTesting(false);
        setStep(5);
      }
    } catch (err: unknown) {
      setTestError((err as Error).message);
      setTesting(false);
    }
  };

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    // ETAPA 1: Seleção de Provedor
    if (step === 1) {
      if (key.upArrow) {
        setProviderIndex((prev) => (prev > 0 ? prev - 1 : PROVIDERS.length - 1));
      } else if (key.downArrow) {
        setProviderIndex((prev) => (prev < PROVIDERS.length - 1 ? prev + 1 : 0));
      } else if (key.return) {
        setStep(2);
      }
      return;
    }

    // ETAPA 4: Tela de resultado do teste
    if (step === 4) {
      if (testError) {
        if (input.toLowerCase() === 'r') {
          runConnectionTest();
        } else if (input.toLowerCase() === 'c') {
          // Voltar para corrigir a chave
          setStep(3);
        } else if (key.return) {
          // Pular mesmo com erro e usar fallback
          const catalog = new ModelCatalog({
            baseUrl,
            apiKey,
            providerName: PROVIDERS[providerIndex].name,
          });
          setFetchedModels(catalog.getFallbackModels());
          setModelIndex(0);
          setStep(5);
        }
      }
      return;
    }

    // ETAPA 5: Seleção de Modelo
    if (step === 5) {
      if (key.upArrow) {
        setModelIndex((prev) => (prev > 0 ? prev - 1 : fetchedModels.length - 1));
      } else if (key.downArrow) {
        setModelIndex((prev) => (prev < fetchedModels.length - 1 ? prev + 1 : 0));
      } else if (key.return) {
        const selected = fetchedModels[modelIndex]?.id || currentModel;
        onSave({
          provider: PROVIDERS[providerIndex].name,
          baseUrl,
          apiKey: apiKey || (PROVIDERS[providerIndex].name === 'ollama' ? 'ollama' : ''),
          model: selected,
        });
      }
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.primary}
      paddingX={1}
      marginY={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color={theme.primary} bold>
          ✦ Assistente de Configuração por Etapas (Etapa {step} de 5)
        </Text>
        <Text color={theme.muted}>[Esc para Cancelar]</Text>
      </Box>

      {/* ETAPA 1: Provedor */}
      {step === 1 && (
        <Box flexDirection="column">
          <Text bold color={theme.secondary}>
            Etapa 1: Escolha o Provedor OpenAPI (Navegue com ↑/↓ e confirme com Enter):
          </Text>
          {PROVIDERS.map((p, idx) => {
            const isSelected = idx === providerIndex;
            return (
              <Box key={p.name} flexDirection="column" marginY={0}>
                <Box flexDirection="row">
                  <Text color={isSelected ? theme.primary : undefined} bold={isSelected}>
                    {isSelected ? '▶ ' : '  '}
                    {p.label.padEnd(20)}
                  </Text>
                  <Text color={theme.muted}>- {p.description}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* ETAPA 2: URL Base */}
      {step === 2 && (
        <Box flexDirection="column">
          <Text bold color={theme.secondary}>
            Etapa 2: URL Base da API do Provedor:
          </Text>
          <Text color={theme.muted}>
            Pressione Enter para confirmar a URL ou digite para alterar:
          </Text>
          <Box borderStyle="single" borderColor={theme.border} marginY={1} paddingX={1}>
            <TextInput
              value={baseUrl}
              onChange={setBaseUrl}
              onSubmit={() => setStep(3)}
            />
          </Box>
          <Text color={theme.muted}>Pressione Enter para prosseguir para a chave de API.</Text>
        </Box>
      )}

      {/* ETAPA 3: Chave de API */}
      {step === 3 && (
        <Box flexDirection="column">
          <Text bold color={theme.secondary}>
            Etapa 3: Chave de API (API Key) para '{PROVIDERS[providerIndex].label}':
          </Text>
          {PROVIDERS[providerIndex].name === 'ollama' ? (
            <Text color={theme.success}>
              ✔ Ollama local não requer chave. Pressione Enter para testar conexão.
            </Text>
          ) : (
            <Text color={theme.muted}>
              Digite ou cole sua chave de API abaixo:
            </Text>
          )}
          <Box borderStyle="single" borderColor={theme.border} marginY={1} paddingX={1}>
            <TextInput
              value={apiKey}
              onChange={setApiKey}
              mask="*"
              onSubmit={() => {
                setStep(4);
                runConnectionTest();
              }}
            />
          </Box>
          <Text color={theme.muted}>Pressione Enter para testar a conexão com o provedor.</Text>
        </Box>
      )}

      {/* ETAPA 4: Teste Real de Conexão */}
      {step === 4 && (
        <Box flexDirection="column" marginY={1}>
          {testing && (
            <Box flexDirection="row">
              <Text color={theme.warning}>
                <Spinner type="dots" /> Testando conexão real com {baseUrl}...
              </Text>
            </Box>
          )}

          {!testing && testError && (
            <Box flexDirection="column">
              <Text color={theme.error} bold>
                ✖ Falha na conexão ou autenticação:
              </Text>
              <Text color={theme.error}>{testError}</Text>
              <Box marginTop={1} flexDirection="column">
                <Text color={theme.primary}>
                  • Pressione <Text bold>'r'</Text> para tentar novamente.
                </Text>
                <Text color={theme.secondary}>
                  • Pressione <Text bold>'c'</Text> para corrigir a chave de API.
                </Text>
                <Text color={theme.muted}>
                  • Pressione <Text bold>Enter</Text> para ignorar e salvar assim mesmo.
                </Text>
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* ETAPA 5: Seleção de Modelo */}
      {step === 5 && (
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Text bold color={theme.secondary}>
              Etapa 5: Selecione o Modelo Padrão (Enter para salvar):
            </Text>
            <Text color={theme.success}>
              ✔ {fetchedModels.length} modelos liberados encontrados
            </Text>
          </Box>

          <Box flexDirection="column" marginY={1}>
            {fetchedModels.slice(Math.max(0, modelIndex - 4), modelIndex + 5).map((m, idx) => {
              const actualIdx = Math.max(0, modelIndex - 4) + idx;
              const isSelected = actualIdx === modelIndex;
              const tag = m.isFree ? '[FREE]' : '[PAID]';
              return (
                <Box key={m.id} flexDirection="row">
                  <Text color={isSelected ? theme.primary : undefined} bold={isSelected}>
                    {isSelected ? '▶ ' : '  '}
                    {m.id}
                  </Text>
                  <Text color={m.isFree ? theme.success : theme.muted}> {tag}</Text>
                </Box>
              );
            })}
          </Box>
          <Text color={theme.muted}>
            Navegue com ↑/↓ ({modelIndex + 1}/{fetchedModels.length}). Pressione Enter para concluir e salvar.
          </Text>
        </Box>
      )}
    </Box>
  );
};
