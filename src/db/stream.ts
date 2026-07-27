import { ttc } from "ttc-rpc";
import { InvokeEngine } from "../llm/invoke.js";
import { ProgramRuntime } from "../program/runtime.js";
import { getGlobalSoulStore } from "./program.js";



export type TTCEvents = 'llm' | 'permission' | 'action_log' | 'network'
type StateType = 'idle' | 'dormant' | 'processing' | 'invoking' | 'stale';

export type State = {
    ai: number,
    messageState: 'sent' | 'recieved',
    state: StateType
}
export class Stream {

    static activityTracker: Map<string, State> = new Map();

    static init = () => {
        // Clear any previous interval to avoid duplicates on re-init
        if ((this as any)._interval) clearInterval((this as any)._interval);
        (this as any)._interval = setInterval(() => this.checker(), 5000);
    }

    static setState = (id: string, state: StateType) => {
        let data = this.activityTracker.get(id);
        if (!data) {
            data = {
                ai: Date.now(),
                messageState: 'recieved',
                state: 'dormant'
            }
        } else {
            data.state = state;
        }
        this.activityTracker.set(id, data);
    }

    private static checker = () => {
        this.activityTracker.forEach((state, key) => {
            const ai_elapsed = (Date.now() - state.ai) / 1000; //in seconds
            // if ai has not recieved message
            // console.log(state, state.messageState === 'recieved' && ai_elapsed > 5)
            if (state.state === 'idle' && ai_elapsed >  20) {
                state.state = 'stale';
                const store = getGlobalSoulStore();
                const soul = store.get(key);
                const runtime = ProgramRuntime.getRuntime(soul.programPath);
                if (runtime) {
                    console.log('Invoked the idle event for ', state)
                    runtime.invoke('Idle');
                    runtime.invoke('idle');
                    // handle any one of the representation
                }
                state.ai = Date.now();
                this.activityTracker.set(key, state);
            }
        })
    }

    static isIdle(id: string): boolean {
        const state = this.activityTracker.get(id);
        return state ? state.state === 'idle' : false;
    }

    static publish_event = async (event: TTCEvents, agent_id: string, data: any) => {
        try {
            // console.log(event, data, agent_id);
            await InvokeEngine.emit(agent_id, event as any, data);
        } catch (error) {
            console.error('Error publishing event:', error);
        }
    }
}



// Stream.init();
// Stream.trackActivity('me', 'sent');
// Stream.trackActivity('me', 'recieved');