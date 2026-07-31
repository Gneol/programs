import { Program, Server } from 'gneol-sdk';
import path from 'path';
import os from 'os';
import net from 'net';
import { GneolEventEmitter } from 'gneol-sdk/dist/server/event';
import { pushSystemMessage } from '../interface/chat';


export class Assistant {
    private assistantId: string;
    name: string;
    llm: string = '';
    server: Server
    program: Program = null;
    private actionClient: GneolEventEmitter;

    constructor(assistantId: string, programPath: string) {
        try {
            this.assistantId = assistantId;
            this.server = new Server('http://localhost:3999');
            this.name = assistantId;
            this.program = new Program(programPath);
        } catch (error) {
            console.log(error);
        }
    }

    get id(): string {
        return this.assistantId;
    }

    /** Check if a port is available by trying to bind to it */
    private async isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', () => resolve(false));
            server.once('listening', () => {
                server.close(() => resolve(true));
            });
            server.listen(port, '0.0.0.0');
        });
    }

    async init(): Promise<void> {
        // Find first available port starting from 3011
        let port = 3011;
        const maxAttempts = 20;
        for (let i = 0; i < maxAttempts; i++) {
            if (await this.isPortAvailable(port)) break;
            port++;
        }
        console.log(`Starting assistant API on port ${port}`);
        const event = await this.server.serve(port, []);
        this.actionClient = event;
        this.actionClient.setAgent(this.assistantId);
        console.log("Assistant API ready on port", port);
    }

    private async _ensureReady(): Promise<void> {
        // await this.ready;
    }

    async message(text: string) {
        this.actionClient.chat(text);
    }

    async trigger(text: string) {
        this.actionClient?.trigger?.(text);
    }

    subscribe = (event: string | any, cb: any) => {
        this.actionClient.on(event, cb);
    }

    approveFunction(id: string, approved: boolean, message?: string) {
        this.actionClient?.approveFunction?.(id, approved, message);
    }

    submitFormSelection(id: string, selections: string[]) {
        // this.actionClient?.submitFormSelection?.(id, selections);
    }

    async history(limit: number = 10, page: number = 1): Promise<any> {
        return await this.actionClient.history(page, limit);
    }

    async clearMessages(): Promise<any> {
        return { status: 'success' };
    }

    async reset(): Promise<any> {
        return { status: 'success' };
    }

    async stats(name: string): Promise<any> {
        await this._ensureReady();
        const header = await this.program.header.get();
        this.llm = header.model;
        this.name = name;
        // return { llm: this.llm, model: header.model };
    }

    async selectContext(label: string, context_data: string): Promise<any> {

    }

    async getModels(): Promise<any> {
        await this._ensureReady();
        return await this.program.models.list();
    }

    async selectModel(model_id: string, _type: 'llm' | 'stt' | 'tts'): Promise<any> {
        this.llm = model_id;
        return { status: 'success', model: model_id };
    }

    async originInfo(url: string): Promise<any> {
        return { url, status: 'unknown' };
    }

    async close(): Promise<any> {
        return { status: 'success' };
    }

    async addModel(input: {
        name: string;
        provider: string;
        apiSecret?: string;
        options?: { temperature?: number; max_tokens?: number; rate_limit?: number };
        type: string;
    }): Promise<any> {
        await this._ensureReady();
        return await this.program.models.create({
            name: input.name,
            provider: input.provider,
            modelId: input.name,
            apiKey: input.apiSecret || '',
            temperature: input.options?.temperature,
            maxTokens: input.options?.max_tokens,
            rateLimit: input.options?.rate_limit,
        });
    }

    async updateModel(modelId: string, updates: {
        name?: string;
        apiSecret?: string;
        options?: Record<string, any>;
    }): Promise<any> {
        await this._ensureReady();
        return await this.program.models.update(modelId, {
            name: updates.name,
            apiKey: updates.apiSecret,
            ...(updates.options ? {
                temperature: updates.options.temperature,
                maxTokens: updates.options.max_tokens,
                rateLimit: updates.options.rate_limit,
            } : {}),
        });
    }

    async deleteModel(modelId: string): Promise<any> {
        await this._ensureReady();
        return await this.program.models.delete(modelId);
    }
}
