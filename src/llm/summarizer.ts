
import { getGlobalSoulStore, Soul } from "../db/program";
import { Stream } from "../db/stream";
import { llm_message_internal } from "./utils/types";




export class Summarizer {

    /**
     * Reduce messages to fit within token limit while preserving important context
     * Uses rough estimation: 4 characters ≈ 1 token
     */
    private static reduceMessagesByTokenLimit(messages: llm_message_internal[], maxTokens: number): llm_message_internal[] {
        // Always keep the summary message (first message)
        if (messages.length <= 1) return messages;

        const summaryMessage = messages[0];
        const otherMessages = messages.slice(1);

        // Calculate tokens for summary message
        const summaryTokens = Math.ceil(JSON.stringify(summaryMessage).length / 4);
        let remainingTokens = maxTokens - summaryTokens;

        if (remainingTokens <= 0) {
            // If summary alone exceeds limit, still keep it
            return [summaryMessage];
        }

        // Start from most recent messages and work backwards
        const preservedMessages: llm_message_internal[] = [summaryMessage];

        for (let i = otherMessages.length - 1; i >= 0; i--) {
            const message = otherMessages[i];
            const messageTokens = Math.ceil(JSON.stringify(message).length / 4);

            if (messageTokens <= remainingTokens) {
                preservedMessages.unshift(message); // Add to beginning to maintain order
                remainingTokens -= messageTokens;
            } else {
                // Can't fit this message, stop adding more
                break;
            }
        }

        return preservedMessages;
    }

    // static async summarize_notes(conversation_id: string) {

    //     const chat = await prisma.soul.findUnique({ where: { id: conversation_id } })
    //     if (!chat) return;

    //     const model = await ProgramRuntime.getAgentModel(conversation_id);
    //     if (!model) return;

    //     const notes: string[] = chat.notes as any || [];
    //     if (notes.length === 0) return;

    //     const stringifiedNotes = JSON.stringify(notes);

    //     const prompt = `Summarize these notes into a brief and concise summary noting the important points that needs to persist in the memory of this assistant:\n\n${stringifiedNotes}\n\nSummary:`;

    //     const instance = await CoreEngine.instantiate_model(model);
    //     if (!instance) return;

    //     const response = await instance.invoke([
    //         { role: 'system', content: 'You are a helpful assistant that summarizes notes into concise summaries.' },
    //         { role: 'user', content: prompt }
    //     ]);

    //     if (response && response.content) {
    //         const summary = response.content.trim();
    //         console.log(summary);
    //         await prisma.soul.update({
    //             where: { id: conversation_id },
    //             data: {
    //                 notes: [summary],
    //                 rebuild_system_message: true
    //             }
    //         });
    //     }
    // }

    static async summarize_(_messages: any, chat: Soul, llm: any, query?: string): Promise<string | null> {

        // const model = await CoreEngine.get_model(chat);
        // if (!model) return;

        const messages: llm_message_internal[] = _messages;
        const stringifiedMessages = JSON.stringify(messages);

        const summaryPrompt = query ?  query : 'Summarize these messages to a maximum of 30 bullet points, noting the important points that needs to persist in the memory of this assistant';

        const prompt = `${summaryPrompt}:\n\n${stringifiedMessages}\n\nSummary:`;

        const response = await llm.invoke([
            { role: 'system', content: 'You are a helpful assistant that summarizes conversations into concise bullet points.' },
            { role: 'user', content: prompt }
        ]);

        return response ?  response.content : null;
    }


    static async summarize(conversation_id: string, llm: any) {
        const store = getGlobalSoulStore();
        let chat = store.get(conversation_id);
        if (!chat) return;

        const messages = store.getMessages(chat.id)
        Stream.publish_event('llm', conversation_id, {
            state: `summarizing conversation..`,
            type: 'sub_state',
        })
        const content = await this.summarize_(messages, chat, llm);
        if (content) {
            const summary = content.trim();
            // const summaryMessage: llm_message = {
            //     role: 'user',
            //     content: `[Summary] of previous conversation:\n${summary}`
            // }

            // save summary to chatContext..
            chat = store.update(chat.id, {
                summary
            })

            // Token-aware message reduction
            const MAX_TOKENS = 4000; // Target token limit for preserved messages
            const preservedMessages = this.reduceMessagesByTokenLimit([
                // summaryMessage,
                ...(messages as any)
            ], MAX_TOKENS);


            store.setMessages(chat.id, preservedMessages);
            // await prisma.chat.update({
            //     where: { id: conversation_id },
            //     data: {
            //         messages: preservedMessages
            //     }
            // });
        }
    }
}