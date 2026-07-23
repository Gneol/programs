// Core invocation script for LLM models with rate limiting
// This function will be expanded to fetch messages from memory using soulId
// and orchestrate the full LLM invocation including streaming, context, etc.

import { LLMModel, ModelResult } from '../models/types.js';
import { getGlobalSoulStore, Soul } from '../db/program.js';
import { gneolJSONCleaner } from './utils/jsonCleaner.js';
import { f_call, f_response, llmOutput, llmOutputType } from './utils/types.js';
import { buildSystemPrompt } from './system_message.js';
import { Bucket } from './bucket.js';
import { zodToTs } from './utils/zodToTs.js';
import { Summarizer } from './summarizer.js'
import { cacheEngine, TaskResponse } from '../models/index.js';
import { Stream } from '../db/stream.js';
import { appInvokationHandler } from '../tools/index.js';
import { invokationEngine, InvokeEngine } from './invoke.js';

const jsonCleaner = new gneolJSONCleaner(5);


export const onCompleteInvokation = async (input: {
    request: string,
    response: TaskResponse,
    config?: any
}) => {

    // console.log(input.response.clean, 'CLEAN RESPONSE HERE')
    // here we invoke all the functions, get response and invoke again
    // console.log(input)
    const store = getGlobalSoulStore();
    const calls = input.response.clean as f_call[];
    const responses = await invokationEngine.invoke(input.request, calls)

    if (responses.length > 0) {
        const message = {
            role: 'user',
            content: JSON.stringify(responses)
        }
        const soul = store.get(input.request);
        store.addMessage(input.request, message as any);
        // invoke again
        const modelData = await cacheEngine.get(soul.llm)
        await modelData.invoke(soul.id);
    } else {
        // set activity to idle
    }
}

export const onErrorOnInvokation = async (input: {
    request: string,
    response: TaskResponse,
    config?: any
}) => {

}


const repair_argument_nomal = (chat: Soul, calls: f_call[]) => {
    return calls.map(call => {
        if (call.function === 'TTCInternal.speakToUser') {
            if (chat.id.includes('sentinel')) {
                call.function = 'TTCInternal.speakToAssistant'
                call.arguments.assistant_conversation_id = chat.parentId
            }
            if (typeof call.arguments === 'string') {
                call.arguments = {
                    message: call.arguments
                }
            } else {
                const nestedArguments = call.arguments.arguments;
                call.arguments = nestedArguments ? nestedArguments : call.arguments;
            }
        }
        return call;
    })
}

/**
 * Invoke a model for a given soul/agent.
 * @param llm - The LLM model instance
 * @param soulId - The memory/soul ID to fetch conversation context
 * @returns The model result with content and usage metadata
 */
export async function invokeModel(llm: LLMModel, soulId: string): Promise<TaskResponse> {
    try {
        const store = getGlobalSoulStore();
        const soul = store.get(soulId)
        const _messages = store.getMessages(soulId);
        const summary = soul.summary ? {
            role: 'user',
            content: soul.summary
        } : null;
        let error_flag = false;
        const model = await cacheEngine.get(soul.llm);
        // get system message
        // get summary
        // get attachments if any
        let conversation_id = soulId;
        const systemPrompt = await buildSystemPrompt(soul.id);
        const messages = [
            { role: 'system', content: systemPrompt },
        ];

        // console.log(systemPrompt)

        if (summary) {
            messages.push(summary);
        }

        messages.push(..._messages);

        const resources = await Bucket.retrieve(conversation_id, model);

        if (resources) {
            messages.push(resources.attachments as any);
        }

        const response = await llm.invoke(messages as any);

        console.log(response.content, "RAW");

        let cleaned = await jsonCleaner.clean(response.content, llm);

        if (!cleaned) {
            error_flag = true;
            cleaned = [];
        }

        // in event the output is a single function call and not wrapped in an array, we wrap it in an array to maintain consistency. This is because some models may return a single function call as an object instead of an array with one object.
        if (!Array.isArray(cleaned)) {
            if (cleaned.function) {
                cleaned = [cleaned];
                response.content = `${JSON.stringify(cleaned, null, 2)}`; // Ensure the response is in a JSON format
            }
        }

        // schema validation here
        let parsedData: llmOutputType | null = null;
        try {
            parsedData = llmOutput.parse(cleaned);
        } catch (error: any) {
            console.log(error);
            // If parsing fails, try to fix the schema errors
            console.log('Schema validation failed, attempting to fix errors', error.message, cleaned,);
            cleaned = await fixSchemaErrors(response.content, llmOutput, error.message, llm);
            if (!cleaned) {
                cleaned = [];
                error_flag = true;
            }
            parsedData = llmOutput.parse(cleaned);
        } // Validate the response against the schema

        cleaned = repair_argument_nomal(soul, cleaned);

        await Bucket.clear(soul.id);

        try {
            const { tokens, notes } = await _detect_token_excess(response as any, soul.notes as any, soul, model);

            if (tokens) {
                await Summarizer.summarize(soul.id, llm);
            }

            // if (notes) {
            //     await Summarizer.summarize_notes(soul.id);
            // }
        } catch (error) {
            console.log(error)
            // it's none of our business, it won't block the operation
        }

        // console.log(JSON.stringify(response, null, 2), "TOKEN USAGGGGGGGGEEE")

        const raw = JSON.stringify(cleaned);
        // add to message
        await store.addMessage(soul.id, {
            role: 'assistant',
            content: raw
        });

        // also even take token metrics

        Stream.trackActivity(soul.id, 'sent');

        return {
            content: raw,
            clean: cleaned,
            status: error_flag ? 'error' : 'success',
            error: error_flag,
            usage_metadata: response.usage_metadata as any,
        }
    } catch (error) {
        console.log(error);
    }
}


const format_token_to_string = (tokens: number): string => {
    if (tokens < 1000) {
        return `${tokens}`;
    } else if (tokens < 1000000) {
        return `${(tokens / 1000).toFixed(2)}k`;
    } else {
        return `${(tokens / 1000000).toFixed(2)}m`;
    }
}

const _detect_token_excess = (response: TaskResponse, notes: string[], chat: Soul, model: {
    name: string,
    options: {
        max_tokens?: number
    }
}): { tokens: boolean; notes: boolean } => {
    // console.log(model)
    const max_tokens = model.options?.max_tokens || 8000;
    const tokenUsage: any = response.usage_metadata;
    const inputTokens = tokenUsage.input_tokens ? tokenUsage.input_tokens : tokenUsage.inputTokens;
    // console.log(max_tokens, tokenUsage, inputTokens, "TOKENS USAGE");
    Stream.publish_event('llm', chat.id, {
        type: 'sub_state',
        state: `${model.name}\n\t- context-tokens (${format_token_to_string(inputTokens)}) \n\t- token-usage - in(${format_token_to_string(chat.inputTokens)}) - out(${format_token_to_string(chat.outputTokens)}) - cached(${format_token_to_string(chat.cachedTokens)})`
    })

    const excess_notes = _detect_note_excess(notes);
    const tokens_exceeded = inputTokens > max_tokens;

    // then we strim all function calls and response from half of the messages

    return {
        tokens: tokens_exceeded,
        notes: excess_notes
    }
}

const _detect_note_excess = (messages: string[]): boolean => {
    const max_tokens = 1000;
    const strings_ = JSON.stringify(messages);
    const tokens = Math.ceil(strings_.length / 4);
    return tokens > max_tokens;
}


const fixSchemaErrors = async (output: string, schema: any, error_message: any, instance: any, depth: number = 0): Promise<any> => {
    const fixPrompt = `
Fix this output
Output: ${output} which does not align with the schema below
Schema: ${zodToTs(schema)}
Fix the output to match the schema.
Return the fixed output in a \`\`\`json\` markup and do not include any other text.
`
    console.log('FIXING SCHEMA ERRORS', fixPrompt);

    await new Promise(resolve => setTimeout(resolve, 2000));
    const result = await instance.invoke([
        { role: "system", content: 'You are a helpful assistant that fixes zod JSON schema errors.' },
        { role: "user", content: fixPrompt }
    ]);

    try {
        const cleanedOutput = await jsonCleaner.clean(result.content, instance);
        return cleanedOutput;
    } catch (error: any) {
        depth++;
        if (depth >= jsonCleaner.maxDepth) {
            return null;
        }
        return await fixSchemaErrors(output, schema, error_message, instance);
    }
}