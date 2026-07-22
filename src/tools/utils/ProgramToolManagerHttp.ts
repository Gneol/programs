// ============================================================================
// ProgramToolManagerHttp — connects to the Gneol tool server over HTTP/SSE
// ============================================================================
//
// This replaces the worker-thread-based ProgramToolManager with an HTTP client
// that talks to the Gneol tool server (server.ts). Instead of spawning Workers,
// we query the server for tool definitions and invoke tools via POST /invoke,
// consuming the SSE stream for action logs and results.
//
// Key differences from the worker version:
//  - No worker lifecycle (addTool only fetches definitions, does not spawn)
//  - Invoke is an HTTP request, not a postMessage
//  - Action logs arrive as SSE events during the invoke — forwarded via Stream
//  - Auth responses go to POST /auth
// ============================================================================

import http from 'node:http';
import { Stream } from '../../db/stream';

type ModuleEntry = {
    definitions: any[];
    name: string;
    _scid: string;
};

export class ProgramToolManagerHttp {
    static moduleInstances: Record<string, ModuleEntry> = {};
    static baseUrl: string = 'http://localhost:4000'; // configurable

    /**
     * Configure the server URL (call before addTool).
     */
    static setBaseUrl(url: string) {
        this.baseUrl = url.replace(/\/+$/, '');
    }

    /**
     * Register a tool module by fetching its definitions from the server.
     * The server is expected to have the module pre-loaded.
     */
    static addTool = async (_scid: string, agentId: string, _scriptPath: string): Promise<any[]> => {
        // The script path is ignored — the server pre-loads modules.
        // We fetch /info to discover available modules.
        // For now, we just return the stored definitions if we already have them.
        // If not, we query the server for all modules.
        if (Object.keys(this.moduleInstances).length > 0) {
            // Already loaded — return combined definitions
            return Object.values(this.moduleInstances).flatMap(e => e.definitions);
        }

        // Fetch all modules from the server
        const modulesData = await this.httpGet('/info');
        if (!modulesData || !Array.isArray(modulesData)) {
            throw new Error('Failed to fetch modules from tool server');
        }

        for (const mod of modulesData) {
            if (mod.name && mod.definitions) {
                this.moduleInstances[mod.name] = {
                    definitions: mod.definitions,
                    name: mod.name,
                    _scid,
                };
            }
        }

        return Object.values(this.moduleInstances).flatMap(e => e.definitions);
    };

    /**
     * Check if a function name is a registered tool.
     */
    static async isProgramTool(functionName: string): Promise<boolean> {
        if (!functionName.startsWith('tool')) return false;
        const [_, module] = functionName.split('.');
        return !!this.moduleInstances[module];
    }

    /**
     * Invoke a tool via POST /invoke/<Module>.<Tool>
     * Returns a Promise that resolves with the final result.
     * Action logs and permission requests are handled via SSE events.
     */
    static async invokeTool(call: { function?: string; arguments?: any }): Promise<any> {
        const functionName = call.function!;
        const [, module, method] = functionName.split('.');
        const entry = this.moduleInstances[module];
        if (!entry) throw new Error(`Module '${functionName}' not registered`);

        const toolName = `${module}.${method}`;
        const url = `${this.baseUrl}/invoke/${toolName}`;

        return new Promise((resolve, reject) => {
            const req = http.request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            }, (res) => {
                if (res.statusCode !== 200) {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        reject(new Error(`Server responded ${res.statusCode}: ${body}`));
                    });
                    return;
                }

                // SSE parsing
                let buffer = '';
                let lastEventName = '';

                res.on('data', (chunk: Buffer) => {
                    buffer += chunk.toString();

                    // SSE lines are separated by \n
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // keep incomplete line

                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            lastEventName = line.slice(7).trim();
                        } else if (line.startsWith('data: ')) {
                            const dataStr = line.slice(6);
                            let data: any;
                            try {
                                data = JSON.parse(dataStr);
                            } catch {
                                continue;
                            }

                            switch (lastEventName) {
                                case 'action':
                                    // Forward action log to the stream
                                    Stream.publish_event('llm', 'tool', {
                                        state: data,
                                        type: 'action_log',
                                    }).catch(() => {});
                                    break;
                                case 'invoke':
                                    // Final result — resolve the promise
                                    resolve(data);
                                    break;
                                case 'error':
                                    reject(new Error(data.message || 'Tool error'));
                                    break;
                                case 'auth':
                                    // Permission request — forward via Stream
                                    Stream.publish_event('permission', 'tool', data).catch(() => {});
                                    break;
                            }
                        }
                        // empty lines are ignored (separators)
                    }
                });

                res.on('end', () => {
                    // If connection closed without a result, reject
                    // (the resolve/reject should have been called already)
                });

                res.on('error', reject);
            });

            req.on('error', reject);

            // Write the request body
            req.write(JSON.stringify(call.arguments || {}));
            req.end();
        });
    }

    /**
     * Approve a pending auth request by sending the decision to the server.
     */
    static async approveFunction(pId: string, state: boolean) {
        const url = `${this.baseUrl}/auth`;
        return this.httpPost(url, { pId, state });
    }

    /**
     * Get cached definitions for a script path (legacy compatibility).
     */
    static getDefinition(_scriptPath: string): any[] | undefined {
        // Return all definitions (or undefined if none loaded)
        const allDefs = Object.values(this.moduleInstances).flatMap(e => e.definitions);
        return allDefs.length > 0 ? allDefs : undefined;
    }

    /**
     * Terminate a module (no-op with HTTP server — modules are server-managed).
     */
    static terminate(_moduleName: string): void {
        // No-op
    }

    /**
     * Terminate all (no-op).
     */
    static terminateAll(): void {
        // No-op
    }

    // ------------------------------------------------------------------------
    // Internal HTTP helpers
    // ------------------------------------------------------------------------

    private static httpGet(path: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl);
            http.get(url, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch {
                        reject(new Error('Invalid JSON from server'));
                    }
                });
                res.on('error', reject);
            }).on('error', reject);
        });
    }

    private static httpPost(path: string, data: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl);
            const body = JSON.stringify(data);
            const req = http.request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                },
            }, (res) => {
                let responseBody = '';
                res.on('data', chunk => responseBody += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(responseBody));
                    } catch {
                        resolve(responseBody);
                    }
                });
                res.on('error', reject);
            });
            req.write(body);
            req.end();
        });
    }
}
