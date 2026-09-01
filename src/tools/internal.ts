import { Module } from "gneol-sdk";
import z from "zod";
import { getGlobalSoulStore } from "../db/program";
import { ttc } from "ttc-rpc";
import { f_response } from "../llm/utils/types";
import { cacheEngine } from "../models";
import { markForRebuild } from "../llm/system_message";
import { Stream } from "../db/stream";
import { appFunctions } from ".";

import { ProgramRuntime } from '../program/runtime';


const store = getGlobalSoulStore();
export const Internal = new Module('Internal');

Internal.tool({
    name: 'editBasicInfo',
    description: 'Edit basic information such as your name, traits and backstory (truncated to 500 chars).',
    parameters: z.object({
        name: z.string().optional(),
        backstory: z.string().max(500).optional(),
        traits: z.array(z.string()).optional()
    }),
    // async auth(input, id) {
    //     return `Agent requesting to edit: ${JSON.stringify(Object.fromEntries(
    //         Object.entries(input).filter(([_, v]) => v !== undefined)
    //     ))}`;
    // },
    async action(input, id) {
        const changes = Object.fromEntries(
            Object.entries(input).filter(([_, v]) => v !== undefined)
        );
        const soul = store.get(id);
        return `${soul.name} is modifying personal details ${Object.keys(changes).join(', ')} → ${Object.values(changes).map(v => typeof v === 'string' ? `"${v.slice(0, 50)}"` : JSON.stringify(v)).join(', ')}`;
    },
    async func({ name, traits, backstory }, id: string) {
        const store = getGlobalSoulStore();
        const soul = store.get(id);

        await store.update(id, {
            name: name ? name : soul.name,
            traits: traits ? traits : soul.traits,
            backstory: backstory ? backstory.slice(0, 500) : soul.backstory
        });
        markForRebuild(id, true);
        return `Updated your information`
    }
});

Internal.tool({
    name: 'deployProgram',
    description: 'Deploy a .gneol program file by running the CLI deploy command.',
    parameters: z.object({
        filePath: z.string().describe('Path to the .gneol program file to deploy')
    }),
    async action(input, id) {
        const soul = store.get(id);
        return `${soul.name} is deploying program at "${input.filePath}"`;
    },
    async func({ filePath }, id: string) {
        try {
            const result = await ProgramRuntime.deployProgram(filePath);
            const runtime = ProgramRuntime.getRuntimeByTitle(result.title);
            if (runtime) {
                await runtime.handleToolDefinitions(runtime.program);
                await runtime.handleMcpConfigs(runtime.program);
            }
            markForRebuild(result.soulId, true);
            return result;
        } catch (error) {
            return error.message
        }
    }
});

Internal.tool({
    name: 'inspectInfo',
    description: 'Inspect your own basic information and usage stats',
    async action(input, id) {
        const soul = store.get(id);
        return `${soul.name} is reviewing personal information..`;
    },
    async func(_: any, id: string) {
        const store = getGlobalSoulStore();
        const soul = store.get(id);
        if (!soul) return { error: 'Soul not found' };

        return {
            name: soul.name,
            traits: soul.traits,
            backstory: soul.backstory,
            llm: soul.llm,
            workSpace: soul.workSpace,
            inputTokens: soul.inputTokens,
            outputTokens: soul.outputTokens,
            cachedTokens: soul.cachedTokens
        };
    }
});

Internal.tool({
    name: 'models',
    description: 'Fetch integrated models',
    parameters: z.object({
        llm: z.string()
    }),
    async action(input, id) {
        const soul = store.get(id);
        return `${soul.name} is looking at model ${input.llm ? input.llm : ''}`;
    },
    async func({ llm }, id: string) {

        if (llm) {
            const model = await cacheEngine.get(llm);
            if (model) {
                return {
                    id: model.id,
                    provider: model.provider,
                    options: model.options,
                    name: model.name
                }
            } else {
                const models = cacheEngine.getAll();
                return `${llm} does not exist, these are the integrated model ids ${models.map(x => x.key)}`
            }
        }

        const models = cacheEngine.getAll();

        return models.map(m => {
            const model = m.value;
            return {
                id: model.id,
                provider: model.provider,
                options: model.options,
                name: model.name
            }
        })
    }
});


Internal.tool({
    name: 'createSubAgent',
    description: 'Creates a sub agent for sub tasks, optionally assigns a workspace for the agent to work in',
    parameters: z.object({
        name: z.string(),
        backstory: z.string().optional(),
        workSpace: z.string().optional()
    }),
    async action(input: { name: string; backstory?: string, workSpace?: string }, id) {
        return `Creating subagent ${input.name} with backstory "${input.backstory?.slice(0, 20)}"`
    },
    func: async (input: { name: string; backstory?: string, workSpace?: string }, id: string) => {
        const store = getGlobalSoulStore();
        const parent = store.get(id);

        if (parent.parentId) throw new Error(`You cannot create subagent when you are a subagent`);

        if (!parent) throw new Error(`Soul ${id} not found`);

        const branch = store.create({
            name: input.name,
            program: parent.program,
            programPath: parent.programPath,
            llm: parent.llm,
            notes: [],
            workSpace: input.workSpace ? input.workSpace : parent.workSpace,
            _scid: parent._scid,
            parentId: parent.id,
            backstory: input.backstory
        });

        return {
            id: branch.id,
            name: branch.name,
            message: `Branch '${branch.name}' created with id ${branch.id}`
        };
    }
})

Internal.tool({
    name: 'speakToAgent',
    description: 'Send messages to an agent using their id',
    parameters: z.object({
        id: z.string(),
        message: z.string()
    }),
    func: async (input: { id: string, message: string }, id: string) => {
        const store = getGlobalSoulStore();
        const sender = store.get(id);
        const reciever = store.get(input.id);

        const message: f_response = {
            function: 'Internal.speakToAgent',
            response: {
                message: input.message,
                fromAgent: sender.id,
                nameOfSender: sender.name
            }
        };

        let sameScid = sender._scid === reciever._scid;
        let transports = sameScid ? [sender.id] : [sender.id, reciever.id];
        new Set(transports).forEach(id => {

            Stream.publish_event('action_log', id,
                `⏺ ✉️  [${sender.name}] ──❯ [${reciever.name}]
      └── ${input.message}\n`
            )
        });


        store.addMessage(reciever.id, {
            role: 'user',
            content: JSON.stringify(message)
        });

        const model = await cacheEngine.get(reciever.llm);
        model.invoke(reciever.id);
    }
})

Internal.tool({
    name: 'takeNote',
    description: 'take notes down for longterm that outlive resets and memory wipe',
    parameters: z.object({
        note: z.string()
    }),
    func: async (input: { note }, id: string) => {
        const store = getGlobalSoulStore();
        const soul = store.get(id);
        if (soul) {
            const updateNotes = (soul.notes || []);
            updateNotes.push(input.note);
            store.update(id, {
                notes: updateNotes
            })
        }
    }
})


Internal.tool({
    name: 'keepQuiet',
    description: 'call this function is you have nothing to say and you can also call this to truly tell the user you are done to avoid the event triggers trying to ensure you are doing and have not broken chain of execution',
    parameters: z.object(),
    // async action(input, id) {
    //     const soul = store.get(id);
    //     return `${soul.name} is keeping quiet`
    // },
    func: async (input: {}, id: string) => {
        // console.log('Radio silence')
        Stream.setState(id, 'dormant');
    }
})

Internal.tool({
    name: 'refreshAppFunctions',
    description: 'call this function to refresh function list in system message',
    parameters: z.object({}),
    async action(input, id) {
        const soul = store.get(id);
        return `${soul.name} is refreshing functions list..`
    },
    func: async (input: {}, id: string) => {
        // just rebuilds the system message
        markForRebuild(id, true);
        return 'app functions have been refreshed and added to your system message'
    }
})


Internal.tool({
    name: 'speakToUser',
    description: 'Speak to the User',
    parameters: z.object({
        message: z.string()
    }),
    func: async (input: { message: string }, id: string) => {
        console.log(input.message, id);
        const store = getGlobalSoulStore();
        const soul = store.get(id);
        if (soul && soul._scid) {
            await ttc.io(soul._scid)?.emit('message', {
                id,
                event: 'message',
                data: input.message
            });
        }
    }
})


Internal.tool({
    name: 'getFunctionDetails',
    description: 'getFunction detailsr',
    parameters: z.object({
        function: z.string()
    }),
    async action(input, id) {
        const soul = store.get(id);
        return `${soul.name} is looking closely at tool "${input.function}"`;
    },
    func: async (input: { function: string }, id: string) => {
        try {
            const details = appFunctions.find(f => f.name === input.function);
            if (!details) {
                return 'Function details does not exist in application'
            } else {
                return details;
            }
        } catch (error) {
            return 'Unable to get function details';
        }
    }
})


Internal.tool({
    name: 'getEnvironment',
    description: 'Get current environment details: date, time, platform info (browser or node)',
    async action(input: any, id: string) {
        const soul = store.get(id);
        return `${soul.name} is scanning environment`;
    },
    async func(_: any, id: string) {
        const dateString = new Date().toISOString();
        if (typeof window !== 'undefined') {
            // Browser environment
            return {
                current_url: window.location.href,
                userAgent: navigator.userAgent,
                language: navigator.language,
                date: dateString
            };
        } else {
            // Node.js environment
            return {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                date: dateString
            };
        }
    }
});


Internal.tool({
    name: 'listPeers',
    description: 'Show other agents working on the system, this functions list primary agents, not sub agents',
    parameters: z.object({
        page: z.number(),
        limit: z.number()
    }),
    action: async (input, id) => {
        const soul = store.get(id);
        return `${soul.name} is scanning environment for other agents`;
    },
    async func(input: { page: number, limit: number }, id: string) {
        let { page, limit } = input;
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
})

// Internal.tool({
//     name: 'deployProgram',
//     description: 'Deploy a .gneol program file directly without CLI.',
//     parameters: z.object({
//         filePath: z.string().describe('Path to the .gneol program file to deploy')
//     }),
//     async action(input, id) {
//         const soul = store.get(id);
//         return `${soul.name} is deploying program at "${input.filePath}"`;
//     },
//     async func({ filePath }, id: string) {
//         try {
//             const result = await ProgramRuntime.deployProgram(filePath);
//             const runtime = ProgramRuntime.getRuntimeByTitle(result.title);
//             if (runtime) {
//                 await runtime.handleToolDefinitions(runtime.program);
//                 await runtime.handleMcpConfigs(runtime.program);
//             }
//             markForRebuild(result.soulId, true);
//             return `Program deployed successfully.\n${JSON.stringify(result, null, 2)}`;
//         } catch (error: any) {
//             return `Deploy failed: ${error.message || 'Unknown error'}`;
//         }
//     }
// });