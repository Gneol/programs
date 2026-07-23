import { ttc } from "ttc-rpc";
import { InvokeEngine } from "../llm/invoke.js";
import { ProgramRuntime } from "../program/runtime.js";



export type TTCEvents = 'llm' | 'permission' | 'action_log' | 'network'

export type State = {
    ai: number,
    messageState: 'sent' | 'recieved',
    state: 'idle' | 'active'
}
export class Stream {

    static activityTracker: Map<string, State> = new Map();

    static init() {
        // Clear any previous interval to avoid duplicates on re-init
        if ((this as any)._interval) clearInterval((this as any)._interval);
        (this as any)._interval = setInterval(() => this.checker(), 5000);
    }

    private static checker() {
        this.activityTracker.forEach((state, key) => {
            const ai_elapsed = (Date.now() - state.ai) / 1000;
            // if ai has not recieved message
            if (state.messageState === 'sent' && ai_elapsed > 60000) {
                // Only fire idle on transition from active -> idle
                if (state.state !== 'idle') {
                    state.state = 'idle';
                    const runtime = ProgramRuntime.getRuntime(key);
                    if (runtime) {
                        runtime.invoke('Idle');
                    }
                }
            } else {
                state.state = 'active';
            }

            this.activityTracker.set(key, state);
        })
    }

    static isIdle(id: string): boolean {
        const state = this.activityTracker.get(id);
        return state ? state.state === 'idle' : false;
    }

    static trackActivity(id: string, messageState: 'sent' | 'recieved') {
        let state = this.activityTracker.get(id);

        if (!state) {
            state = {
                ai: Date.now(),
                messageState,
                state: 'active'
            }
        }
        state.ai = Date.now();
        this.activityTracker.set(id, state)
    }

    static publish_event = async (event: TTCEvents, agent_id: string, data: any) => {
        try {
            // console.log(event, data, scid);
            await InvokeEngine.emit(agent_id, event as any, data);
        } catch (error) {
            console.error('Error publishing event:', error);
        }
    }
}



