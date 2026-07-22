// ─── Scaffold template helpers for .gneol resources ───


export const resources = ['agent', 'model', 'mcp', 'tool', 'event', 'schedule'] as const;

export function getTemplate(resource: string, name: string): string {
  const q = (s: string) => JSON.stringify(s);
  switch (resource) {
    case 'agent':
      return `program(${q(name)})
  .model('deepseek-v4-flash')          // Model tag (optional, overrides parent)
  // .use('ttc_assistant_xxx')          // Auto-injected on install
  .env('.env')                          // Environment file path
  .context('Policy').text('Never share internal keys.')
  .context('FAQ').resource('./docs/faq.md')
`;
    case 'model':
      return `model(${q(name)})
  .provider('openrouter')               // Required if apiKey is set
  .modelId('openai/gpt-4o')
  .apiKey('OPENROUTER_API_KEY')         // Env variable name
  .temperature(0.7)                     // 0.0 to 1.0
  .maxTokens(4000)                      // Max output tokens
  .rateLimit(10)                        // Requests per minute
`;
    case 'mcp':
      return `// MCP server: ${name}
// To add: use MCP.addServer in program actions
mcp()
  .name(${q(name)})
  .command('npx')
  .args(['-y', '@modelcontextprotocol/server-${name}'])
`;
    case 'tool':
      return `tool(${q(name)})
  .script('./workers/${name}Worker.ts')  // Path to worker script
  .description('Custom tool module')

// Example worker script at ./workers/${name}Worker.ts:
// -------------------------------------------
// import { Module } from 'gneol-sdk';
// const mod = new Module(${q(name)});
// mod.tool({
//     name: 'myFunc',
//     description: 'Does something useful',
//     parameters: '{ input: string }',
//     output: '{ result: string }',
//     func: async (args) => { /* runs when called */ },
//     action: async (args) => { /* runs for action logs */ },
// });
// mod.parse();
// -------------------------------------------
`;
    case 'event':
      return `on(${q(name)})
  .maxSize(5)                           // Max pending jobs before auto-fire
  .delay(30s)                           // Debounce window (e.g. '30s', '1min')
  .do('Handle ${name}')
  // .do('Secondary action')
  .resource('./payload.json')           // Attach file/URL context
  .if('Condition expression')           // LLM-evaluated condition
  .sentinel('sentinel-name')            // Route to a sentinel
  .modify()                             // Tag for review
  .max(10)                              // Max triggers before auto-stop
`;
    case 'schedule':
      return `at('every:1h')                  // every:30mins, every:Mon, +5min, 9am, 14:30
  .max(5)                               // Max triggers before auto-stop
  .do('Run ${name}')
  // .do('Secondary action')
  .resource('./data.json')              // Attach file/URL context
  .if('Condition expression')           // LLM-evaluated condition
  .ifExec('/scripts/health.sh', 'ok')   // Shell-based condition (default operator: eq)
  // .ifExec('/scripts/cpu.sh', 'gt', '80')
  .sentinel('sentinel-name')            // Route to a sentinel
  .modify()                             // Tag for review
`;
    case 'session':
      return `// Session: ${name}
// Sessions are managed via the SDK, not scaffolded.
// To create a session programmatically, use the session API.
`;
    default:
      return '';
  }
}
