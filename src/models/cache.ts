import { TimeCluster, RateLimiter } from "ttc-rate-limit";
import { ModelMessage, ModelResult, LLMModel } from "./types.js";
import { TaskResponse } from "./index.js";




export class CacheEngine<T> {
    private cacheStore: Record<string, { value: any; expiresAt: number }> = {};
    private timeCluster: TimeCluster;

    constructor() {
        this.timeCluster = new TimeCluster(10);
        // load up model here
    }

    async cache(key: string, value: any, ttl: number): Promise<void> {
        // we can store the model to survive restarts
        const expiresAt = Date.now() + ttl * 1000;
        this.cacheStore[key] = { value, expiresAt };
        this.timeCluster.waitFor(async () => {
            delete this.cacheStore[key];
        }, expiresAt);
    }

    async get(key: string): Promise<T | null> {
        const cached = this.cacheStore[key];
        if (cached) {
            if (Date.now() < cached.expiresAt) {
                return cached.value;
            } else {
                delete this.cacheStore[key];
                return null;
            }
        }
        return null;
    }

    async invalidate(key: string): Promise<void> {
        delete this.cacheStore[key];
    }

    /** Return all non‑expired cached entries */
    getAll(): { key: string; value: T }[] {
        const now = Date.now();
        const entries: { key: string; value: any }[] = [];
        for (const [key, entry] of Object.entries(this.cacheStore)) {
            if (now < entry.expiresAt) {
                entries.push({ key, value: entry.value });
            } else {
                delete this.cacheStore[key];
            }
        }
        return entries;
    }
}

export type ModelCacheData = {
    id: string;
    llm: LLMModel;
    rateLimiter: RateLimiter<string, TaskResponse>;
    name: string;
    provider: string;
    program: string;
    options: {
        temperature: number;
        max_tokens: number;
        rate_limit: number;
    };
    invoke(soulId: string): Promise<void>;
};
