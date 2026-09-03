
import { appInvokationHandler } from "../tools";
import { f_call, f_response } from './utils/types'
import { ProgramRuntime } from '../program/runtime';
import { ProgramToolManager } from "../tools/utils/ProgramToolManager";
import { getGlobalSoulStore, Soul } from "../db/program";
import { ttc } from "ttc-rpc";
import { Stream } from "../db/stream";
import { callTool } from "../mcp";


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
        let hasKeepQuiet = false;

        if (calls.length > 0) {
            Stream.setState(conversation_id, 'invoking');
        }

        // console.log(`Calling  functions....`)
        for (const call of calls) {
            const name = call.function;
            let response;
            if (name!.startsWith('tool.')) {
                call.function?.replace('tool.', '');
                try {
                    response = await ProgramToolManager.invokeTool(call, conversation_id);
                } catch (error) {
                    // console.log(error);
                    response = error.message;
                }
            } else if (name.startsWith('mcp.')) {
                try {
                    response =  await callTool(conversation_id, call);
                    // console.log(response);
                } catch (error) {
                    // console.log(error);
                    response = error.message;
                }
            } else {
                hasKeepQuiet = !hasKeepQuiet && call.function === 'Internal.keepQuiet' ? true : hasKeepQuiet;
                try {
                    response = await appInvokationHandler.invoke(conversation_id, call.function as any, call.arguments);

                    if (call.function === 'Internal.takeNote' && calls.length === 0) {
                        response = '...'
                    }
                } catch (error) {
                    // console.log(error);
                    response = error.message;
                }
            }

            const typeR = typeof response;
            if (response || typeR === 'boolean' || typeR === 'number') {
                responses.push({
                    function: call.function as any,
                    response
                })
            }


            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        if (responses.length === 0) {
            Stream.publish_event('llm', conversation_id, {
                state: 'idle'
            })

            // if the keepQuiet function has not been called, set idle else leave it.. 
            // keepQuiet has called dormant on it
            // This is a very very critical internal step
            if (!hasKeepQuiet) {
                Stream.setState(conversation_id, 'idle');
            }
        }

        // console.log(responses)
        // console.log(`Done calling  functions....`)

        return responses;
    }

    // this is the transport system for sending events to ui or output systems


    static async resolveScid(id: string) {
        const store = getGlobalSoulStore();
        let soul = store.get(id);
        if (soul.parentId) {
            const parent = store.get(soul.parentId);
            if (parent._scid !== soul.id) {
                soul = await store.update(id, {
                    _scid: parent._scid
                })
            }
            soul._scid = parent._scid;
        }
        return soul;
    }


    static emit = async (id: string, event: GneolEvents, args: any) => {
        // console.log(id, 'ID OHHHHH');
        const soul = await this.resolveScid(id);

        await ttc.emit(soul._scid, 'message', {
            id,
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