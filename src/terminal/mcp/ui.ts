// MCP UI – interactive menu backed by Assistant's program.mcp CRUD
import { showPrompt, text, confirm } from '../utils/prompt.js';
import { current } from '../interface/chat.js';

interface McpConfig {
  type: 'http' | 'stdio';
  url?: string;
  command?: string;
  args?: string[];
  enabled: boolean;
}

function parseConfig(config: string): McpConfig {
  try {
    return JSON.parse(config);
  } catch {
    return { type: 'http', url: config, enabled: true };
  }
}

async function getMcp() {
  if (!current) {
    console.log('No active assistant.');
    return null;
  }
  return current.program.mcp;
}

async function showServerDetail(server: any): Promise<void> {
  const cfg = parseConfig(server.config);
  const display = {
    name: server.name,
    type: cfg.type,
    url: cfg.url || '',
    command: cfg.command || '',
    args: cfg.args || [],
    enabled: cfg.enabled
  };

  const choice = await showPrompt({
    message: JSON.stringify(display, null, 2),
    options: [
      { label: 'Back to list', value: 'back' },
      { label: 'Toggle enabled', value: 'toggle' },
      { label: 'Remove this server', value: 'remove' },
    ]
  });

  if (choice === 'toggle') {
    const mcp = await getMcp();
    if (mcp) {
      const newCfg = { ...cfg, enabled: !cfg.enabled };
      await mcp.update(server.resourceId, { config: JSON.stringify(newCfg) });
      console.log(`Toggled "${server.name}" to ${newCfg.enabled ? 'active' : 'inactive'}`);
      return showServerDetail({ ...server, config: JSON.stringify(newCfg) });
    }
    return;
  }

  if (choice === 'remove') {
    const ok = await confirm(`Remove "${server.name}"?`);
    if (ok) {
      const mcp = await getMcp();
      if (mcp) {
        await mcp.delete(server.resourceId);
        console.log(`Removed "${server.name}"`);
      }
    }
    return;
  }

  // back
}

function serverLabel(s: any): string {
  const cfg = parseConfig(s.config);
  const addr = cfg.url || cfg.command || '?';
  return `${s.name} (${addr}) - [${cfg.enabled ? 'active' : 'inactive'}]`;
}

export async function showMCPMenu(): Promise<void> {
  const mcp = await getMcp();
  if (!mcp) return;

  const choice = await showPrompt({
    message: 'MCP Menu:',
    options: [
      { label: 'List MCP Servers', value: 'list' },
      { label: 'Add Server', value: 'add' },
      { label: 'Back', value: 'back' }
    ]
  });

  if (choice === 'back' || !choice) return;

  if (choice === 'add') {
    const name = await text('Enter server name:');
    if (!name) return showMCPMenu();

    const type = await showPrompt({
      message: 'Server type?',
      options: [
        { label: 'HTTP / SSE', value: 'http' },
        { label: 'stdio (local command)', value: 'stdio' }
      ]
    });
    if (!type) return showMCPMenu();

    let config: McpConfig = { type: type as 'http' | 'stdio', enabled: true };

    if (type === 'http') {
      const url = await text('Enter server URL:');
      if (!url) return showMCPMenu();
      config.url = url;
    } else {
      const command = await text('Enter command (e.g. npx):');
      if (!command) return showMCPMenu();
      const argsStr = await text('Enter args (space separated):');
      config.command = command;
      config.args = argsStr ? argsStr.split(' ') : [];
    }

    await mcp.create({ name, config: JSON.stringify(config) });
    console.log(`Added server "${name}"`);
    return showMCPMenu();
  }

  if (choice === 'list') {
    return showServerList();
  }
}

async function showServerList(): Promise<void> {
  const mcp = await getMcp();
  if (!mcp) return;

  const servers = await mcp.list();

  if (servers.length === 0) {
    console.log('No MCP servers configured.');
    return showMCPMenu();
  }

  const options = servers.map(s => ({
    label: serverLabel(s),
    value: s.resourceId
  }));
  options.push({ label: 'Back', value: 'back' });

  const choice = await showPrompt({
    message: 'Select a server to view config:',
    options
  });

  if (choice === 'back' || !choice) return showMCPMenu();

  const selected = servers.find(s => s.resourceId === choice);
  if (selected) {
    await showServerDetail(selected);
  }

  return showServerList();
}
