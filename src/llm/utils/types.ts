import z from "zod";
import { zodToTs } from "./zodToTs";

export type f_call = {
    function?: string;
    arguments?: Record<string, any>;
}



export type f_schema = {
    name: string;
    description: string;
    permission?: boolean;
    input_schema: string;
    output_schema: string;
}

export type f_response = {
    function: string;
    response: any;
}

export type sentinal_status = 'activated' | 'terminated' | 'none';

export type llm_response = {
    clean: f_call[];
    raw: string;
    tokenUsage?: any;
    model_id?: string;
    status?: "success" | "error";
}

export type llm_message_internal = {
    role: "user" | "assistant" | "system";
    content: string;
}

export type llm_message = {
    role: "user" | "assistant" | "system";
    content: string;
    timestamp?: Date
}

export const llmOutput = z.array(z.object({
    function: z.string().describe("This should be the name of the function"),
    arguments: z.object({}).nullable().optional().describe("Function arguments, should match the input schema of the function")
})).describe("LLM output format for function calls, follow this schema strictly");

export type llmOutputType = z.infer<typeof llmOutput>;

export const zodToSimpleString = async (schema: any): Promise<string> => {
    return zodToTs(schema);
}

export const construct_schema = z.object({
    description: z.string().describe("Description of the construct"),
    instruction: z.string().describe("Instruction for the construct"),
    construct_id: z.string().describe("Unique identifier for the construct")
}).describe("Schema for construct invocation");


export type IModelPreference = {
    id: string,
    name: string,
    multimodal: 'yes' | 'no' | string;
}