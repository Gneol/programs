
import { parseGneolFile, parseTimeExpression, parseEnvFile } from './parser';
import { GneolEventBucket } from './bucket';
import { ttc } from 'ttc-rpc';
import { Stream } from '../db/stream';
import fs from 'fs';
import { stripFunctionCalls } from '../llm/utils/stripUtils';
import * as fspath from 'path';
import { Action, GneolProgram, IfExecType } from './types';
import { applySubagents, resolveSubagentRef } from './applySubagents';
import { getGlobalSoulStore, Soul } from '../db/program';
import { cacheEngine, ModelInstance, preloadModelsFromBindings } from '../models';
import { ProgramToolManager } from '../tools/utils/ProgramToolManager';
import { markForRebuild } from '../llm/system_message';


export class ProgramRuntime {

    private static NeuralCore: Map<string, ProgramRuntime> = new Map();
    static isInitialized: boolean;
    agentId: string;
    program: GneolProgram;
    mcpTools: any[];
    events: Set<string> = new Set();
    eventBucket: GneolEventBucket;
    _scid: string;
    intervalId: ReturnType<typeof setInterval>;
    envStore: Record<string, string> = {};

    constructor(agentId: string, program: GneolProgram, envStore?: Record<string, string>) {
        this.agentId = agentId;
        this.program = program;
        this.envStore = envStore ?? ProgramRuntime.resolveEnv(program);
        this.eventBucket = new GneolEventBucket(this.eventBucketCallback);
        this.stripEvents(program);
        this.intervalId = setInterval(async () => await this.tick(), 1000);
    }

    // ── Static: One-stop deploy :: parse → env → soul → models → runtime ──
    static async deployProgram(filePath: string, agentId?: string): Promise<{ title: string; soulId: string, name: string }> {
        const resolvedPath = fspath.resolve(filePath);
        if (!fs.existsSync(resolvedPath)) throw new Error(`File not found: ${resolvedPath}`);

        // const content = fs.readFileSync(resolvedPath, 'utf-8');
        const program = parseGneolFile(resolvedPath);

        // Resolve env files for this program — uses the same static method
        const envStore = ProgramRuntime.resolveEnv(program);

        // Reuse existing runtime or create a new one (keyed by resolved path)
        let runtime = ProgramRuntime.NeuralCore.get(resolvedPath);
        if (runtime) {
            runtime.refresh(program, envStore);
        } else {
            runtime = new ProgramRuntime(agentId || resolvedPath, program, envStore);
            ProgramRuntime.NeuralCore.set(resolvedPath, runtime);
        }

        // Create / find a root soul for this program
        const store = getGlobalSoulStore();
        let rootSoul = store.list().find(s => s.programPath === filePath && !s.parentId);
        if (!rootSoul) {
            rootSoul = store.create({
                name: 'parentAgent',
                programPath: program.path,
                program: program.title,
                llm: program.parentModel || '',
                notes: [],
                workSpace: program.path
            });
        } else if (rootSoul.llm !== program.parentModel) {
            // Update the soul's llm tag when the program header model changes
            rootSoul = store.update(rootSoul.id, { llm: program.parentModel || '' });
        }

        console.log(agentId, filePath, rootSoul.name);
        // Apply subagent declarations from the program
        applySubagents(program, rootSoul.id);

        // Resolve subagent references in actions (name → id) early, so runtime never sees names
        for (const action of program.actions) {
            if (action.subagent) {
                console.log('resolving sub agent id', action.subagent)
                action.subagent = resolveSubagentRef(action.subagent, rootSoul.id) ?? undefined;
                console.log('resolved to ', action.subagent)
            }
        }

        // Validate that parentModel tag has a binding (or already cached via a prior deployment)
        const parentTag = program.parentModel;
        if (parentTag) {
            const existingCache = await cacheEngine.get(parentTag);
            if (!existingCache) {
                const hasBinding = (program.modelBindings || []).some(b => b.tag === parentTag);
                if (!hasBinding) {
                    throw new Error(
                        `Program "${program.title}" uses header model tag "${parentTag}" ` +
                        `but no matching model("${parentTag}") binding block was found and it's not in the global cache.`
                    );
                }
            }
        }

        // Pre‑cache model instances from program bindings
        try {
            await preloadModelsFromBindings(program.modelBindings || [], envStore);
        } catch (err: any) {
            console.warn(`Model preload warning for "${program.title}": ${err.message}`);
        }

        return { title: program.title, soulId: rootSoul.id, name: rootSoul.name };
    }

    handleToolDefinitions = async (program: GneolProgram) => {
        if (!program.toolDefs || program.toolDefs.length === 0) return;
        const programDir = program.path.substring(0, program.path.lastIndexOf('/'));
        for (const def of program.toolDefs) {
            try {
                const resolvedPath = fspath.resolve(programDir, def.scriptPath);
                def.scriptPath = resolvedPath;
                await ProgramToolManager.addTool(this._scid, this.agentId, resolvedPath);
            } catch (error) {
                console.error(error.message);
            }
        }
    }

    eventBucketCallback = async (action, message) => {
        if (action.subagent) {
            await this.trigger(message, action.subagent);
        } else {
            await this.trigger(message);
        }
    }

    stripEvents = (program: GneolProgram) => {
        program.actions.forEach(a => {
            if (a.type === 'event') {
                this.events.add(a.marker);
                this.eventBucket.initBucket(a, program);
            }
        })
    }

    static resolveEnv(program: GneolProgram): Record<string, string> {
        const programDir = program.path.substring(0, program.path.lastIndexOf('/'));
        let envFileToLoad: string | undefined;
        if (program.env !== undefined) {
            if (program.env === '') {
                const defaultEnv = `${programDir}/.env`;
                if (fs.existsSync(defaultEnv)) {
                    envFileToLoad = defaultEnv;
                }
            } else {
                envFileToLoad = program.env.startsWith('/') ? program.env : `${programDir}/${program.env}`;
            }
        }
        if (envFileToLoad) {
            return parseEnvFile(envFileToLoad, {});
        }
        return {};
    }

    formatAction(program: GneolProgram, action: Action): string {
        let output = `⏰ Schedule in program - ${program.title}\n`;
        output += `Message: ${action.instructions.length > 0 ? action.instructions.join('; ') : ''}\n`;

        if (action.type === 'time' && action.marker.startsWith('every:')) {
            const everyPart = action.marker.replace('every:', '');
            output += `Recurring: every ${everyPart}`;
            if (action.initialMaxTrigger !== Infinity) {
                output += ` | Remaining: ${action.maxTrigger}/${action.initialMaxTrigger}`;
            }
            output += '\n';
        }

        if (action.resources && action.resources.length > 0) {
            output += `📎 Files/Folders Attached:\n`;
            action.resources.forEach(r => {
                output += `  - ${r}\n`;
            });
        }

        if (action.modify) {
            output += `🧬 Evolution Nudge: Review and evolve this schedule for next trigger\n`;
        }

        return output;
    }

    invoke = async (event: string, args?: any) => {
        if (!this.events.has(event)) return;
        const jobId = await this.eventBucket.invoke(event, args);
        return jobId;
    }

    refresh = (program: GneolProgram, envStore?: Record<string, string>) => {
        this.program = program;
        this.envStore = envStore ?? ProgramRuntime.resolveEnv(program);
        this.stripEvents(program);
        this.eventBucket = new GneolEventBucket(this.eventBucketCallback);
        this.stripEvents(program);
        this.events.clear();
        program.actions.forEach(a => { if (a.type === 'event') this.events.add(a.marker); });
        program.actions.forEach(a => {
            if (a.type === 'event') this.eventBucket.initBucket(a, program);
        });
    }

    static removeProgram(path: string) {
        const runtime = this.NeuralCore.get(path);
        if (runtime) {
            const program = runtime.program;
            program.actions.forEach(a => {
                if (a.type === 'event') {
                    runtime.events.delete(a.marker);
                    runtime.eventBucket.eventBuckets.delete(a.marker);
                }
            });
        }
    }

    /** Retrieve a runtime by its resolved program file path (the key in NeuralCore). */
    static getRuntime(filePath: string): ProgramRuntime | undefined {
        return this.NeuralCore.get(filePath);
    }

    /** Return all active runtimes */
    static getAllRuntimes(): ProgramRuntime[] {
        return Array.from(this.NeuralCore.values());
    }

    /** Find a runtime by program title */
    static getRuntimeByTitle(title: string): ProgramRuntime | undefined {
        for (const r of this.NeuralCore.values()) {
            if (r.program.title === title) return r;
        }
        return undefined;
    }

    static ensureIdDirective(filePath: string, agentId: string): void {
        const fs = require('fs');
        let content = fs.readFileSync(filePath, 'utf-8');
        // Check if .id() exists anywhere in the header block (allow any leading whitespace)
        if (/^\s*\.id\("[^"]+"\)/m.test(content)) return;

        const titleRegex = /^program\("[^"]+"\)/m;
        const titleMatch = content.match(titleRegex);
        if (!titleMatch) throw new Error('Missing program title. Cannot inject .id()');

        // Insert .id() on a new line after the program title line
        const insertion = `\n    .id("${agentId}")`;
        content = content.replace(titleRegex, (match) => match + insertion);
        fs.writeFileSync(filePath, content, 'utf-8');
    }

    /** Load a program from a soul's stored path (used during init). */
    private static async loadFromSoul(soul: Soul): Promise<void> {
        if (!soul.programPath || !fs.existsSync(soul.programPath)) {
            console.warn(`Soul "${soul.id}" has no valid program script; skipping.`);
            return;
        }
        try {
            const result = await ProgramRuntime.deployProgram(soul.programPath, soul.id);
            const runtime = ProgramRuntime.NeuralCore.get(fspath.resolve(soul.programPath));
            if (runtime) runtime.agentId = soul.id;
            await runtime.handleToolDefinitions(runtime.program);
            // console.log(`Loaded soul "${soul.id}" → program "${result.title}"`);
        } catch (err: any) {
            console.warn(`Failed to load soul "${soul.id}": ${err.message}`);
        }
    }

    static async init() {
        const store = getGlobalSoulStore();
        const souls = store.list().filter(a => !a.parentId)

        this.isInitialized = true;

        await Promise.all(souls.map(async (soul) => {
            try {
                await this.loadFromSoul(soul);
                const resolvedPath = soul.programPath ? fspath.resolve(soul.programPath) : '';
                const runtime = ProgramRuntime.NeuralCore.get(resolvedPath);
                if (runtime) {
                    markForRebuild(soul.id, true)
                } else {
                    // create one na
                    
                }
            } catch (error) {
                console.log(String(error));
            }
        }));

        Stream.init();
        console.log(`ProgramRuntime initialized with ${ProgramRuntime.NeuralCore.size} program(s)`);
    }


    // ticks every second
    tick = async () => {
        const now = Date.now();
        // console.log(now, this.agentId);
        // for (const program of this.programs) {
        // console.log(program.title, program.path)
        for (const a of this.program.actions) {
            // Skip event-driven actions – they fire via invoke()
            if (a.type === 'event') continue;
            // Skip exhausted actions
            if (a.maxTrigger !== Infinity && a.maxTrigger <= 0) continue;

            // Fire when scheduled time is reached
            if (now >= a.snapShot) {
                // Decrement maxTrigger before formatting so remaining shows post-fire count
                if (a.maxTrigger !== Infinity) {
                    a.maxTrigger--;
                }

                // if need be, check for condition if exist.
                console.log(JSON.stringify(a, null, 2))
                const isConditionGo = a.condition ? await this.isCondition_a_Go(a.condition) : true;
                const isExecConditionGo = a.ifExec ? await this.isExecCondition_a_Go(a.ifExec) : true;
                if (isConditionGo && isExecConditionGo) {
                    const msg = this.formatAction(this.program, a);
                    if (a.subagent) {
                        await this.trigger(msg, a.subagent);
                    } else {
                        await this.trigger(msg);
                    }
                    console.log(a.type, a.marker, Date.now() - a.snapShot)

                    // One-shot relative times (e.g. "+5min") should not re-fire
                    if (a.marker.startsWith('+')) {
                        a.snapShot = Infinity;
                    } else {
                        // Recalculate next occurrence (works for recurring + absolute)
                        a.snapShot = parseTimeExpression(a.marker);
                    }
                }
            }
        }
    }

    private static compareOutput(got: string, condition: IfExecType): boolean {
        const expect = condition.expected;
        switch (condition.operator) {
            case 'eq': return got === expect;
            case 'lt': {
                const numGot = Number(got);
                const numExpect = Number(expect);
                if (isNaN(numGot) || isNaN(numExpect)) {
                    console.warn(`ifExec lt: non-numeric values — got:"${got}" expected:"${expect}"`);
                    return false;
                }
                return numGot < numExpect;
            }
            case 'gt': {
                const numGot = Number(got);
                const numExpect = Number(expect);
                if (isNaN(numGot) || isNaN(numExpect)) {
                    console.warn(`ifExec gt: non-numeric values — got:"${got}" expected:"${expect}"`);
                    return false;
                }
                return numGot > numExpect;
            }
            case 'contains': return got.includes(expect);
            default: return got === expect;
        }
    }

    async isExecCondition_a_Go(condition: IfExecType): Promise<boolean> {
        try {
            const execSync = await import('child_process').then(m => m.execSync);
            // shell: '/bin/sh' enables shebang scripts, pipes, and inline commands.
            // On non-zero exit, execSync throws but stdout is still accessible via err.stdout.
            const result = execSync(condition.script, {
                timeout: 15000,
                shell: true as any,
            });
            const trimmed = result.toString('utf-8').trim();
            return ProgramRuntime.compareOutput(trimmed, condition);
        } catch (err: any) {
            // On non-zero exit, err.stdout may contain the script output — extract it
            if (err.stdout && String(err.stdout).trim().length > 0) {
                const got = String(err.stdout).trim();
                return ProgramRuntime.compareOutput(got, condition);
            }
            console.warn(`ifExec script "${condition.script}" failed: ${err.message || err}`);
            return false;
        }
    }

    async isCondition_a_Go(condition: string) {
        try {
            const store = getGlobalSoulStore();
            const chat = await store.get(this.agentId);
            const messages = store.getMessages(this.agentId);
            const _messages = await stripFunctionCalls({
                messages: [...messages],
                _scid: this._scid
            });
            const prompt = [
                {
                    role: 'system',
                    content: `You are a boolean checker for the condition "${condition}", the conversation history shall be supplied to you and your job is simply output true or output false, do not output any other thing than "true" or "false"`
                }, {
                    role: 'user',
                    content: JSON.stringify(_messages)
                }
            ]

            //  console.log(prompt);
            const cachedModels = cacheEngine.getAll();
            const modelData = cachedModels.find(m => m.value.name === chat.llm);
            const response = await modelData.value.llm.invoke(prompt as any);
            const result = response.content;
            console.log(result);

            return result.trim().toLowerCase() === 'true' || result.trim().toLowerCase().includes('true');
        } catch (error) {
            return false;
        }
    }

    getToolDefinition = async () => {
        const response = await Promise.all(this.program.toolDefs.map(def => {
            return ProgramToolManager.getDefinition(def.scriptPath);
        }));

        return response.filter(d => d) || []
    }

    async getProgramContexts(): Promise<{ label: string; content: string }[]> {
        const results: { label: string; content: string }[] = [];
        // for (const program of this.program) {
        // Re-parse the file from disk to get fresh contexts
        // let freshContexts: { label: string; type: 'text' | 'resource'; value: string }[] = [];
        // try {
        //     const freshProgram = parseGneolFile(this.program.path);
        //     freshContexts = freshProgram.contexts || [];
        // } catch {
        //     // If file can't be read, fall back to cached contexts
        //     freshContexts = this.program.contexts || [];
        // }
        const freshContexts = this.program.contexts;
        if (freshContexts.length === 0) return [];
        for (const ctx of freshContexts) {
            if (ctx.type === 'text') {
                results.push({ label: ctx.label, content: ctx.value });
            } else if (ctx.type === 'resource') {
                let content = '';
                try {
                    if (ctx.value.startsWith('http://') || ctx.value.startsWith('https://')) {
                        const res = await fetch(ctx.value);
                        content = await res.text();
                    } else {
                        content = fs.readFileSync(ctx.value, 'utf-8');
                    }
                } catch (err) {
                    content = `[Failed to load resource: ${err}]`;
                }
                results.push({ label: ctx.label, content });
            }
        }
        // }
        return results;
    }


    trigger = async (message: string, id?: string) => {
        const store = getGlobalSoulStore();
        const chat = await store.get(id || this.agentId);
        const modelData = await cacheEngine.get(chat.llm);
        const format_message = JSON.stringify([{
            function: "TTCInternal.trigger",
            response: {
                message: message
            }
        }]);
        store.addMessage(chat.id, {
            role: 'user',
            content: JSON.stringify(format_message)
        });
        await modelData?.invoke(chat.id)
    }
}
