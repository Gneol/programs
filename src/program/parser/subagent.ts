// ============================================================================
// Parser: subagent() directive — subagent("name").model("tag").id("...").description("...")
// and subagent().model() for wildcard
// ============================================================================

import { SubagentDeclaration } from '../types';

/**
 * Extract subagent declarations from content.
 * Each subagent directive may include .model(), .id(), and .description() sub-functions.
 * Wildcard subagent() gets captured with name='' (empty string).
 */
export function parseSubagents(content: string): {
    subagentDeclarations: SubagentDeclaration[];
    wildcardModel?: string;
    filteredContent: string;
} {
    const subagentDeclarations: SubagentDeclaration[] = [];
    let wildcardModel: string | undefined;

    // Match entire subagent line including all sub-function calls
    const blockPattern = /(?:^|\n)\s*(?:subagent|sentinel)(?:\("([^"]*)"\)|\(\))((?:\s*\.\w+\("[^"]*"\))*)/g;
    let match;
    let filteredContent = content;

    while ((match = blockPattern.exec(content)) !== null) {
        const name = match[1] || '';  // empty string for wildcard
        const subCalls = match[2];

        // Extract model, id, description from sub-calls
        const modelMatch = subCalls.match(/\.model\("([^"]+)"\)/);
        const idMatch = subCalls.match(/\.id\("([^"]+)"\)/);
        const descMatch = subCalls.match(/\.description\("([^"]+)"\)/);

        const model = modelMatch ? modelMatch[1] : undefined;
        const id = idMatch ? idMatch[1] : undefined;
        const description = descMatch ? descMatch[1] : undefined;

        if (!name && model) {
            // Wildcard subagent
            wildcardModel = model;
        } else {
            subagentDeclarations.push({
                name,
                model,
                id,
                description
            });
        }
    }

    // Remove all matched lines from content
    filteredContent = filteredContent.replace(blockPattern, '');

    return { subagentDeclarations, wildcardModel, filteredContent };
}

// Re-export under original name for backward compatibility
export const parseSentinelModels = parseSubagents;
export const parseSentinels = parseSubagents;
