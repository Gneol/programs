
import { appInvokationHandler } from "../tools";
import { f_call, f_response } from './utils/types'
import { ProgramRuntime } from '../program/runtime';
import { ProgramToolManager } from "../tools/utils/ProgramToolManager";
import { getGlobalSoulStore } from "../db/program";
import { ttc } from "ttc-rpc";


type GneolEvents =
    | 'message'
    | 'permission'
    | 'action_log'
    | 'llm'
    | 'network'

export class InvokeEngine {

    constructor() {
    }

    approveFunction = async (query: {
        pId: string, state: boolean, message: string
    }) => {
        const [type, module, tool, pId] = query.pId.split('.')
        if (query.pId.startsWith('worker') || query.pId.startsWith('http')) {
            await ProgramToolManager.approveFunction(query.pId, query.state, query.message);
        } else {
            // console.log(pId, query.state, query.message);
            await appInvokationHandler.approve(pId, query.state, query.message);
        }
    }

    async invoke(conversation_id: string, calls: f_call[]) {
        // some are tool functions
        // some are internal functions
        // some are gneol app native functions
        const responses: f_response[] = [];


        console.log(`Calling  functions....`)
        for (const call of calls) {
            const name = call.function;
            let response;
            if (name!.startsWith('tool.')) {
                call.function?.replace('tool.', '');
                try {
                    response = await ProgramToolManager.invokeTool(call, conversation_id);
                } catch (error) {
                    console.log(error);
                    response = error.message;
                }
            } else {
                try {
                    response = await appInvokationHandler.invoke(conversation_id, call.function as any, call.arguments);
                } catch (error) {
                    console.log(error);
                    response = error.message;
                }
            }

            if (response) {
                responses.push({
                    function: call.function as any,
                    response
                })
            }
        }

        // console.log(responses)
        console.log(`Done calling  functions....`)

        return responses;
    }

    // this is the transport system for sending events to ui or output systems


    static emit = async (id: string, event: GneolEvents, args: any) => {
        const soul = getGlobalSoulStore().get(id);

        await ttc.io(soul._scid)?.emit('message', {
            id: soul.id,
            event: event,
            data: args
        })

        const runtime = ProgramRuntime.getRuntime(soul.programPath);

        if (!runtime) return;

        const hooks = runtime.program.webhooks;
        if (!hooks || hooks.length === 0) return;

        const body = JSON.stringify({
            id,
            type: event,
            payload: args
        });

        for (const hook of hooks) {
            try {
                await fetch(hook, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body
                });
            } catch (err: any) {
                console.error(`Webhook POST to "${hook}" failed:`, err.message);
            }
        }
    }
}


export const invokationEngine = new InvokeEngine();