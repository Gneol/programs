// ============================================================================
// WorkerManager — spawns workers, invokes tools, forwards action logs
// ============================================================================

import { Worker } from 'worker_threads';
import path from 'path';
import { Stream } from '../../db/stream';
import { onAuthEvent } from '..';

export type ModuleEntry = {
    definition: any[];
    instance: Worker;
};

export class WorkerManager {
    static moduleInstances: Record<string, ModuleEntry> = {};

    static addTool = async (agentId: string, scriptPath: string): Promise<{ moduleName: string, definitions: any[] }> => {
        const absPath = path.resolve(__dirname, scriptPath);
        const ext = path.extname(absPath);
        // .ts files need a transpiler; .js files run natively (assumes ESM support if needed)
        const execArgv = ext === '.ts' ? ['--require', 'ts-node/register'] : [];
        const worker = new Worker(absPath, { execArgv });

        const response = await new Promise<{ definitions: any[], name: string }>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
            worker.on('message', (msg: any) => {
                if (msg.type === 'info' && msg.data) {
                    clearTimeout(timeout);
                    resolve(msg.data);
                }
            });
            worker.on('error', reject);
            worker.postMessage({ id: agentId, type: 'info' });
        });

        const definitions = response.definitions;
        const moduleName = response.name;
        this.moduleInstances[moduleName] = { definition: definitions, instance: worker };

        worker.on('message', async (msg: any) => {
            if (msg.action) {
                await Stream.publish_event('llm', agentId, {
                    state: msg.action,
                    type: 'action_log'
                });
            }
            if (msg.permission) {
                await Stream.publish_event('permission', agentId, msg.permission);
            }
        });

        return { moduleName, definitions };
    }

    static async isProgramTool(functionName: string): Promise<boolean> {
        if (!functionName.startsWith('tool')) return false;
        const [_, module] = functionName.split('.');
        return !!this.moduleInstances[module];
    }

    static async invokeTool(call: { function?: string; arguments?: any }, id: string): Promise<any> {
        const [_, module, method] = call.function!.split('.');
        const entry = this.moduleInstances[module];
        if (!entry) throw new Error(`Module '${call.function}' not registered`);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

            const handler = (msg: any) => {
                console.log(msg)
                if (msg.id === id && (msg.type === 'invoke' || msg.type === 'error')) {
                    clearTimeout(timeout);
                    entry.instance.removeListener('message', handler);
                    if (msg.type === 'error') reject(new Error(msg.message));
                    else resolve(msg.data);
                }
                if(msg.type === 'auth'){
                    onAuthEvent(msg, 'worker')
                }
            };
            entry.instance.on('message', handler);
            // console.log(`${module}.${method}`)
            entry.instance.postMessage({ id, type: 'invoke', method: `${module}.${method}`, args: call.arguments });
        });
    }

    static async approveFunction(pId: string, state: boolean, message: string) {
        // console.log(pId);
        const [type, module, tool, pid] = pId.split('.')
        const entry = this.moduleInstances[module];
        // console.log(entry, module, pId)
        if (entry) {
            entry.instance.postMessage({  type: 'auth',  pId: pid, state, message });
        }
    }

    static terminate(moduleName: string): void {
        const entry = this.moduleInstances[moduleName];
        if (entry) {
            entry.instance.terminate();
            delete this.moduleInstances[moduleName];
        }
    }

    static terminateAll(): void {
        for (const name of Object.keys(this.moduleInstances)) this.terminate(name);
    }
}
