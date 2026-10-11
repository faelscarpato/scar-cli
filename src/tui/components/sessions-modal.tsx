import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { SessionManager, SessionMetadata } from '../../session/session-manager.js';
import { ThemeColors } from '../theme.js';

export interface SessionsModalProps {
  sessionManager: SessionManager;
  currentSessionId?: string;
  theme: ThemeColors;
  onResume: (sessionId: string) => void;
  onClose: () => void;
}

export const SessionsModal: React.FC<SessionsModalProps> = ({
  sessionManager,
  currentSessionId,
  theme,
  onResume,
  onClose,
}) => {
  const [sessions, setSessions] = useState<SessionMetadata[]>(() => sessionManager.listSessions());
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.escape || input === 'q' || input === 'Q') {
      onClose();
      return;
    }

    if (sessions.length === 0) return;

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : sessions.length - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev < sessions.length - 1 ? prev + 1 : 0));
    }

    if (key.return) {
      const selected = sessions[selectedIndex];
      if (selected) {
        onResume(selected.id);
      }
    }

    if (input === 'd' || input === 'D') {
      const selected = sessions[selectedIndex];
      if (selected && selected.id !== currentSessionId) {
        sessionManager.deleteSession(selected.id);
        const updated = sessionManager.listSessions();
        setSessions(updated);
        setSelectedIndex((prev) => Math.min(prev, Math.max(0, updated.length - 1)));
      }
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.primary}
      paddingX={1}
      paddingY={1}
      marginY={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color={theme.primary} bold>
          📁 Histórico de Sessões Anteriores Salvas
        </Text>
        <Text color={theme.muted}>[Enter] Retomar • [D] Excluir • [Esc] Fechar</Text>
      </Box>

      {sessions.length === 0 ? (
        <Box marginY={1}>
          <Text color={theme.muted}>Nenhuma sessão anterior gravada em disco.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box justifyContent="space-between" marginBottom={1}>
            <Text color={theme.muted}>
              Selecione uma sessão anterior para retomar todo o histórico:
            </Text>
            <Text color={theme.secondary}>Total: {sessions.length} sessões</Text>
          </Box>

          {sessions.map((s, idx) => {
            const isSelected = idx === selectedIndex;
            const isCurrent = s.id === currentSessionId;
            const dateStr = new Date(s.updatedAt).toLocaleString();

            return (
              <Box key={s.id} justifyContent="space-between" marginY={0}>
                <Box>
                  <Text color={isSelected ? theme.primary : undefined} bold={isSelected}>
                    {isSelected ? '▶ ' : '  '}
                    <Text bold>{s.title.slice(0, 35)}</Text>
                    {isCurrent && <Text color={theme.warning}> (atual)</Text>}
                  </Text>
                </Box>
                <Box>
                  <Text color={theme.muted}>
                    [{s.model}] • {s.messageCount} msgs • {dateStr}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
