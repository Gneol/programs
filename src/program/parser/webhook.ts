// ============================================================================
// Parser: webhook() directive — declares a webhook URL
// ============================================================================

/**
 * Extract webhook declarations:
 *   webhook("https://example.com/hook")
 * Returns an array of webhook URLs and cleaned content.
 */
export function parseWebhooks(content: string): {
    webhooks: string[];
    filteredContent: string;
} {
    const webhooks: string[] = [];
    const pattern = /(?:^|\n)\s*webhook\("([^"]+)"\)\s*(?:\n|$)/g;
    let filteredContent = content.replace(pattern, (_match: string, url: string) => {
        webhooks.push(url);
        return '';
    });
    // Clean up extra blank lines
    filteredContent = filteredContent.replace(/\n{2,}/g, '\n');
    return { webhooks, filteredContent };
}
