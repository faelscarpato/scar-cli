import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { ModelInfo } from '../../provider/types.js';
import { ThemeColors } from '../theme.js';

export interface ModelSelectorProps {
  models: ModelInfo[];
  currentModel: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
  theme: ThemeColors;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  models,
  currentModel,
  onSelect,
  onClose,
  theme,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filterFreeOnly, setFilterFreeOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const filtered = models.filter((m) => {
    if (filterFreeOnly && !m.isFree) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return m.id.toLowerCase().includes(q) || (m.name && m.name.toLowerCase().includes(q));
    }
    return true;
  });

  useInput((input, key) => {
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

    if (input.toLowerCase() === 's') {
      setIsSearching(true);
      return;
    }

    if (input.toLowerCase() === 'f' || key.tab) {
      setFilterFreeOnly((prev) => !prev);
      setSelectedIndex(0);
      return;
    }

    if (filtered.length > 0) {
      if (key.upArrow) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
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
          ✦ Catálogo Real de Modelos LLM ({filtered.length} disponíveis)
        </Text>
        <Box flexDirection="row">
          <Text color={filterFreeOnly ? theme.success : theme.muted}>
            {filterFreeOnly ? '[Apenas Free/Gratuitos]' : '[Todos os Modelos]'}
          </Text>
          <Text color={theme.muted}> | Esc para fechar</Text>
        </Box>
      </Box>

      {/* Barra de Pesquisa */}
      {isSearching ? (
        <Box borderStyle="single" borderColor={theme.primary} paddingX={1} marginY={0}>
          <Text color={theme.primary} bold>Buscar: </Text>
          <TextInput
            value={searchQuery}
            onChange={(val) => {
              setSearchQuery(val);
              setSelectedIndex(0);
            }}
            onSubmit={() => setIsSearching(false)}
            placeholder="Digite parte do nome ou id do modelo..."
          />
        </Box>
      ) : (
        searchQuery && (
          <Box marginBottom={1}>
            <Text color={theme.secondary}>Filtro de busca ativo: "{searchQuery}" (Pressione 's' para alterar)</Text>
          </Box>
        )
      )}

      {/* Lista de Modelos com scroll por janela */}
      {filtered.length === 0 ? (
        <Text color={theme.muted}>Nenhum modelo encontrado para o filtro atual.</Text>
      ) : (
        visibleModels.map((m, idx) => {
          const actualIdx = windowStart + idx;
          const isSelected = actualIdx === selectedIndex;
          const isCurrent = m.id === currentModel;
          const prefix = isSelected ? '▶ ' : '  ';
          const tag = m.isFree ? '[FREE]' : '[PAID]';
          const currentMarker = isCurrent ? ' (atual)' : '';
          const ctx = m.contextLength ? ` (${(m.contextLength / 1000).toFixed(0)}k ctx)` : '';

          return (
            <Box key={m.id} flexDirection="row">
              <Text color={isSelected ? theme.primary : undefined} bold={isSelected}>
                {prefix}
                {m.id}
              </Text>
              <Text color={m.isFree ? theme.success : theme.muted}> {tag}</Text>
              <Text color={theme.muted}>{ctx}</Text>
              <Text color={theme.secondary}>{currentMarker}</Text>
            </Box>
          );
        })
      )}

      {/* Detalhes do Modelo Selecionado */}
      {selectedModelInfo && (
        <Box
          marginTop={1}
          borderStyle="single"
          borderColor={theme.border}
          paddingX={1}
          flexDirection="column"
        >
          <Text color={theme.primary} bold>
            {selectedModelInfo.name || selectedModelInfo.id} {selectedModelInfo.isFree ? '• Gratuito' : '• Pago'}
          </Text>
          {selectedModelInfo.description && (
            <Text color={theme.muted}>
              {selectedModelInfo.description.slice(0, 160)}
            </Text>
          )}
        </Box>
      )}

      <Box marginTop={1} justifyContent="space-between">
        <Text color={theme.muted}>
          Navegue ↑/↓ ({filtered.length > 0 ? selectedIndex + 1 : 0}/{filtered.length}) • Enter seleciona • 'f' alterna Free • 's' busca
        </Text>
      </Box>
    </Box>
  );
};
