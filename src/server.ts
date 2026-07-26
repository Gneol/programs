import { ttc } from "ttc-rpc";
import z from "zod";
import express from 'express';
import { getGlobalSoulStore, GlobalSoulStore } from "./db/program.js";
import { cacheEngine } from "./models/index.js";
import { ProgramRuntime } from "./program/runtime.js";
import { appInvokationHandler, onAuthEvent } from "./tools/index.js";
import { ProgramToolManager } from "./tools/utils/ProgramToolManager.js";
import { invokationEngine } from "./llm/invoke.js";
import { Stream } from "./db/stream.js";
import { llm_message_internal } from "./llm/utils/types.js";
import { markForRebuild } from "./llm/system_message.js";


export class GneolServer {



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
                const souls = allSouls
                    .filter(s => !s.parentId)
                    .map(s => ({
                        id: s.id,
                        name: s.name,
                        program: s.program,
                        programPath: s.programPath
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
        param_index: 3,
        doc: 'get chat history',
        parameterSchema: z.object({
            id: z.string(),
            limit: z.number(),
            page: z.number()
        }),
        outputSchema: z.array(z.object({
            role: z.string(),
            content: z.string()
        }))
    })
    async history(id: string, limit: number, page: number) {
        try {
            const store = getGlobalSoulStore();
            const soul = store.get(id);
            if (!soul) throw new Error(`Soul not found: ${id}`);

            const messages = [...soul.loadMessages()];
            // console.log(messages);
            // Slice from the end to get the most recent messages, then reverse to show latest first

            if (messages.length === 0) {
                return [];
            }

            const start = -page * limit;
            const end = -(page - 1) * limit || undefined; // If page=1, end=undefined to go to the end
            const paginatedMessages = messages.slice(start, end).reverse();
            // console.log('Fetched messages for conversation', conversation_id, 'page', page, 'limit', limit, paginatedMessages.length);
            const history = await this.historyTransformation(paginatedMessages);
            // console.log(history);
            // check if the first message is a summary, remove it
            if (history.length > 0 && history[0].content?.startsWith('[Summary]')) {
                history.shift();
            }

            // console.log(history)
            return history;
        } catch (error) {
            console.log(error);
        }
    }

    async historyTransformation(history: llm_message_internal[]) {
        const finalHistory = history.map(msg => {

            const role = msg.role;
            let content = msg.content;

            if (role === 'assistant') {
                try {
                    if (content.includes('```json')) {
                        // remove the ```json and ``` from the content
                        content = content.replace(/```json/g, '').replace(/```/g, '').trim();
                    }
                    const parsedContent = JSON.parse(content);
                    // console.log('Parsed assistant message:', parsedContent);
                    let finalContent = '';
                    for (const item of parsedContent) {
                        if (item.function === 'Internal.speakToUser') {
                            finalContent += item.arguments.message;
                            // console.log('Transformed assistant message to user message:', content);
                        }
                    }
                    content = finalContent;
                } catch (error) {
                    console.error('Error parsing assistant message:', error);
                    content = msg.content; // Fallback to original content
                }
            } else if (role === 'user') {
                // if it is function response we do not need that shit
                try {
                    JSON.parse(content);
                    content = null;
                } catch (error) {
                    // not json so it is a normal user message
                    content = msg.content;
                }
            }

            return {
                role: role,
                content
            }
        }).filter(msg => msg.content !== null && msg.content !== "");

        return finalHistory.reverse();
    }

    @ttc.describe({
        doc: 'trigger an agent with a message (for schedules/automations)',
        parameterSchema: z.object({
            id: z.string(),
            message: z.string()
        })
    })
    async trigger(id: string, message: string) {
        const ctx = ttc.requestContext(arguments);
        const store = getGlobalSoulStore();
        const soul = store.get(id);
        if (!soul) throw new Error(`Soul not found: ${id}`);
        if (ctx._scid) store.update(id, { _scid: ctx._scid });

        const format_message = JSON.stringify([{
            function: "TTCInternal.trigger",
            response: { message }
        }]);
        store.addMessage(id, { role: 'user', content: format_message });

        const modelData = await cacheEngine.get(soul.llm);
        if (!modelData) throw new Error(`Model "${soul.llm}" not cached for soul ${soul.id}`);

        await modelData.invoke(soul.id);
        return 'trigger sent';
    }



    @ttc.describe({
        doc: 'deploy a .gneol program file',
        parameterSchema: z.object({
            programPath: z.string()
        })
    })
    async deploy(programPath: string) {
        const result = await ProgramRuntime.deployProgram(programPath);
        const runtime = ProgramRuntime.getRuntimeByTitle(result.title);
        if (runtime) {
            await runtime.handleToolDefinitions(runtime.program);
        }
        markForRebuild(result.soulId, true);
        return result;
    }

    @ttc.describe({
        param_index: 3,
        doc: 'approve permission'
    })
    async approveFunction(pId: string, state: boolean, message: string) {
        await invokationEngine.approveFunction({ pId, state, message });
    }

    @ttc.describe({
        param_index: 2,
        doc: 'set workspace for agent'
    })
    async setWorkspace(id: string, workSpace: string) {
        const store = getGlobalSoulStore();
        await store.update(id, {
            workSpace
        });
        await markForRebuild(id, true);
        return 'workspace set'
    }


    @ttc.describe({
        doc: 'chat an agent',
        parameterSchema: z.object({
            id: z.string(),
            message: z.string()
        })
    })
    async chat(id: string, message: string) {
        console.log('Sent message to ', id, 'message:', `"${message}"`)
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

export function startServer(options?: { port?: number; daemonize?: boolean }) {

    ProgramRuntime.init();
    appInvokationHandler.on('auth', async (arg) => onAuthEvent(arg, 'user'))
    appInvokationHandler.on('action', async (arg) => {
        Stream.publish_event('action_log', arg.id, arg.action);
    })

    const app = express();
    ttc.init({
        app,
        modules: [GneolServer],
        // generate_client: true,
        async socketCb(socket) {
            console.log(`${socket.id} connected...`)
        },
    }).listen(options?.port || 3999);
    if (options?.daemonize) {
        console.log('Server started on port ' + (options?.port || 3999));
    } else {
        console.log('Server listening on port ' + (options?.port || 3999));
    }
}
