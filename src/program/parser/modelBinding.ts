// ============================================================================
// Parser: model() declarations — inline LLM or DB model references
// ============================================================================

import { ModelBinding } from '../types';

/**
 * Extract all model() bindings from content.
 * Supports both multi-line blocks and single-line configurations.
 */
export function parseModelBindings(content: string): {
    modelBindings: ModelBinding[];
    filteredContent: string;
} {
    const modelBindings: ModelBinding[] = [];
    let filteredContent = content;

    // Match multi-line declaration blocks
    const multiLineBlockRegex = /(?:^|\n)\s*model\("([^"]+)"\)([\s\S]*?)(?=\n\s*(?:model|at|on|\.model)\b|$)/g;
    let blockMatch;
    while ((blockMatch = multiLineBlockRegex.exec(filteredContent)) !== null) {
        const tag = blockMatch[1];
        const block = blockMatch[2];

        const binding: ModelBinding = { tag, modelId: tag };

        const providerMatch = block.match(/\.provider\("([^"]+)"\)/);
        const modelIdMatch = block.match(/\.modelId\("([^"]+)"\)/);
        if (modelIdMatch) binding.modelId = modelIdMatch[1];
        if (providerMatch) binding.provider = providerMatch[1];
        const apiKeyMatch = block.match(/\.apiKey\("([^"]+)"\)/);
        if (apiKeyMatch) binding.apiKey = apiKeyMatch[1];
        const tempMatch = block.match(/\.temperature\((\d+(?:\.\d+)?)\)/);
        if (tempMatch) binding.temperature = parseFloat(tempMatch[1]);
        const maxTokensMatch = block.match(/\.maxTokens\((\d+)\)/);
        if (maxTokensMatch) binding.maxTokens = parseInt(maxTokensMatch[1], 10);
        const rateLimitMatch = block.match(/\.rateLimit\((\d+)\)/);
        if (rateLimitMatch) binding.rateLimit = parseInt(rateLimitMatch[1], 10);

        modelBindings.push(binding);
    }

    // Remove all multi-line model blocks
    filteredContent = filteredContent.replace(multiLineBlockRegex, '');

    // Single-line model bindings not caught by multi-line
    const singleLinePattern = /(?:^|\n)\s*model\("([^"]+)"\)([^\n]*)/g;
    let slMatch;
    while ((slMatch = singleLinePattern.exec(content)) !== null) {
        const tag = slMatch[1];
        const remainder = slMatch[2];
        // Skip if it's a .sentinel or .summarization line (handled separately)
        if (remainder.includes('.sentinel(') || remainder.includes('.summarization(')) continue;
        // Check if already captured from multi-line
        if (modelBindings.some(b => b.tag === tag)) continue;

        const binding: ModelBinding = { tag, modelId: tag };
        const modelIdMatch = remainder.match(/\.modelId\("([^"]+)"\)/);
        if (modelIdMatch) binding.modelId = modelIdMatch[1];
        const tempMatch = remainder.match(/\.temperature\((\d+(?:\.\d+)?)\)/);
        if (tempMatch) binding.temperature = parseFloat(tempMatch[1]);
        const maxTokensMatch = remainder.match(/\.maxTokens\((\d+)\)/);
        if (maxTokensMatch) binding.maxTokens = parseInt(maxTokensMatch[1], 10);
        const rateLimitMatch = remainder.match(/\.rateLimit\((\d+)\)/);
        if (rateLimitMatch) binding.rateLimit = parseInt(rateLimitMatch[1], 10);

        modelBindings.push(binding);
    }

    // Remove all remaining model lines
    filteredContent = filteredContent.replace(singleLinePattern, '');

    // Validate: if provider is set, apiKey must also be set and vice versa
    for (const binding of modelBindings) {
        if (binding.provider && !binding.apiKey) {
            throw new Error(`Model binding "${binding.tag}" has provider but no apiKey`);
        }
        if (binding.apiKey && !binding.provider) {
            throw new Error(`Model binding "${binding.tag}" has apiKey but no provider`);
        }
    }

    return { modelBindings, filteredContent };
}
