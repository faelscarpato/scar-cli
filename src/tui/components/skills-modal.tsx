import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { ThemeColors } from '../theme.js';
import { SkillManager, Skill } from '../../skills/skill-manager.js';

export interface SkillsModalProps {
  skillManager: SkillManager;
  theme: ThemeColors;
  onToggleSkill: (skillName: string) => void;
  onClose: () => void;
}

export const SkillsModal: React.FC<SkillsModalProps> = ({
  skillManager,
  theme,
  onToggleSkill,
  onClose,
}) => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    skillManager.discoverSkills().then((discovered) => {
      setSkills(discovered);
      setLoading(false);
    });
  }, [skillManager]);

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (skills.length === 0) return;

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : skills.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < skills.length - 1 ? prev + 1 : 0));
    } else if (key.return || input === ' ') {
      const selected = skills[selectedIndex];
      if (selected) {
        onToggleSkill(selected.name);
        setSkills((prev) =>
          prev.map((s, idx) =>
            idx === selectedIndex ? { ...s, isActive: !s.isActive } : s,
          ),
        );
      }
    }
  });

  const selectedSkill = skills[selectedIndex];

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
          ✦ Catálogo de Skills (SKILL.md)
        </Text>
        <Text color={theme.muted}>[Esc para Fechar]</Text>
      </Box>

      {loading && (
        <Box flexDirection="row">
          <Text color={theme.warning}>
            <Spinner type="dots" /> Buscando skills nos diretórios locais e globais...
          </Text>
        </Box>
      )}

      {!loading && skills.length === 0 && (
        <Box flexDirection="column">
          <Text color={theme.muted}>
            Nenhuma skill encontrada (.skills/, skills/, ~/.gemini/config/plugins/.../skills/).
          </Text>
          <Text color={theme.secondary}>
            Você pode criar um arquivo SKILL.md dentro de .skills/nome-da-skill/ para definir instruções personalizadas.
          </Text>
        </Box>
      )}

      {!loading && skills.length > 0 && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color={theme.secondary} bold>
              Selecione uma skill (Espaço ou Enter para ativar/desativar):
            </Text>
          </Box>

          {skills.slice(Math.max(0, selectedIndex - 4), selectedIndex + 5).map((s, idx) => {
            const actualIdx = Math.max(0, selectedIndex - 4) + idx;
            const isSelected = actualIdx === selectedIndex;
            const statusTag = s.isActive ? '[ATIVA]' : '[INATIVA]';

            return (
              <Box key={s.name} flexDirection="row">
                <Text color={isSelected ? theme.primary : undefined} bold={isSelected}>
                  {isSelected ? '▶ ' : '  '}
                  {s.name.padEnd(26)}
                </Text>
                <Text color={s.isActive ? theme.success : theme.muted}> {statusTag} </Text>
                <Text color={theme.muted}> - {s.description.slice(0, 50)}</Text>
              </Box>
            );
          })}

          {selectedSkill && (
            <Box
              marginTop={1}
              borderStyle="single"
              borderColor={theme.border}
              paddingX={1}
              flexDirection="column"
            >
              <Text bold color={theme.primary}>
                Skill: {selectedSkill.name} ({selectedSkill.isActive ? 'Ativa no Agente' : 'Inativa'})
              </Text>
              <Text color={theme.secondary}>Caminho: {selectedSkill.filePath}</Text>
              <Text color={theme.muted}>
                {selectedSkill.content.slice(0, 200)}...
              </Text>
            </Box>
          )}

          <Box marginTop={1}>
            <Text color={theme.muted}>
              Navegue com ↑/↓ ({selectedIndex + 1}/{skills.length}) • Espaço/Enter para alternar • Esc para sair
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
