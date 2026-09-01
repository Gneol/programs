import React from 'react';
import { Box, Text } from 'ink';
import { BotIcon } from './boticon';
import { licenseState } from './licenseStatus';
import { pushSystemMessage } from '../interface/chat';

interface ASCIIHeaderProps {
  assistantName?: string;
  model?: string;
}

export const ASCIIHeader: React.FC<ASCIIHeaderProps> = React.memo(({ assistantName, model }) => {

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Box flexDirection="row" flexGrow={1} alignItems="center">
          
          <Box flexDirection="column" justifyContent="flex-start" flexGrow={1}>
            <Text bold color="cyan">Gneol</Text>
            <Text dimColor>  └── https://gneol.github.com</Text>
            <Text> </Text>
            <Text color="gray">Agent - <Text bold color="cyan">{assistantName}</Text></Text>
            <Text color="gray">Model - <Text bold color="cyan">{model || '...'}</Text></Text>
            <Text dimColor>Use <Text color="yellow">/help</Text> to see available commands..</Text>
            {/* {!licenseState.valid && (
              <Text dimColor color="yellow">Free tier — use <Text color="cyan">/upgrade</Text> or visit console.gneol.com</Text>
            )} */}
          </Box>
        </Box>
      </Box>
    </Box>
  );
});

export const ttcASCIIartSmall = () => {
    console.log(`
╭──────────────────────────────────────────────────╮
│ Gneol CLI                                        │
│  └── https://cli.gneol.com                       │
│                                                  │
│ Use /help to see available commands..            │
│ Manage account in https://console.gneol.com      │
╰──────────────────────────────────────────────────╯
`)
}