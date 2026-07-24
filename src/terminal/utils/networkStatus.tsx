import React from "react";
import { Box, Text } from "ink";

interface NetworkStatusProps {
  socketMessage?: string;
  apiMessage?: string;
  status?: string;
}

export const NetworkStatus: React.FC<NetworkStatusProps> = React.memo(({ socketMessage, apiMessage, status }) => {
  const isOffline = status === "disconnected";
  const isOnline = status === "connected";
  
  const socketMsg = socketMessage;
  
  // Don't render if no status info
  if (!status && !socketMessage && !apiMessage) return null;

  // Box symbols: ■ online, 口 offline
  const statusSymbol = isOnline ? "■" : "口";
  const statusText = isOnline ? "Online" : isOffline ? "Offline" : "...";
  const statusColor = isOffline ? "red" : isOnline ? "green" : "yellow";

  return (
    <Box flexDirection="row" width="200%" justifyContent="space-between">
      <Box flexDirection="column">
        {socketMsg && <Text color={isOnline ? "gray" : "#ad0000"}>- {socketMsg}</Text>}
        {apiMessage && <Text dimColor>└── {apiMessage}</Text>}
      </Box>
      {status && (
        <Box>
          <Text color={statusColor}>{statusSymbol}</Text>
          <Text> {statusText}</Text>
        </Box>
      )}
    </Box>
  );
});
