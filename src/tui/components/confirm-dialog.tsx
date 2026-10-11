import React from 'react';
import { Box, Text, useInput } from 'ink';
import { ConfirmationDecision } from '../../core/permissions.js';
import { ThemeColors } from '../theme.js';

export interface ConfirmDialogProps {
  toolName: string;
  category: string;
  args: any;
  onDecision: (decision: ConfirmationDecision) => void;
  theme: ThemeColors;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  toolName,
  category,
  args,
  onDecision,
  theme,
}) => {
  useInput((input) => {
    const key = input.toLowerCase();
    if (key === 'y' || key === 's') {
      onDecision('yes');
    } else if (key === 'n') {
      onDecision('no');
    } else if (key === 'a') {
      onDecision('always');
    }
  });

  const formattedArgs = JSON.stringify(args, null, 2);

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.warning}
      paddingX={1}
      marginY={1}
    >
      <Text color={theme.warning} bold>
        ⚠ Solicitação de Confirmação de Segurança
      </Text>
      <Box marginY={1} flexDirection="column">
        <Text>
          O agente deseja executar a ferramenta: <Text color={theme.primary} bold>{toolName}</Text> (Categoria: {category})
        </Text>
        <Text color={theme.muted}>Argumentos:</Text>
        <Text color="cyan">{formattedArgs}</Text>
      </Box>
      <Box flexDirection="row">
        <Text bold>Pressione: </Text>
        <Text color={theme.success} bold>[Y] Sim </Text>
        <Text color={theme.error} bold>[N] Não </Text>
        <Text color={theme.primary} bold>[A] Sempre aprovar nesta sessão</Text>
      </Box>
    </Box>
  );
};
