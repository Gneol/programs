import React from 'react';
import { Text, Box } from 'ink';
import { useState, useEffect } from 'react';

interface MarkdownTextProps {
  children: string;
}

export const MarkdownText: React.FC<MarkdownTextProps> = ({ children }) => {
  const lines = children.split('\n');
  
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => {
        // Code blocks (```...```)
        if (line.trim().startsWith('```')) {
          return <Text  color="cyan" dimColor>{line}</Text>;
        }
        
        // Headers
        if (line.startsWith('# ')) {
          return <Text  bold color="blue">{line.substring(2)}</Text>;
        }
        if (line.startsWith('## ')) {
          return <Text  bold color="cyan">{line.substring(3)}</Text>;
        }
        if (line.startsWith('### ')) {
          return <Text  bold>{line.substring(4)}</Text>;
        }
        
        // Lists
        if (line.trim().match(/^[-*+]\s/)) {
          return <Text  >  {line.trim()}</Text>;
        }
        if (line.trim().match(/^\d+\.\s/)) {
          return <Text >  {line.trim()}</Text>;
        }
        
        // Inline code (`...`)
        const codePattern = /`([^`]+)`/g;
        if (codePattern.test(line)) {
          const parts: React.ReactNode[] = [];
          let lastIndex = 0;
          let match;
          const regex = /`([^`]+)`/g;
          
          while ((match = regex.exec(line)) !== null) {
            // Add text before code
            if (match.index > lastIndex) {
              parts.push(line.substring(lastIndex, match.index));
            }
            // Add code with styling
            parts.push(<Text backgroundColor="gray" color="cyan">{match[1]}</Text>);
            lastIndex = match.index + match[0].length;
          }
          
          // Add remaining text
          if (lastIndex < line.length) {
            parts.push(line.substring(lastIndex));
          }
          
          return <Text >{parts}</Text>;
        }
        
        // Bold (**...**)
        const boldPattern = /\*\*([^*]+)\*\*/g;
        if (boldPattern.test(line)) {
          const parts: React.ReactNode[] = [];
          let lastIndex = 0;
          let match;
          const regex = /\*\*([^*]+)\*\*/g;
          
          while ((match = regex.exec(line)) !== null) {
            if (match.index > lastIndex) {
              parts.push(line.substring(lastIndex, match.index));
            }
            parts.push(<Text bold>{match[1]}</Text>);
            lastIndex = match.index + match[0].length;
          }
          
          if (lastIndex < line.length) {
            parts.push(line.substring(lastIndex));
          }
          
          return <Text >{parts}</Text>;
        }
        
        // Regular text
        return <Text >{line}</Text>;
      })}
    </Box>
  );
};
