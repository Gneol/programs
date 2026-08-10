import { syncMcpToolsSource, mcpToolsMap } from './src/mcp/index';
import { resolveConfigKey } from './src/mcp/index';

const key = resolveConfigKey('mcp-servers.json', process.cwd());
console.log('Config key:', key);
const tools = await syncMcpToolsSource('mcp-servers.json', process.cwd());
console.log('Synced tools count:', tools.length);
console.log('Sample tool:', JSON.stringify(tools[0]?.name));
console.log('Map size:', mcpToolsMap.size);
if (mcpToolsMap.get(key)) {
  console.log('Map key found, tools:', mcpToolsMap.get(key)!.length);
}
