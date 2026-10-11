import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { SubagentManager, SubagentTask } from '../../subagents/subagent-manager.js';
import { ThemeColors } from '../theme.js';

export interface SubagentsModalProps {
  subagentManager: SubagentManager;
  theme: ThemeColors;
  onClose: () => void;
}

export const SubagentsModal: React.FC<SubagentsModalProps> = ({
  subagentManager,
  theme,
  onClose,
}) => {
  const [tasks, setTasks] = useState<SubagentTask[]>(() => subagentManager.getAllSubagents());
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const unsubscribe = subagentManager.subscribe(() => {
      setTasks(subagentManager.getAllSubagents());
    });
    return unsubscribe;
  }, [subagentManager]);

  useInput((input, key) => {
    if (key.escape || input === 'q' || input === 'Q') {
      onClose();
      return;
    }

    if (tasks.length === 0) return;

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : tasks.length - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev < tasks.length - 1 ? prev + 1 : 0));
    }
  });

  const selectedTask = tasks[selectedIndex];

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
          ⚡ Monitor de Subagentes em Segundo Plano (Real-time)
        </Text>
        <Text color={theme.muted}>Pressione [Esc] ou [Q] para fechar</Text>
      </Box>

      {tasks.length === 0 ? (
        <Box marginY={1}>
          <Text color={theme.muted}>
            Nenhum subagente em execução. O agente principal pode iniciar tarefas paralelas via 'spawn_subagent'.
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color={theme.secondary} bold>
              Subagentes Ativos/Concluídos ({tasks.length}):
            </Text>
          </Box>

          <Box flexDirection="row">
            {/* Lista à esquerda */}
            <Box flexDirection="column" width="45%" paddingRight={1}>
              {tasks.map((t, idx) => {
                const isSelected = idx === selectedIndex;
                let statusColor = theme.muted;
                if (t.status === 'running') statusColor = theme.warning;
                if (t.status === 'completed') statusColor = theme.success;
                if (t.status === 'failed') statusColor = theme.error;

                return (
                  <Box key={t.id}>
                    <Text color={isSelected ? theme.primary : undefined} bold={isSelected}>
                      {isSelected ? '▶ ' : '  '}
                      <Text color={statusColor}>[{t.status.toUpperCase()}]</Text>{' '}
                      {t.name.slice(0, 18)} ({(t.elapsedMs / 1000).toFixed(0)}s)
                    </Text>
                  </Box>
                );
              })}
            </Box>

            {/* Detalhes à direita */}
            {selectedTask && (
              <Box
                flexDirection="column"
                width="55%"
                borderStyle="single"
                borderColor={theme.muted}
                paddingX={1}
              >
                <Text bold color={theme.primary}>
                  {selectedTask.name} ({selectedTask.id})
                </Text>
                <Text color={theme.muted}>Iniciado: {new Date(selectedTask.startedAt).toLocaleTimeString()}</Text>
                <Text color={theme.muted}>Prompt: {selectedTask.prompt.slice(0, 80)}...</Text>
                <Box marginY={1} flexDirection="column">
                  <Text color={theme.secondary} bold>
                    Logs em tempo real:
                  </Text>
                  {selectedTask.logs.slice(-5).map((log, lIdx) => (
                    <Text key={lIdx} color={theme.muted}>
                      {log}
                    </Text>
                  ))}
                </Box>
                {selectedTask.result && (
                  <Box flexDirection="column" marginTop={1}>
                    <Text color={theme.success} bold>
                      Resultado:
                    </Text>
                    <Text>{selectedTask.result.slice(0, 200)}...</Text>
                  </Box>
                )}
                {selectedTask.error && (
                  <Box flexDirection="column" marginTop={1}>
                    <Text color={theme.error} bold>
                      Erro:
                    </Text>
                    <Text color={theme.error}>{selectedTask.error}</Text>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};
