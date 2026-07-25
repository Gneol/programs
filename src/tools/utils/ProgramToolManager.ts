// ============================================================================
// ProgramToolManager — Routes addTool, invokeTool, etc. to either WorkerManager
// (for local file paths) or HttpManager (for http:// URLs).
// Shared scriptMap is centralized here for getDefinition lookups.
// ============================================================================

import { WorkerManager } from './WorkerManager';
import { HttpManager } from './HttpManager';
import { f_schema } from '../../llm/utils/types';
import { GneolProgram } from "../../program/types";
import * as fspath from 'path';

// Module name → which manager handles it
const moduleOwner = new Map<string, 'worker' | 'http'>();

// Shared scriptMap: scriptPath → definitions
export const scriptMap: Record<string, any> = {};

export class ProgramToolManager {

    private static removeCollition(defintions: f_schema[]) {
        return defintions.map(f => {
            f.name = `tool.${f.name}`;
            return f;
        })
    }

    static handleToolDefinitions = async (program: GneolProgram) => {
        if (!program.toolDefs || program.toolDefs.length === 0) return;
        const programDir = program.path.substring(0, program.path.lastIndexOf('/'));
        for (const def of program.toolDefs) {
            try {
                const resolvedPath = fspath.resolve(programDir, def.scriptPath);
                def.scriptPath = resolvedPath;
                await ProgramToolManager.addTool('', program.agentId, resolvedPath);
            } catch (error) {
                console.error(error.message);
            }
        }
    }

    static addTool = async (_scid: string, agentId: string, scriptPath: string): Promise<any[]> => {
        const isUrl = scriptPath.startsWith('http://') || scriptPath.startsWith('https://');
        if (isUrl) {
            const definitions = await HttpManager.addTool(_scid, agentId, scriptPath);
            // HttpManager already populates HttpManager.moduleInstances
            // Record which modules it owns
            for (const modName of Object.keys(HttpManager.moduleInstances)) {
                if (!moduleOwner.has(modName)) {
                    moduleOwner.set(modName, 'http');
                }
            }

            // Shared scriptMap: keyed by URL (for getDefinition)
            scriptMap[scriptPath] = this.removeCollition(definitions);
            return definitions;
        } else {
            try {
                const { moduleName, definitions } = await WorkerManager.addTool(agentId, scriptPath);
                moduleOwner.set(moduleName, 'worker');
                console.log(definitions)
                scriptMap[scriptPath] = this.removeCollition(definitions);
                return definitions;
            } catch (error) {
                console.log(error)
            }
        }
    }

    static async isProgramTool(functionName: string): Promise<boolean> {
        if (!functionName.startsWith('tool')) return false;
        const [_, module] = functionName.split('.');
        const owner = moduleOwner.get(module);
        if (!owner) return false;
        return owner === 'worker'
            ? WorkerManager.isProgramTool(functionName)
            : HttpManager.isProgramTool(functionName);
    }

    static async invokeTool(call: { function?: string; arguments?: any }, id: string): Promise<any> {
        const [_, module] = call.function!.split('.');
        const owner = moduleOwner.get(module);
        if (!owner) throw new Error(`Module '${module}' not registered`);
        return owner === 'worker'
            ? WorkerManager.invokeTool(call, id)
            : HttpManager.invokeTool(call, id)
    }

    static async approveFunction(pId: string, state: boolean, message: string) {
        const [type] = pId.split('.');
        return type === 'worker'
            ? WorkerManager.approveFunction(pId, state, message)
            : HttpManager.approveFunction(pId, state, message);
    }

    static getDefinition(scriptPath: string): any[] | undefined {
        const record = scriptMap[scriptPath];
        // console.log(scriptPath, scriptMap);
        if (record) return record;
        // Try HTTP manager: if the URL is registered, fetch definitions
        const entry = HttpManager.moduleInstances[scriptPath];
        if (entry) return entry.definitions;
        return [];
    }

    static terminate(moduleName: string): void {
        const owner = moduleOwner.get(moduleName);
        if (!owner) return;
        if (owner === 'worker') {
            WorkerManager.terminate(moduleName);
        } else {
            HttpManager.terminate(moduleName);
        }
        moduleOwner.delete(moduleName);
        // Also clean scriptMap entries that refer to this module
        for (const [key, val] of Object.entries(scriptMap)) {
            if (Array.isArray(val) && val.some(d => d.name?.startsWith(`tool.${moduleName}.`))) {
                delete scriptMap[key];
            }
        }
    }

    static terminateAll(): void {
        WorkerManager.terminateAll();
        HttpManager.terminateAll();
        moduleOwner.clear();
        for (const key of Object.keys(scriptMap)) delete scriptMap[key];
    }

    // Convenience: list all modules across both managers
    static listModules(): { name: string; type: 'worker' | 'http' }[] {
        const modules: { name: string; type: 'worker' | 'http' }[] = [];
        for (const [name, type] of moduleOwner) {
            modules.push({ name, type });
        }
        return modules;
    }
}
