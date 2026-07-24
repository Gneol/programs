import React from 'react';
import { Box, Text } from 'ink';

type OptionsPaneProps = {
  options: string[];
  selectedIndex: number;
  type: 'commands' | 'files';
  filter?: string;
};

export const OptionsPane: React.FC<OptionsPaneProps> = React.memo(({
  options,
  selectedIndex,
  type,
  filter,
}) => {
  if (options.length === 0) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>No {type} found.</Text>
      </Box>
    );
  }

  const maxVisible = 8;
  const start = Math.max(0, selectedIndex - Math.floor(maxVisible / 2));
  const end = Math.min(options.length, start + maxVisible);
  const visibleOptions = options.slice(start, end);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>
        {type === 'commands' ? 'Commands' : 'Files'} ({options.length}):
      </Text>
      {visibleOptions.map((option, idx) => {
        const globalIdx = start + idx;
        const isSelected = globalIdx === selectedIndex;
        const prefix = type === 'files' ? (option.endsWith('/') ? '+ ' : '+ ') : '/ ';
        return (
          <Box key={globalIdx}>
            <Text color={isSelected ? 'cyan' : 'white'}>
              {isSelected ? '❯ ' : '  '}
              {prefix}
              {option}
            </Text>
          </Box>
        );
      })}
      {options.length > maxVisible && (
        <Text dimColor>
          ... and {options.length - maxVisible} more (use ↑↓ to navigate)
        </Text>
      )}
    </Box>
  );
});
