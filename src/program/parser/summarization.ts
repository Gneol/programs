// ============================================================================
// Parser: summarization() directive
// ============================================================================

/**
 * Extract summarization config: .model("tag") and optional .prompt("...").
 */
export function parseSummarization(content: string): {
    summarizationModel: string | undefined;
    summarizationPrompt: string | undefined;
    filteredContent: string;
} {
    const pattern = /(?:^|\n)\s*summarization\(\)\.model\("([^"]+)"\)([^\n]*)/;
    const match = content.match(pattern);
    let summarizationModel: string | undefined;
    let summarizationPrompt: string | undefined;
    let filteredContent = content;

    if (match) {
        summarizationModel = match[1];
        const remainder = match[2];
        const promptMatch = remainder.match(/\.prompt\("([^"]+)"\)/);
        if (promptMatch) {
            summarizationPrompt = promptMatch[1];
        }
        filteredContent = content.replace(pattern, '');
    }

    return { summarizationModel, summarizationPrompt, filteredContent };
}
