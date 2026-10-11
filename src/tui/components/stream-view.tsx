import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { ThemeColors } from '../theme.js';

export interface StreamViewProps {
  content: string;
  isStreaming: boolean;
  theme: ThemeColors;
}

export const StreamView: React.FC<StreamViewProps> = ({
  content,
  isStreaming,
  theme,
}) => {
  if (!content && !isStreaming) {
    return null;
  }

  // Divide o texto para detectar blocos de código simples ```
  const lines = content.split('\n');
  let inCodeBlock = false;

  return (
    <Box flexDirection="column" marginY={1}>
      {lines.map((line, idx) => {
        if (line.trim().startsWith('```')) {
          inCodeBlock = !inCodeBlock;
          return (
            <Text key={idx} color={theme.warning} dimColor>
              {line}
            </Text>
          );
        }

        if (inCodeBlock) {
          return (
            <Box key={idx} paddingLeft={2}>
              <Text color="cyan">{line}</Text>
            </Box>
          );
        }

        if (line.startsWith('#')) {
          return (
            <Text key={idx} color={theme.primary} bold>
              {line}
            </Text>
          );
        }

        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          return (
            <Text key={idx} color="white">
              <Text color={theme.primary}> • </Text>
              {line.trim().slice(2)}
            </Text>
          );
        }

        return (
          <Text key={idx} color="white">
            {line}
          </Text>
        );
      })}

      {isStreaming && (
        <Box marginTop={1} flexDirection="row">
          <Text color={theme.primary}>
            <Spinner type="dots" />
          </Text>
          <Text color={theme.muted}> Gerando resposta...</Text>
        </Box>
      )}
    </Box>
  );
};
