// ============================================================================
// MCP Module — in-memory registry + global tool map
//
// Design:
//   - No server persistence. Servers are registered in memory during deployment.
//   - A program declares mcp("name").config("path-or-url") — the config source is
//     resolved (to an absolute path or the URL as-is) and becomes the KEY.
//   - On deployment, syncMcpToolsSource() reads that config (file or URL),
//     connects to each declared server, fetches tools, and stores converted
//     f_schema[] definitions in the GLOBAL mcpToolsMap keyed by the source key.
//   - system_message.ts / ProgramRuntime read mcpToolsMap per agent/runtime via
//     getMcpToolsSource(key) — matching how src/tools/index.ts keeps modules
//     in memory and system_message.ts consumes them.
// ============================================================================

import path from 'path';
import fs from 'fs';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { f_call, f_schema } from '../llm/utils/types';

// ── Types ──

export type MCPTransportType = 'http' | 'stdio';

export interface MCPServer {
    name: string;
    type: MCPTransportType;
    url: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    headers?: Record<string, string>;
    enabled: boolean;
}

// Claude-like config format: { mcpServers: { name: { command, args, url, env } } }
interface GneolMCPServerConfig {
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string | number | boolean>;
    headers?: Record<string, string>;
}

interface GneolMCPConfig {
    mcpServers: Record<string, GneolMCPServerConfig>;
}

// ── Global in-memory state (no disk persistence) ──

// Server name → persistent client connection
const clients = new Map<string, { client: Client; transport: any; server: MCPServer }>();

// Server name → registered server (in-memory registry, built at deploy time)
const serverRegistry = new Map<string, MCPServer>();

/**
 * CENTRAL global store: resolved config source key → fetched tool definitions.
 *
 * Key = resolved absolute file path, or the URL as-is.
 * Value = f_schema[] with names like mcp.<serverName>.<toolName>.
 *
 * This is what system_message.ts / ProgramRuntime reads per agent.
 */
export const mcpToolsMap = new Map<string, f_schema[]>();

/** Resolve a config source (file path or URL) to a stable map key */
export function resolveConfigKey(source: string, baseDir?: string): string {
    if (source.startsWith('http://') || source.startsWith('https://')) return source;
    return path.isAbsolute(source) ? source : path.resolve(baseDir || process.cwd(), source);
}

// ── Shared sync options & env expansion ──

export interface SyncMcpOptions {
    tokens?: string[];
    serverName?: string;
}

/** Expand ${VAR} placeholders from process.env (missing vars become empty strings) */
function expandEnv(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (_, name: string) => process.env[name] ?? '');
}

// ── Connection helpers ──

function createTransport(server: MCPServer): any {
    if (server.type === 'stdio' && server.command) {
        return new StdioClientTransport({
            command: server.command,
            args: server.args,
            env: server.env
        });
    }
    return new StreamableHTTPClientTransport(new URL(server.url), {
        requestInit: {
            headers: server.headers || {},
        },
    });
}

async function connectClient(server: MCPServer): Promise<Client> {
    const transport = createTransport(server);
    const client = new Client(
        { name: 'gneol-mcp', version: '1.0.0' },
        { capabilities: {} }
    );
    await client.connect(transport);
    clients.set(server.name, { client, transport, server });
    return client;
}

async function getOrCreateClient(server: MCPServer): Promise<Client> {
    const existing = clients.get(server.name);
    if (existing) return existing.client;
    return connectClient(server);
}

export async function disconnectAll(): Promise<void> {
    for (const name of clients.keys()) {
        try { await clients.get(name)!.client.close(); } catch { }
    }
    clients.clear();
}

// ── In-memory server registry (mirrors tools/index.ts module map) ──

export function listServers(): MCPServer[] {
    return Array.from(serverRegistry.values());
}

export function getServer(name: string): MCPServer | undefined {
    return serverRegistry.get(name);
}

export function addServer(name: string, urlOrCommand: string, type?: MCPTransportType, args?: string[], env?: Record<string, string>): void {
    serverRegistry.set(name, {
        name,
        type: type || 'http',
        url: type !== 'stdio' ? urlOrCommand : '',
        command: type === 'stdio' ? urlOrCommand : undefined,
        args: type === 'stdio' ? args : undefined,
        env,
        enabled: true,
    });
}

export function removeServer(name: string): void {
    try { clients.get(name)?.client.close(); } catch { }
    clients.delete(name);
    serverRegistry.delete(name);
}

export function toggleServer(name: string): void {
    const server = serverRegistry.get(name);
    if (!server) throw new Error(`MCP server "${name}" not found`);
    server.enabled = !server.enabled;
}

// ── Config loading — handles URL or file path ──

/**
 * Load an MCP config from a file path or URL.
 * Returns the raw parsed config — no caching, caller decides what to do with it.
 */
async function loadConfig(source: string, baseDir?: string): Promise<GneolMCPConfig> {
    let raw: string;

    if (source.startsWith('http://') || source.startsWith('https://')) {
        const res = await fetch(source);
        if (!res.ok) throw new Error(`Failed to fetch MCP config from ${source}: ${res.status}`);
        raw = await res.text();
    } else {
        const resolved = resolveConfigKey(source, baseDir);
        if (!fs.existsSync(resolved)) throw new Error(`MCP config file not found: ${resolved}`);
        raw = fs.readFileSync(resolved, 'utf-8');
    }

    const config = JSON.parse(raw) as GneolMCPConfig;
    if (!config.mcpServers) {
        throw new Error(`MCP config at "${source}" must have an "mcpServers" object`);
    }
    return config;
}

// ── Tool fetching / conversion ──

/** Fetch raw tools from a single MCP server using the SDK */
async function fetchToolsFromServer(server: MCPServer): Promise<any[]> {
    const client = await getOrCreateClient(server);
    const result = await client.listTools();
    return result?.tools ?? [];
}

/** Convert an MCP JSON Schema (inputSchema) to a TS type string */
function jsonSchemaToTs(schema: any): string {
    if (!schema || typeof schema !== 'object') return 'any';

    if (schema.type === 'object' && schema.properties) {
        const required = new Set(schema.required || []);
        const props = Object.entries(schema.properties).map(([name, ps]: [string, any]) => {
            const optional = !required.has(name);
            return `${name}${optional ? '?' : ''}: ${jsonSchemaToTs(ps)}`;
        });
        return `{ ${props.join('; ')}; }`;
    }

    if (schema.type === 'array') {
        return `${jsonSchemaToTs(schema.items || {})}[]`;
    }

    if (schema.anyOf && Array.isArray(schema.anyOf)) {
        return schema.anyOf.map((s: any) => jsonSchemaToTs(s)).join(' | ') || 'any';
    }

    if (schema.enum && Array.isArray(schema.enum)) {
        return schema.enum.map((v: any) => JSON.stringify(v)).join(' | ') || 'any';
    }

    const typeMap: Record<string, string> = {
        string: 'string',
        number: 'number',
        integer: 'number',
        boolean: 'boolean',
        'null': 'null',
        object: 'Record<string, any>',
        array: 'any[]',
    };
    return typeMap[schema.type] || 'any';
}

/** Convert an MCP tool descriptor to a Gneol f_schema */
function mcpToolToGneolFunction(serverName: string, x: any): f_schema {
    return {
        name: `mcp.${serverName}.${x.name}`,
        description: x.description || `MCP tool ${x.name} on ${serverName}`,
        input_schema: jsonSchemaToTs(x.inputSchema),
        output_schema: x.outputSchema ? jsonSchemaToTs(x.outputSchema) : 'any',
    };
}

// ── Core sync — called once per config source at deploy time ──

/**
 * Sync MCP tools for ONE config source (file path or URL).
 *
 * 1. Resolves the source to a stable key.
 * 2. Reads the config (file or network) and expands ${VAR} env placeholders.
 * 3. Registers each declared server in the in-memory registry.
 * 4. Applies any .token("ENV_VAR") chain from the .gneol declaration.
 * 5. Connects, fetches tools, converts to mcp.. f_schema[].
 * 6. Stores the result in the GLOBAL mcpToolsMap under the resolved key.
 *
 * Result is memoized per key — a second call with the same key returns the
 * cached functions without refetching (until invalidateMcpTools is called).
 * Empty results are NOT cached so a failed/unauthorized sync can be retried.
 */
export async function syncMcpToolsSource(source: string, baseDir?: string, opts?: SyncMcpOptions): Promise<f_schema[]> {
    const key = resolveConfigKey(source, baseDir);
    const cached = mcpToolsMap.get(key);
    if (cached) return cached;

    const config = await loadConfig(source, baseDir);
    const allFunctions: f_schema[] = [];

    for (const [name, cfg] of Object.entries(config.mcpServers)) {
        const env = cfg.env ? Object.fromEntries(
            Object.entries(cfg.env).map(([k, v]) => [k, expandEnv(String(v))])
        ) : undefined;

        const headers = cfg.headers ? Object.fromEntries(
            Object.entries(cfg.headers).map(([k, v]) => [k, expandEnv(v)])
        ) : undefined;

        const server: MCPServer = {
            name,
            type: cfg.url ? 'http' : 'stdio',
            url: cfg.url ? expandEnv(cfg.url) : '',
            command: cfg.command ? expandEnv(cfg.command) : undefined,
            args: cfg.args ? cfg.args.map(a => expandEnv(a)) : undefined,
            env,
            headers,
            enabled: true,
        };

        // Resolve .token("ENV_VAR") chain declared in the .gneol script.
        // First token → Authorization: Bearer (HTTP) / TOKEN (STDIO).
        // Extra tokens → X-Token-2, X-Token-3… (HTTP) / TOKEN_2… (STDIO).
        if (opts?.tokens?.length) {
            const resolved = opts.tokens
                .map(t => ({ name: t, value: process.env[t] ?? '' }))
                .filter(t => t.value !== '');

            if (resolved.length > 0) {
                if (server.type === 'stdio') {
                    server.env = { ...(server.env || {}) };
                    resolved.forEach((t, i) => {
                        server.env![i === 0 ? 'TOKEN' : `TOKEN_${i + 1}`] = t.value;
                    });
                } else {
                    server.headers = { ...(server.headers || {}) };
                    resolved.forEach((t, i) => {
                        if (i === 0) server.headers!['Authorization'] = `Bearer ${t.value}`;
                        else server.headers![`X-Token-${i + 1}`] = t.value;
                    });
                }
            }
        }

        // Force a fresh connection so the new credentials are actually used.
        if (clients.has(name)) {
            try { await clients.get(name)!.client.close(); } catch { }
            clients.delete(name);
        }

        serverRegistry.set(name, server);

        try {
            const tools = await fetchToolsFromServer(server);
            const converted = tools.map(t => mcpToolToGneolFunction(opts?.serverName || name, t));
            allFunctions.push(...converted);
            console.log(`MCP: ${converted.length} tool(s) synced from "${name}" (${key})`);
        } catch (err: any) {
            console.log(`MCP: failed to sync tools from "${name}": ${err.message}`);
        }
    }

    // Only cache non-empty results so auth failures can be retried later.
    if (allFunctions.length > 0) mcpToolsMap.set(key, allFunctions);
    return allFunctions;
}

/** Remove a cached entry (e.g. on server restart / re-deploy with changes) */
export function invalidateMcpTools(source: string, baseDir?: string): void {
    mcpToolsMap.delete(resolveConfigKey(source, baseDir));
}

// ── Lookup — used by system_message.ts / runtime ──

/**
 * Get already-fetched tool definitions for a config source key.
 * Returns undefined if not synced yet (call syncMcpToolsSource first).
 */
export function getMcpTools(key: string): f_schema[] | undefined {
    return mcpToolsMap.get(key);
}

/**
 * Resolve AND lookup in one step — convenience for runtime/system_message.
 */
export function getMcpToolsForSource(source: string, baseDir?: string): f_schema[] | undefined {
    return mcpToolsMap.get(resolveConfigKey(source, baseDir));
}

// ── Invocation ──

export async function callTool(id: string, call: f_call): Promise<any> {
    try {
        const [_, serverName, tool] = call.function.split('.');

        const server = serverRegistry.get(serverName);
        if (!server) throw new Error(`MCP server "${serverName}" not found`);

        const existing = clients.get(serverName);
        if (existing) {
            return existing.client.callTool({ name: tool, arguments: call.arguments });
        }

        const client = await connectClient(server);
        return client.callTool({ name: tool, arguments: call.arguments });
    } catch (error: any) {
        console.log(error.message);
        throw new Error(`${error.message}`);
    }
}
