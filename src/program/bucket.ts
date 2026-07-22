import { Action, GneolProgram } from "./types";



type eventJob  = {
    status: 'completed' | 'pending',
    job: any
}

type Bucket = {
    maxSize: number,
    delay: number;
    data: Map<string, eventJob>;
    action: Action;
    program: GneolProgram;
    timeout?: NodeJS.Timeout
}

export class GneolEventBucket {

    eventBuckets: Map<string, Bucket> = new Map();
    cb: (action: Action, message: string) => void;

    constructor(cb: (action: Action, message: string) => void) {
        this.cb = cb;
    }

    initBucket(action: Action, program: GneolProgram) {
        let previousBucket = this.eventBuckets.get(action.marker);
        let data = previousBucket ? previousBucket.data : new Map();
        const bucket: Bucket = {
            maxSize: action.eventOptions.maxBucketSize || 10,
            delay: action.eventOptions.delay || 5,
            action,
            program,
            data
        }
        this.eventBuckets.set(action.marker, bucket)
    }

    formatMessage(bucket: Bucket): string {
        const action = bucket.action;
        let output = `📦 Event Trigger: ${bucket.action.marker}\n`;
        output += `Items in bucket: ${bucket.data.size}\n`;
        output += `Message: ${action.instructions.length > 0 ? action.instructions.join('; ') : ''}\n`;

        if (action.resources && action.resources.length > 0) {
            output += `📎 Files/Folders Attached:\n`;
            action.resources.forEach(r => {
                output += `  - ${r}\n`;
            });
        }



        if (action.modify) {
            output += `🧬 Evolution Nudge: Review and process this event trigger\n`;
        }

        return output;
    }

    async invoke(event: string, args?: any) {
        let bucket = this.eventBuckets.get(event);
        let jobId = '';
        if (args) {
            const hash = this.hash(args);
            jobId = `gneol_event_${event}_${hash}`;
            bucket.data.set(jobId, {
                status: 'pending',
                job: args
            });
        }

        let alert = async (reason?: string) => {
            const msg = this.formatMessage(bucket);
            await this.cb(bucket.action, msg);
            console.log(reason, bucket.delay)
            clearTimeout(bucket.timeout);
        }

        if (bucket.data.size >= bucket.maxSize) {
            await alert('max-size');
            clearTimeout(bucket.timeout);
            return;
        }

        clearTimeout(bucket.timeout);
        bucket.timeout = setTimeout(() => alert('timeout'), bucket.delay * 1000)
        return jobId;
    }

    hash(args: any): string {
        if (typeof args === 'object' && args !== null) return JSON.stringify(args, Object.keys(args).sort());
        return String(args);
    }

    async getJobs(event: string, options?: {
        page?: number;
        limit?: number;
        type?: 'completed' | 'pending';
    }) {
        const bucket = this.eventBuckets.get(event);
        if (!bucket) {
            const keys: string[] = [];
            this.eventBuckets.forEach(e => keys.push(e.action.marker));
            return { error: `Event "${event}" not found. Available events: ${keys.join(', ')}` };
        }

        const allJobs: Array<{ id: string; status: string; job: any }> = [];
        bucket.data.forEach((entry, id) => {
            allJobs.push({ id, status: entry.status, job: entry.job });
        });

        // Filter by type if provided
        let filtered = allJobs;
        if (options?.type) {
            filtered = allJobs.filter(j => j.status === options.type);
        }

        const total = filtered.length;

        // Paginate (defaults: page=1, limit=50)
        const page = options?.page ?? 1;
        const limit = options?.limit ?? 50;
        const start = (page - 1) * limit;
        const paginated = filtered.slice(start, start + limit);

        return { total, page, limit, jobs: paginated };
    }

    async jobStats(eventName: string){
        const event = this.eventBuckets.get(eventName);
        if(!event){
            return null;
        }
        let pendingJobs = 0;
        let completedJobs = 0;
        event.data.forEach((entry, id) => {
            pendingJobs += entry.status === 'pending' ? 1 : 0;
            completedJobs += entry.status === 'completed' ? 1 : 0;
        })
        return {
            program: event.action.program,
            eventName,
            total: event.data.size,
            pending: pendingJobs,
            done: completedJobs
        }
    }

    async markDone(id: string) {
        const [_, __, event] = id.split('_');
        const bucket = this.eventBuckets.get(event);
        const job = bucket.data.get(id);
        job.status = 'completed';
        bucket.data.set(id, job)
    }
}

