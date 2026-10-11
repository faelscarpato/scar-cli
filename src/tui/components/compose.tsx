import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { ThemeColors } from '../theme.js';

export interface ComposeProps {
  onSubmit: (text: string) => void;
  onChange?: (text: string) => void;
  theme: ThemeColors;
  placeholder?: string;
  disabled?: boolean;
}

export const Compose: React.FC<ComposeProps> = ({
  onSubmit,
  onChange,
  theme,
  placeholder = 'Digite uma mensagem ou / para ver comandos...',
  disabled = false,
}) => {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  useInput((input, key) => {
    if (disabled) return;

    if (key.upArrow && !value.startsWith('/')) {
      if (history.length > 0) {
        const nextIdx = historyIndex + 1;
        if (nextIdx < history.length) {
          setHistoryIndex(nextIdx);
          const historicalText = history[history.length - 1 - nextIdx];
          setValue(historicalText);
          onChange?.(historicalText);
        }
      }
    } else if (key.downArrow && !value.startsWith('/')) {
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        const historicalText = history[history.length - 1 - nextIdx];
        setValue(historicalText);
        onChange?.(historicalText);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setValue('');
        onChange?.('');
      }
    }
  });

  const handleChange = (newValue: string) => {
    setValue(newValue);
    onChange?.(newValue);
  };

  const handleSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);
    setValue('');
    onSubmit(trimmed);
  };

  return (
    <Box
      borderStyle="round"
      borderColor={disabled ? theme.muted : theme.border}
      paddingX={1}
      flexDirection="row"
    >
      <Text color={theme.primary} bold>
        ❯{' '}
      </Text>
      {disabled ? (
        <Text color={theme.muted}>Aguardando resposta do agente...</Text>
      ) : (
        <TextInput
          value={value}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder={placeholder}
        />
      )}
    </Box>
  );
};
