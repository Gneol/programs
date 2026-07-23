import http from 'node:http';
import { Stream } from '../../db/stream';

type ModuleEntry = {
    definitions: any[];
    name: string;
    _scid: string;
    baseUrl: string;
};

export class HttpManager {
    static moduleInstances: Record<string, ModuleEntry> = {};

    static addTool = async (_scid: string, _agentId: string, serverUrl: string): Promise<any[]> => {
        const baseUrl = serverUrl.replace(/\/+$/, '');

        // Fetch all modules from the server
        const modulesData = await this.httpGet(`${baseUrl}/info`);
        if (!modulesData || !Array.isArray(modulesData)) {
            throw new Error('Failed to fetch modules from tool server');
        }

        const allDefs: any[] = [];
        for (const mod of modulesData) {
            if (mod.name && mod.definitions) {
                this.moduleInstances[mod.name] = {
                    definitions: mod.definitions,
                    name: mod.name,
                    _scid,
                    baseUrl,
                };
                allDefs.push(...mod.definitions);
            }
        }

        return allDefs;
    };

    static async isProgramTool(functionName: string): Promise<boolean> {
        if (!functionName.startsWith('tool')) return false;
        const [_, module] = functionName.split('.');
        return !!this.moduleInstances[module];
    }

    static async invokeTool(call: { function?: string; arguments?: any }, id: string): Promise<any> {
        const functionName = call.function!;
        const [, module, method] = functionName.split('.');
        const entry = this.moduleInstances[module];
        if (!entry) throw new Error(`Module '${functionName}' not registered`);

        const toolName = `${module}.${method}`;
        const url = `${entry.baseUrl}/invoke/${toolName}`;

        return new Promise((resolve, reject) => {
            const req = http.request(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            }, (res) => {
                if (res.statusCode !== 200) {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        reject(new Error(`Server responded ${res.statusCode}: ${body}`));
                    });
                    return;
                }

                let buffer = '';
                let lastEventName = '';

                res.on('data', (chunk: Buffer) => {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

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
                                    Stream.publish_event('llm', id, {
                                        state: data,
                                        type: 'action_log',
                                    }).catch(() => { });
                                    break;
                                case 'invoke':
                                    resolve(data);
                                    break;
                                case 'error':
                                    reject(new Error(data.message || 'Tool error'));
                                    break;
                                case 'auth':
                                    Stream.publish_event('permission', id, data).catch(() => { });
                                    break;
                            }
                        }
                    }
                });

                res.on('error', reject);
            });

            req.on('error', reject);
            req.write(JSON.stringify(call.arguments || {}));
            req.end();
        });
    }

    static async approveFunction(pId: string, state: boolean, message: string) {
        // pId format: "<moduleName>|<callbackId>", but for HTTP we may not need the prefix
        // For simplicity, we extract module name from the pId if prefixed
        const [module, tool] = pId.split('.')
        const entry = this.moduleInstances[module];
        if (!entry) return;
        await this.httpPost(`${entry.baseUrl}/auth`, { pId, state, message });
    }

    static terminate(_moduleName: string): void {
        // No-op for HTTP
    }

    static terminateAll(): void {
        // No-op for HTTP
    }

    // ------------------------------------------------------------------------
    // Internal HTTP helpers
    // ------------------------------------------------------------------------

    private static httpGet(url: string): Promise<any> {
        return new Promise((resolve, reject) => {
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

    private static httpPost(url: string, data: any): Promise<any> {
        return new Promise((resolve, reject) => {
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
