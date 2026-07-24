import React from 'react';
import { Text, Box } from 'ink';
import { MarkdownText } from '../utils/MarkdownText';

type MessageRole = 'system' | 'assistant' | 'user';

interface MessageBubbleProps {
  role: MessageRole;
  content: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ role, content }) => {
  if (role === 'system') {
    return (
      <Box paddingLeft={2}>
        <Text color="gray">{content}</Text>
      </Box>
    );
  }

  const isAssistant = role === 'assistant';

  return (
    <Box flexDirection="row" alignItems="flex-start">
      {/* LEFT COLUMN: The Prompt (Fixed Width) */}
      <Box width={3} flexShrink={0}>
        {isAssistant ? (
          <Text bold color="gray">⏺ </Text>
        ) : (
          <Text bold color="gray">- </Text>
        )}
      </Box>

      {/* RIGHT COLUMN: The Text (Wraps here) */}
      {isAssistant ? (
        <Box marginBottom={1} flexGrow={1} flexDirection="column">
          <MarkdownText>
          {/* <Text> */}
            {content}
          {/* </Text> */}
          </MarkdownText>
        </Box>
      ) : (
        <Box flexGrow={1} flexDirection="column">
          <Text color={"white"} backgroundColor="#303030">
            {content}
          </Text>
        </Box>
      )}
    </Box>
  );
});