// ============================================================================
// Parser: mcp() directive — maps MCP server name to config file path
// ============================================================================

/**
 * Extract MCP config declarations:
 *   mcp("server-name").config("path/to/config.json")
 * Returns a key-value record (name → configPath) and cleaned content.
 */
export function parseMcp(content: string): {
    mcpConfigs: Record<string, string>;
    filteredContent: string;
} {
    const mcpConfigs: Record<string, string> = {};
    const pattern = /(?:^|\n)\s*mcp\("([^"]+)"\)\.config\("([^"]+)"\)\s*(?:\n|$)/g;
    let filteredContent = content.replace(pattern, (_, name: string, configPath: string) => {
        mcpConfigs[name] = configPath;
        return '';
    });
    // Remove any remaining single leading/trailing blank lines after substring removal
    filteredContent = filteredContent.replace(/\n{2,}/g, '\n');
    return { mcpConfigs, filteredContent };
}
