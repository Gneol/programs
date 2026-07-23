



// import { pagiLog } from "../../logger";
// import { llmOutput } from "../types";
import { jsonrepair } from "jsonrepair";
import { llmOutput, zodToSimpleString } from './types';
import { zodToTs } from "./zodToTs";

type LLMErrorHandler = (error: Error, output: string) => Promise<string>;

export class gneolJSONCleaner {

    maxDepth: number;
    constructor(maxDepth: number = 5) {
        this.maxDepth = maxDepth;
    }

    async errorHandler(error: Error, output: string, llm_instance: any) {

        return await this.fixJSONerrors(error, output, llm_instance);
    }

    async interceptedStrangeYaml(input: string) {
        if (input.includes('<｜｜DSML｜｜tool_calls>') && input.includes('</｜｜DSML｜｜tool_calls>')) {
            // console.log(input)
            return true;
        }

        // if(input.startsWith('<')){
        //     return true;
        // }

        if (input.includes('<FunctionCalls>')) {
            return true;
        }

        const hasXmlFunctionCalls =
            /<function_calls[\s>]/i.test(input)

        if (hasXmlFunctionCalls) {
            return true;
        }

        if (input.includes('<function_calls>')) {
            return true;
        }

        if (input.includes('<function>')) {
            return true;
        }

        if (input.includes('</Invoke>')) {
            return true;
        }

        return false;
    }

    public async filterOutHangingtextFromJSONArray(jsonArray: any[]): Promise<any[]> {
        let textArray: any = [];
        jsonArray = jsonArray.map(item => {
            if (typeof item === 'string') {
                // return {
                //     function: 'Internal.speakToUser',
                //     arguments: {
                //         message: item
                //     }
                // }
                if (item.includes('[{"function"')) {
                    throw new Error('needs llm inspection please')
                }
                textArray.push(item)
            }

            if (typeof item === 'object' && item.function && item.arguments) {
                return item;
            } else {
                // check oh
                if (typeof item === 'object') {
                    throw new Error('needs llm supervision')
                }
            }
        }).filter(x => x !== undefined);
        console.log(jsonArray, textArray)

        return textArray.length > 0 ? jsonArray.concat({
            function: 'Internal.speakToUser',
            arguments: {
                message: textArray.join(' ')
            }
        }) : jsonArray;
    }

    public async checkForTextOnlyOutput(output: string): Promise<boolean> {
        const trimmed = output.trim();

        if (await this.interceptedStrangeYaml(output)) {
            return false;
        }

        const json_only = trimmed.startsWith('{') && trimmed.startsWith('[') && trimmed.length > 0;
        const may_have_json = trimmed.includes('{') || trimmed.includes('[') || trimmed.includes(']') || trimmed.includes('}');

        // if there is any sligght semblance of the possibility that a there is a functional call in the system, we must push it to an llm to fix.
        if (output.includes('[{"function":') && output.includes('"arguments":')) {
            return false;
        }

        // console.log('Checking for text-only output:', { trimmed, json_only, may_have_json });
        if (!json_only && !may_have_json) {
            return true;
        } else {
            return false;
        }
        return false;
    }

    public async clean(output: string, llm_instance: any, depth: number = 0): Promise<any> {
        try {

            if (!output) {
                return {
                    clean: [],
                    raw: `[]`
                };
            }

            // First try parsing directly (for already valid JSON)
            try {
                return JSON.parse(output);
            } catch (e) {
                // Proceed with cleaning if direct parse fails
            }

            try {
                if (await this.interceptedStrangeYaml(output)) {
                    throw new Error('strange yml, must use json');
                }
                const repair_output = jsonrepair(output);
                let repair = JSON.parse(repair_output);
                if (Array.isArray(repair)) {
                    if (repair.length > 0) {
                        repair = repair.flat();
                    }
                    // console.log(repair);
                }
                return await this.filterOutHangingtextFromJSONArray(repair);
            } catch (error) {
                // continue
                // const newLineResults = await this.newLineCleanApproach(output);
                // if (newLineResults) {
                //     return newLineResults
                // }
                console.log(error, 'Error message')
                if (await this.checkForTextOnlyOutput(output)) {
                    return [{
                        function: 'Internal.speakToUser',
                        arguments: {
                            message: output
                        }
                    }];
                }
            }

            // Remove AI-specific tags
            const cleanedOutput = this.removeAITags(output);
            console.log("Cleaned output after removing AI tags:", cleanedOutput);

            // Handle code block cases
            try {
                const codeBlockResult = this.handleCodeBlocks(cleanedOutput);
                if (codeBlockResult) return codeBlockResult;
            } catch (e) {
                console.warn("Code block handling failed, trying fallbacks");
            }

            // Final attempt with error correction
            try {
                return JSON.parse(cleanedOutput);
            } catch (error: any) {
                return this.handleParseError(error, cleanedOutput, llm_instance, depth);
            }
        } catch (error) {
            console.error("Critical error in clean:", error);
            throw error;
        }
    }

    private removeAITags(output: string): string {
        // console.log(output, typeof output);
        return output
            .replace(/<think>[\s\S]*?<\/think>/g, "")
            .replace(/<antthinking>[\s\S]*?<\/antthinking>/g, "")
            .replace(/<\/?[a-z]+>/g, "");
    }

    private handleCodeBlocks(output: string): any | undefined {
        // Case 1: Complete ```json ``` block at start/end
        const fullBlockMatch = output.match(/^```(?:json)?\n([\s\S]*?)\n```$/);
        if (fullBlockMatch) {
            try {
                return JSON.parse(fullBlockMatch[1]);
            } catch (error) {
                const multiResults = this.matchMultipleJSONObjects(output);
                if (multiResults && multiResults.length > 0) {
                    return multiResults.length === 1 ? multiResults[0] : multiResults;
                }
                throw error;
            }
        }

        // Case 2: JSON wrapped in triple backticks but embedded in text (new provision)
        const embeddedBlockMatch = this.findEmbeddedJSONBlocks(output);
        if (embeddedBlockMatch) {
            try {
                return embeddedBlockMatch.length === 1 ? embeddedBlockMatch[0] : embeddedBlockMatch;
            } catch (error) {
                console.warn('Failed to parse embedded JSON blocks:', error);
            }
        }

        return undefined;
    }

    private findEmbeddedJSONBlocks(output: string): any[] | undefined {
        // More flexible regex that looks for JSON-like content between triple backticks
        const jsonBlockRegex = /```(?:json)?\n([\s\S]*?)\n```/g;
        const results: any[] = [];
        let match;

        while ((match = jsonBlockRegex.exec(output)) !== null) {
            try {
                const content = match[1].trim();
                // Skip empty blocks and non-JSON looking content
                if (!content || !this.looksLikeJSON(content)) continue;

                const parsed = JSON.parse(content);
                if (Array.isArray(parsed)) {
                    results.push(...parsed);
                } else {
                    results.push(parsed);
                }
            } catch (e) {
                console.warn('Skipping invalid embedded JSON block:', match[0]);
            }
        }

        return results.length > 0 ? results : undefined;
    }

    private looksLikeJSON(str: string): boolean {
        // Simple heuristic to check if string looks like JSON
        const trimmed = str.trim();
        return (
            (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))
        );
    }

    private matchMultipleJSONObjects(output: string): any[] | undefined {
        // Match either:
        // 1. ```json followed by content and ```
        // 2. ``` followed by content and ```
        // Only when preceded by newline or start of string
        const codeBlockRegex = /(?:^|\n)```(?:json)?\n([\s\S]*?)\n```/g;

        let results: any[] = [];
        let match;

        while ((match = codeBlockRegex.exec(output)) !== null) {
            try {
                const jsonString = match[1].trim();
                // Skip empty blocks
                if (!jsonString) continue;
                const parsedJSON = JSON.parse(jsonString);
                //.. find out if it's an array
                if (Array.isArray(parsedJSON)) {
                    console.log("it's array");
                    results = [...results, ...parsedJSON];
                } else {
                    results.push(parsedJSON);
                }
            } catch (e) {
                console.warn("Skipping invalid JSON block:", match[0]);
            }
        }

        return results.length > 0 ? results : undefined;
    }

    private async handleParseError(error: Error, output: string, llm_instance: any, depth: number): Promise<any> {
        console.error("JSON parsing error:", error.message);

        // Attempt basic fixes
        const fixed = this.applyBasicFixes(output);
        try {
            return JSON.parse(fixed);
        } catch (fixedError: any) {
            if (llm_instance) {
                console.log("Attempting LLM-assisted JSON repair...");
                return this.llmAssistedRepair(output, fixedError, llm_instance, depth);
            }
            throw new Error(
                `Failed to parse JSON after cleaning: ${fixedError.message}`
            );
        }
    }

    async fixJSONerrors(error: any, output: string, llm_instance: any) {
        const systemPrompt = `You are a JSON repair assistant. Your task is to fix malformed JSON output. The expected format is a JSON array of function call objects.

Function call schema:
${zodToTs(llmOutput)}

Rules:
- Return only the fixed JSON string. Do not include any explanations, error text, markup, or surrounding text.
- If you see hanging text that is not part of any function call, wrap it in a Internal.speakToUser function call with a message argument.
- If the output contains mistakes like [{"Internal.speakToUser": "message"}] instead of the correct format {function: "Internal.speakToUser", arguments: {message: "message"}}, fix it.
- Do not echo the error message or any part of the instructions back in your response.`

        const userPrompt = `Fix this JSON.\n\nOutput:\n${output}\n`

        await new Promise(resolve => setTimeout(resolve, 2000));
        const result = await llm_instance.invoke([
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ]);

        try {
            console.log(result.content, 'JSON ERROR FIXED FOR MALFORM OUTPUT');
            return result.content;
        } catch (error) {
            console.log('ERROR IN FIX JSON ERRORS', error);
            throw error;
        }
    }

    private applyBasicFixes(output: string): string {
        return output
            .replace(/([^\\])"(?=\s*:)/g, '$1"') // Fix unescaped quotes
            .replace(/\n/g, "\\n") // Escape newlines
            .replace(/,\s*([}\]])/g, "$1"); // Remove trailing commas
    }

    private async llmAssistedRepair(output: string, error: Error, llm_instance: any, depth: number): Promise<any> {
        if (!llm_instance || !this.errorHandler) {
            throw error;
        }

        try {
            depth++;
            if (depth >= this.maxDepth) {
                return null;
            }
            const fixedJSON = await this.errorHandler(error, output, llm_instance);
            return this.clean(fixedJSON, llm_instance, depth); // Recursively clean the LLM's output
        } catch (llmError) {
            console.error("LLM repair failed:", llmError);
            throw error; // Throw original error if LLM fails
        }
    }
}

