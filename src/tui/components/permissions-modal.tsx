import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { ThemeColors } from '../theme.js';

export interface PermissionsModalProps {
  currentMode: 'ask' | 'auto-safe' | 'always-allow';
  theme: ThemeColors;
  onSelectMode: (mode: 'ask' | 'auto-safe' | 'always-allow') => void;
  onClose: () => void;
}

const MODES: Array<{
  id: 'ask' | 'auto-safe' | 'always-allow';
  title: string;
  description: string;
}> = [
  {
    id: 'auto-safe',
    title: 'auto-safe (Recomendado)',
    description: 'Leituras são automáticas. Pede confirmação para modificações de arquivos e comandos shell.',
  },
  {
    id: 'ask',
    title: 'ask (Estrito)',
    description: 'Sempre pede autorização antes de executar ferramentas sensíveis, escritas e comandos.',
  },
  {
    id: 'always-allow',
    title: 'always-allow (Livre / Perigoso)',
    description: 'Permite todas as operações de arquivos e shell automaticamente sem pedir confirmação.',
  },
];

export const PermissionsModal: React.FC<PermissionsModalProps> = ({
  currentMode,
  theme,
  onSelectMode,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = MODES.findIndex((m) => m.id === currentMode);
    return idx >= 0 ? idx : 0;
  });

  useInput((_, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : MODES.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < MODES.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      onSelectMode(MODES[selectedIndex].id);
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
          ✦ Gerenciamento de Permissões de Execução
        </Text>
        <Text color={theme.muted}>[Esc para Fechar]</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color={theme.secondary} bold>
          Selecione o nível de permissão (Navegue com ↑/↓ e confirme com Enter):
        </Text>
      </Box>

      {MODES.map((m, idx) => {
        const isSelected = idx === selectedIndex;
        const isCurrent = m.id === currentMode;
        return (
          <Box key={m.id} flexDirection="column" marginY={0}>
            <Box flexDirection="row">
              <Text color={isSelected ? theme.primary : undefined} bold={isSelected}>
                {isSelected ? '▶ ' : '  '}
                {m.title}
              </Text>
              {isCurrent && <Text color={theme.success}> (ativo)</Text>}
            </Box>
            <Box paddingLeft={4}>
              <Text color={theme.muted}>↳ {m.description}</Text>
            </Box>
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text color={theme.muted}>
          Enter para confirmar novo modo de permissão • Esc para cancelar
        </Text>
      </Box>
    </Box>
  );
};
