import fs from 'fs';
import path from 'path';
import { parseGneolFile } from './parser/index.js';

interface WatcherOptions {
    debounceMs?: number;
}

export class ProgramWatcher {
    private static watchers = new Map<string, ProgramWatcher>();

    static getOrCreate(programPath: string, onUpdate: (path: string) => void, options?: WatcherOptions): ProgramWatcher {
        const resolved = path.resolve(programPath);
        let watcher = ProgramWatcher.watchers.get(resolved);
        if (!watcher) {
            watcher = new ProgramWatcher(resolved, onUpdate, options);
            ProgramWatcher.watchers.set(resolved, watcher);
            watcher.start();
        } else {
            // Update the callback so the latest deploy logic is used
            watcher.onUpdate = onUpdate;
        }
        return watcher;
    }

    static stop(programPath: string) {
        const resolved = path.resolve(programPath);
        const watcher = ProgramWatcher.watchers.get(resolved);
        if (watcher) {
            watcher.stop();
            ProgramWatcher.watchers.delete(resolved);
        }
    }

    static stopAll() {
        for (const watcher of ProgramWatcher.watchers.values()) {
            watcher.stop();
        }
        ProgramWatcher.watchers.clear();
    }

    programPath: string;
    onUpdate: (path: string) => void;
    private debounceMs: number;
    private timer: NodeJS.Timeout | null = null;
    private watcher: fs.FSWatcher | null = null;
    private lastChange = 0;

    private constructor(programPath: string, onUpdate: (path: string) => void, options?: WatcherOptions) {
        this.programPath = programPath;
        this.onUpdate = onUpdate;
        this.debounceMs = options?.debounceMs ?? 300;
    }

    start() {
        if (this.watcher) return;
        try {
            this.watcher = fs.watch(this.programPath, (eventType, filename) => {
                // Coalesce rapid writes (editor save = multiple events)
                const now = Date.now();
                if (now - this.lastChange < this.debounceMs) return;
                this.lastChange = now;

                if (this.timer) clearTimeout(this.timer);
                this.timer = setTimeout(() => {
                    this.handleChange();
                }, this.debounceMs);
            });
            this.watcher.on('error', (err) => {
                console.error(`[watcher:${this.programPath}] ${err.message}`);
            });
        } catch (err: any) {
            console.error(`[watcher:${this.programPath}] Failed to watch: ${err.message}`);
        }
    }

    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }

    private handleChange() {
        try {
            // Parse first — only deploy if the file is still valid/eligible
            const program = parseGneolFile(this.programPath);
            if (!program || !program.title) {
                console.error(`[watcher:${this.programPath}] Parse failed or invalid program — keeping previous version.`);
                return;
            }
            console.log(`[watcher:${this.programPath}] Change detected, re-deploying...`);
            this.onUpdate(this.programPath);
        } catch (err: any) {
            console.error(`[watcher:${this.programPath}] Parse error, skipping redeploy: ${err.message}`);
        }
    }
}
