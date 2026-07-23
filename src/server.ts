import { ttc } from "ttc-rpc";
import z from "zod";
import express from 'express';
import { getGlobalSoulStore, GlobalSoulStore } from "./db/program.js";
import { cacheEngine } from "./models/index.js";
import { ProgramRuntime } from "./program/runtime.js";
import { appInvokationHandler, onAuthEvent } from "./tools/index.js";
import { ProgramToolManager } from "./tools/utils/ProgramToolManager.js";
import { invokationEngine } from "./llm/invoke.js";


export class GneolServer {


    constructor(){
        ProgramRuntime.init();
        appInvokationHandler.on('auth', async (arg)=>onAuthEvent(arg, 'user'))
    }

    static getProgram(programName: string) {
        const runtime = ProgramRuntime.getRuntimeByTitle(programName);
        return runtime ? runtime.program : undefined;
    }

    @ttc.describe({
        doc: 'list available template resources',
        parameterSchema: z.object({})
    })
    listResources() {
        return ['agent', 'model', 'mcp', 'tool', 'event', 'schedule'];
    }

    @ttc.describe({
        doc: 'list resources',
        parameterSchema: z.object({
            resource: z.string(),
            page: z.number(),
            limit: z.number(),
            id: z.string().optional()
        })
    })
    list(resource: string, page: number, limit: number, id?: string) {
        const allRuntimes = ProgramRuntime.getAllRuntimes();

        // If an id is provided, filter runtimes by program title
        const runtimes = id
            ? allRuntimes.filter(r => r.program.title === id)
            : allRuntimes;

        switch (resource) {
            case 'agent': {
                const store = getGlobalSoulStore();
                const allSouls = store.list();
                const souls = allSouls.map(s => ({
                    id: s.id,
                    name: s.name,
                    program: s.program
                }));
                const offset = (page - 1) * limit;
                return souls.slice(offset, offset + limit);
            }

            case 'model': {
                const cachedModels = cacheEngine.getAll();
                const models: any[] = [];

                for (const entry of cachedModels) {
                    const v = entry.value;
                    models.push({
                        id: v.id,
                        name: v.name,
                        provider: v.provider,
                        options: v.options,
                        cached: true
                    });
                }

                for (const rt of runtimes) {
                    for (const binding of rt.program.modelBindings || []) {
                        const alreadyCached = models.some(m => m.id === `${binding.provider}:${binding.modelId}`);
                        if (!alreadyCached) {
                            models.push({
                                tag: binding.tag,
                                modelId: binding.modelId,
                                provider: binding.provider,
                                program: rt.program.title,
                                cached: false
                            });
                        }
                    }
                }

                const offset = (page - 1) * limit;
                return models.slice(offset, offset + limit);
            }

            case 'mcp': {
                const mcps: { name: string; config: string; program: string }[] = [];
                for (const rt of runtimes) {
                    for (const [name, config] of Object.entries(rt.program.mcpConfigs || {})) {
                        mcps.push({ name, config, program: rt.program.title });
                    }
                }
                const offset = (page - 1) * limit;
                return mcps.slice(offset, offset + limit);
            }

            case 'tool': {
                const tools: { name: string; scriptPath: string; program: string }[] = [];
                for (const rt of runtimes) {
                    for (const toolDef of rt.program.toolDefs || []) {
                        tools.push({
                            name: toolDef.name,
                            scriptPath: toolDef.scriptPath,
                            program: rt.program.title
                        });
                    }
                }
                const offset = (page - 1) * limit;
                return tools.slice(offset, offset + limit);
            }

            case 'event': {
                const events: { marker: string; instructions: string[]; program: string }[] = [];
                for (const rt of runtimes) {
                    for (const action of rt.program.actions.filter(a => a.type === 'event')) {
                        events.push({
                            marker: action.marker,
                            instructions: action.instructions,
                            program: rt.program.title
                        });
                    }
                }
                const offset = (page - 1) * limit;
                return events.slice(offset, offset + limit);
            }

            case 'schedule': {
                const schedules: { marker: string; instructions: string[]; program: string }[] = [];
                for (const rt of runtimes) {
                    for (const action of rt.program.actions.filter(a => a.type === 'time')) {
                        schedules.push({
                            marker: action.marker,
                            instructions: action.instructions,
                            program: rt.program.title
                        });
                    }
                }
                const offset = (page - 1) * limit;
                return schedules.slice(offset, offset + limit);
            }

            default:
                return [];
        }
    }



    @ttc.describe({
        doc: 'deploy a .gneol program file',
        parameterSchema: z.object({
            programPath: z.string()
        })
    })
    async deploy(programPath: string) {
        return await ProgramRuntime.deployProgram(programPath);
    }

    @ttc.describe({
        param_index: 3,
        doc: 'approve permission'
    })
    async approveFunction(pId: string, state: boolean, message: string){
        await invokationEngine.approveFunction({pId, state, message});
    }


    @ttc.describe({
        doc: 'chat an agent',
        parameterSchema: z.object({
            id: z.string(),
            message: z.string()
        })
    })
    async chat(id: string, message: string) {
        const ctx = ttc.requestContext(arguments);
        const store = getGlobalSoulStore();
        const soul = store.get(id);
        if (!soul) throw new Error(`Soul not found: ${id} ${ctx._scid}`);
        if (ctx._scid) store.update(id, {
            _scid: ctx._scid
        })

        // Append user message
        store.addMessage(id, { role: 'user', content: message });

        // Find the model by matching soul's llm tag against cached models
        const modelData = await cacheEngine.get(soul.llm)
        if (!modelData) throw new Error(`Model "${soul.llm}" not cached for soul ${soul.id}`);

        // Invoke the model via the rate-limited invoke method (passes soulId)
        await modelData.invoke(soul.id);

        return 'chat sent'
    }
}

const app = express();
ttc.init({
    app,
    modules: [GneolServer],
    generate_client: true,
    async socketCb(socket) {
        console.log(`${socket.id} connected...`)
    },
}).listen(3999);
