// ============================================================================
// Parser: mcp() directive — maps MCP server name to config file path
// ============================================================================

/**
 * Extract MCP config declarations:
 *   mcp("server-name").config("path/to/config.json")
 * Returns a key-value record (name → configPath) and cleaned content.
 */
import { McpConfigDeclaration } from '../types';

export function parseMcp(content: string): {
    mcpConfigs: Record<string, McpConfigDeclaration>;
    filteredContent: string;
} {
    const mcpConfigs: Record<string, McpConfigDeclaration> = {};
    const blockPattern = /(?:^|\n)[ \t]*mcp\("([^"]+)"\)(?:\n?[ \t]*\.(?:config|token)\([^)]*\))*/g;

    let filteredContent = content.replace(blockPattern, (match, name: string) => {
        const configMatch = match.match(/\.config\("([^"]+)"\)/);
        if (!configMatch) {
            return match;
        }
        const tokens = [...match.matchAll(/\.token\("([^"]+)"\)/g)].map(m => m[1]);
        mcpConfigs[name] = {
            config: configMatch[1],
            tokens: tokens.length > 0 ? tokens : undefined,
        };
        return '';
    });
    // Remove any remaining single leading/trailing blank lines after substring removal
    filteredContent = filteredContent.replace(/\n{2,}/g, '\n');
    return { mcpConfigs, filteredContent };
}
