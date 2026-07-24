import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

export type Message = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

const GNEOL_DIR = path.join(os.homedir(), '.gneol');
const SOULS_DIR = path.join(GNEOL_DIR, 'souls');
const MESSAGES_DIR = path.join(GNEOL_DIR, 'messages');

function ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
}

export type Attachment = {
    type: string;
    url: string
}

export class Soul {
    id: string;
    name: string;
    program: string;
    backstory: string;
    programPath: string;
    llm: string;
    summary: string;
    parentId: string;
    notes: string[];
    attachments: Attachment[]
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    _scid: string;
    messagesPath: string;
    private _messages: Message[] | null = null; /* In-memory cache; loaded lazily from file */

    constructor(config: {
        id?: string;
        name: string;
        program: string;
        programPath: string;
        llm: string;
        summary?: string;
        backstory?: string;
        parentId?: string;
        notes?: string[];
        attachments?: Attachment[];
        inputTokens?: number;
        outputTokens?: number;
        cachedTokens?: number;
        _scid?: string;
        messagesPath?: string;
    }) {
        this.id = config.id ?? `gneol_soul_${randomUUID()}`;
        this.name = config.name;
        this.program = config.program;
        this.llm = config.llm;
        this.summary = config.summary || '';
        this.backstory = config.backstory || '';
        this.parentId = config.parentId || '';
        this.notes = config.notes || [];
        this.attachments = config.attachments || [];
        this.inputTokens = config.inputTokens || 0;
        this.outputTokens = config.outputTokens || 0;
        this.cachedTokens = config.cachedTokens || 0;
        this._scid = config._scid || '';
        this.programPath = config.programPath || '';
        this.messagesPath = config.messagesPath || path.join(MESSAGES_DIR, `${this.id}.json`);
    }

    /** Load messages from memory cache (if available) or from disk */
    loadMessages(): Message[] {
        if (this._messages === null) {
            try {
                const raw = fs.readFileSync(this.messagesPath, 'utf-8');
                this._messages = JSON.parse(raw);
            } catch {
                this._messages = [];
            }
        }
        return this._messages;
    }

    /** Save messages to memory cache and persist to file */
    saveMessages(messages: Message[]): void {
        this._messages = messages;
        ensureDir(MESSAGES_DIR);
        fs.writeFileSync(this.messagesPath, JSON.stringify(messages, null, 2), 'utf-8');
    }
}

/**
 * GlobalSoulStore – manages soul configs and messages in ~/.gneol/
 *
 * Directory layout:
 *   ~/.gneol/souls/<id>.json     → soul config (name, program, llm, summary, messagesPath)
 *   ~/.gneol/messages/<id>.json  → message array
 *
 * Souls are indexed in memory for fast lookup and write‑through persistence.
 */
// Singleton instance for use across the application
let _instance: GlobalSoulStore | null = null;

export function getGlobalSoulStore(): GlobalSoulStore {
    if (!_instance) {
        _instance = new GlobalSoulStore();
    }
    return _instance;
}

export class GlobalSoulStore {
    private cache: Map<string, Soul> = new Map();

    constructor() {
        ensureDir(SOULS_DIR);
        ensureDir(MESSAGES_DIR);
        this.loadAll();
    }

    /* ── persistence ───────────────────────────────────── */

    private soulFilePath(id: string): string {
        return path.join(SOULS_DIR, `${id}.json`);
    }

    private loadAll(): void {
        this.cache.clear();
        if (!fs.existsSync(SOULS_DIR)) return;
        const files = fs.readdirSync(SOULS_DIR).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const data = fs.readFileSync(path.join(SOULS_DIR, file), 'utf-8');
                const parsed = JSON.parse(data);
                const soul = new Soul(parsed);
                soul.messagesPath = parsed.messagesPath ?? soul.messagesPath;
                this.cache.set(soul.id, soul);
            } catch {
                // skip corrupt files
            }
        }
    }

    private saveSoulConfig(soul: Soul): void {
        ensureDir(SOULS_DIR);
        // Exclude runtime-only fields (_messages) — use type assertion to access private field
        const { _messages, ...config } = soul as any;
        fs.writeFileSync(
            this.soulFilePath(soul.id),
            JSON.stringify(config, null, 2),
            'utf-8'
        );
    }

    private deleteSoulFile(id: string): void {
        const fp = this.soulFilePath(id);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }

    /* ── public API ─────────────────────────────────────── */

    /** Create a new soul and persist it */
    create(config: { name: string; program: string; programPath: string, llm: string, notes: string[], parentId?: string, backstory?: string, _scid?: string }): Soul {
        const soul = new Soul(config);
        this.saveSoulConfig(soul);
        // Don't create messages file upfront — loadMessages returns [] lazily on first access
        this.cache.set(soul.id, soul);
        return soul;
    }

    getSiblingSouls(parentId: string){
        const souls = this.list();
        return souls.filter(s => s.parentId === parentId);
    }

    /** Get a soul by ID (from cache) */
    get(id: string): Soul | undefined {
        return this.cache.get(id);
    }

    /** List souls, optionally filtering by query */
    list(query?: string): Soul[] {
        const all = Array.from(this.cache.values());
        if (!query) return all;
        const lower = query.toLowerCase();
        return all.filter(
            s =>
                s.id.toLowerCase().includes(lower) ||
                s.name.toLowerCase().includes(lower) ||
                s.program.toLowerCase().includes(lower)
        );
    }

    /** Update a soul config */
    update(id: string, updates: Partial<Pick<Soul, 'name' | 'program' | 'llm' | 'summary' | 'backstory' | 'parentId' | 'notes' | 'attachments' | 'inputTokens' | 'outputTokens' | 'cachedTokens' | '_scid'>>): Soul | undefined {
        const existing = this.cache.get(id);
        if (!existing) return undefined;

        // Only override explicitly provided keys (skip undefined)
        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                (existing as any)[key] = value;
            }
        }

        this.saveSoulConfig(existing);
        return existing;
    }

    /** Delete a soul and its messages */
    delete(id: string): boolean {
        const existed = this.cache.delete(id);
        if (existed) {
            this.deleteSoulFile(id);
            const msgFile = path.join(MESSAGES_DIR, `${id}.json`);
            if (fs.existsSync(msgFile)) fs.unlinkSync(msgFile);
        }
        return existed;
    }

    /** Append a message to a soul's messages file */
    addMessage(id: string, msg: Message): void {
        const soul = this.cache.get(id);
        if (!soul) throw new Error(`Soul not found: ${id}`);
        const messages = soul.loadMessages();
        messages.push(msg);
        soul.saveMessages(messages);
    }

    /** Get all messages for a soul */
    getMessages(id: string): Message[] {
        const soul = this.cache.get(id);
        if (!soul) throw new Error(`Soul not found: ${id}`);
        return soul.loadMessages();
    }

    /** Overwrite messages for a soul (e.g. after summarisation) */
    setMessages(id: string, messages: Message[]): void {
        const soul = this.cache.get(id);
        if (!soul) throw new Error(`Soul not found: ${id}`);
        soul.saveMessages(messages);
    }
}