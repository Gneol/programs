import { syncMcpToolsSource } from './src/mcp/index';
const tools = await syncMcpToolsSource('mcp-servers.json', process.cwd());
console.log('Synced:', tools.length);
