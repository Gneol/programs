// ============================================================================
// Parser: sentinel() directive — sentinel("name").model("tag").id("...").description("...")
// and sentinel().model() for wildcard
// ============================================================================

import { SentinelDeclaration } from '../types';

/**
 * Extract sentinel declarations from content.
 * Each sentinel directive may include .model(), .id(), and .description() sub-functions.
 * Wildcard sentinel() gets captured with name='' (empty string).
 */
export function parseSentinels(content: string): {
    sentinelDeclarations: SentinelDeclaration[];
    wildcardModel?: string;
    filteredContent: string;
} {
    const sentinelDeclarations: SentinelDeclaration[] = [];
    let wildcardModel: string | undefined;

    // Match entire sentinel line including all sub-function calls
    const blockPattern = /(?:^|\n)\s*sentinel(?:\("([^"]*)"\)|\(\))((?:\s*\.\w+\("[^"]*"\))*)/g;
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
            // Wildcard sentinel
            wildcardModel = model;
        } else {
            sentinelDeclarations.push({
                name,
                model,
                id,
                description
            });
        }
    }

    // Remove all matched lines from content
    filteredContent = filteredContent.replace(blockPattern, '');

    return { sentinelDeclarations, wildcardModel, filteredContent };
}

// Keep old name for backward compatibility — re-export under original name
export const parseSentinelModels = parseSentinels;
