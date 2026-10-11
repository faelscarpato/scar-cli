import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { ThemeColors } from '../theme.js';

export interface SlashMenuItem {
  name: string;
  description: string;
}

export interface CommandMenuProps {
  input: string;
  commands: SlashMenuItem[];
  onSelect: (commandName: string) => void;
  theme: ThemeColors;
}

export const CommandMenu: React.FC<CommandMenuProps> = ({
  input,
  commands,
  onSelect,
  theme,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filtra itens com base no que foi digitado após a barra
  const query = input.startsWith('/') ? input.slice(1).toLowerCase().trim() : '';
  const filtered = commands.filter((c) => {
    const cleanName = c.name.startsWith('/') ? c.name.slice(1) : c.name;
    return cleanName.toLowerCase().includes(query) || c.description.toLowerCase().includes(query);
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [input]);

  useInput((_, key) => {
    if (filtered.length === 0) return;

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (key.tab || (key.return && input.startsWith('/') && !input.includes(' '))) {
      const selected = filtered[selectedIndex];
      if (selected) {
        const fullCmd = selected.name.startsWith('/') ? selected.name : `/${selected.name}`;
        onSelect(fullCmd);
      }
    }
  });

  if (!input.startsWith('/') || filtered.length === 0) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={theme.primary}
      paddingX={1}
      marginTop={0}
    >
      <Text color={theme.muted} bold>
        Comandos disponíveis (Navegue com ↑/↓, selecione com Tab ou Enter):
      </Text>
      {filtered.slice(0, 8).map((cmd, idx) => {
        const isSelected = idx === selectedIndex;
        const prefix = isSelected ? '▶ ' : '  ';
        const formattedName = cmd.name.startsWith('/') ? cmd.name : `/${cmd.name}`;

        return (
          <Box key={cmd.name} flexDirection="row">
            <Text color={isSelected ? theme.primary : undefined} bold={isSelected}>
              {prefix}
              {formattedName.padEnd(14)}
            </Text>
            <Text color={theme.muted}> - {cmd.description}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
