import { Module } from "gneol-sdk";
import z from "zod";
import { getGlobalSoulStore } from "../db/program";
import { ttc } from "ttc-rpc";
import { f_response } from "../llm/utils/types";
import { cacheEngine } from "../models";
import { markForRebuild } from "../llm/system_message";
import { Stream } from "../db/stream";





export const Internal = new Module('Internal');

Internal.tool({
    name: 'editBasicInfo',
    description: 'Edit basic information such as your name, traits and backstory (truncated to 500 chars).',
    parameters: z.object({
        name: z.string().optional(),
        backstory: z.string().max(500).optional(),
        traits: z.array(z.string()).optional()
    }),
    async auth(input, id) {
        return `Agent requesting to edit: ${JSON.stringify(Object.fromEntries(
            Object.entries(input).filter(([_, v]) => v !== undefined)
        ))}`;
    },
    async action(input, id) {
        const changes = Object.fromEntries(
            Object.entries(input).filter(([_, v]) => v !== undefined)
        );
        return `Agent is editing: ${Object.keys(changes).join(', ')} → ${Object.values(changes).map(v => typeof v === 'string' ? `"${v.slice(0, 50)}"` : JSON.stringify(v)).join(', ')}`;
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
    name: 'inspectInfo',
    description: 'Inspect your own basic information and usage stats',
    async action(input, id) {
        return `Reviewing personal information..`;
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
        return `look at models ${input.llm ? input.llm : ''}`;
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
    name: 'subagent',
    description: 'Create a sub agent for sub tasks',
    parameters: z.object({
        name: z.string(),
        backstory: z.string().optional()
    }),
    async action(input: { name: string; backstory?: string }, id) {
        return `Creating subagent ${input.name} with backstory "${input.backstory?.slice(0, 20)}"`
    },
    func: async (input: { name: string; backstory?: string }, id: string) => {
        const store = getGlobalSoulStore();
        const parent = store.get(id);
        if (!parent) throw new Error(`Soul ${id} not found`);

        const branch = store.create({
            name: input.name,
            program: parent.program,
            programPath: parent.programPath,
            llm: parent.llm,
            notes: [],
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

        [sender.id, reciever.id].forEach(id => {

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
    description: 'call this function is you have nothing to say',
    parameters: z.object(),
    async action(input, id) {
        return `Agent is keeping quiet`
    },
    func: async (input: {}, id: string) => {
        console.log('Radio silence')
    }
})

Internal.tool({
    name: 'refreshAppFunctions',
    description: 'call this function to refresh function list in system message',
    parameters: z.object({}),
    async action(input, id) {
        return `refreshing functions list..`
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

