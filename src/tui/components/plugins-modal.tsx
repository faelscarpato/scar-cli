import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { ThemeColors } from '../theme.js';
import { PluginLoader } from '../../plugins/plugin-loader.js';
import { PluginManifest } from '../../plugins/plugin-types.js';

export interface PluginsModalProps {
  pluginLoader: PluginLoader;
  theme: ThemeColors;
  onClose: () => void;
}

export const PluginsModal: React.FC<PluginsModalProps> = ({
  pluginLoader,
  theme,
  onClose,
}) => {
  const [plugins, setPlugins] = useState<PluginManifest[]>(() => pluginLoader.getLoadedPlugins());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installPath, setInstallPath] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleInstallSubmit = async (pathInput: string) => {
    if (!pathInput.trim()) {
      setIsInstalling(false);
      return;
    }

    setStatusMessage('Instalando plugin...');
    const res = await pluginLoader.installPlugin(pathInput.trim());
    if (res.success) {
      setStatusMessage(`✔ ${res.message}`);
      setPlugins(pluginLoader.getLoadedPlugins());
      setIsInstalling(false);
      setInstallPath('');
    } else {
      setStatusMessage(`✖ ${res.message}`);
    }
  };

  useInput((input, key) => {
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

    if (input.toLowerCase() === 'i') {
      setIsInstalling(true);
      setStatusMessage(null);
      return;
    }

    if (plugins.length > 0) {
      if (key.upArrow) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : plugins.length - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => (prev < plugins.length - 1 ? prev + 1 : 0));
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
          ✦ Plugins & Extensões Compatíveis (Claude Code / Gemini CLI)
        </Text>
        <Text color={theme.muted}>[Esc para Fechar]</Text>
      </Box>

      {statusMessage && (
        <Box marginY={0}>
          <Text color={statusMessage.startsWith('✔') ? theme.success : theme.error}>
            {statusMessage}
          </Text>
        </Box>
      )}

      {isInstalling ? (
        <Box flexDirection="column" marginY={1}>
          <Text bold color={theme.secondary}>
            Instalar Plugin a partir de Diretório Local ou Pacote:
          </Text>
          <Text color={theme.muted}>
            Digite o caminho da pasta com o plugin (ou Esc para cancelar):
          </Text>
          <Box borderStyle="single" borderColor={theme.border} paddingX={1} marginY={1}>
            <TextInput
              value={installPath}
              onChange={setInstallPath}
              onSubmit={handleInstallSubmit}
              placeholder="./meu-plugin ou /caminho/para/plugin"
            />
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          {plugins.length === 0 ? (
            <Box flexDirection="column" marginY={1}>
              <Text color={theme.muted}>
                Nenhum plugin instalado em .cli/plugins/ ou diretórios compatíveis.
              </Text>
              <Text color={theme.secondary}>
                Pressione 'i' para instalar um plugin a partir de um caminho local.
              </Text>
            </Box>
          ) : (
            <Box flexDirection="column" marginY={1}>
              <Text bold color={theme.secondary}>
                Plugins Instalados ({plugins.length}):
              </Text>
              {plugins.map((p, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <Box key={p.name} flexDirection="row">
                    <Text color={isSelected ? theme.primary : undefined} bold={isSelected}>
                      {isSelected ? '▶ ' : '  '}
                      {p.name} (v{p.version})
                    </Text>
                    {p.description && (
                      <Text color={theme.muted}> - {p.description}</Text>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}

          <Box marginTop={1}>
            <Text color={theme.muted}>
              Pressione <Text color={theme.primary} bold>'i'</Text> para instalar novo plugin • Esc para sair
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
