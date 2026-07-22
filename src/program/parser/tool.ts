// ============================================================================
// Parser: tool() directive — registers a custom tool script
// ============================================================================

import { ToolDef } from '../types';

/**
 * Extract tool declarations:
 *   tool("label").script("path/to/script.js")
 * Returns an array of ToolDef and cleaned content.
 */
export function parseTools(content: string): {
    toolDefs: ToolDef[];
    filteredContent: string;
} {
    const toolDefs: ToolDef[] = [];

    // Match multi-line tool blocks: tool("label")
    //     .script("path")
    //     .description("desc")
    // We'll parse line by line to be robust
    const lines = content.split('\n');
    let i = 0;
    let resultLines: string[] = [];

    while (i < lines.length) {
        const line = lines[i];
        const toolMatch = line.match(/^\s*tool\("([^"]+)"\)\s*$/);
        if (toolMatch) {
            const name = toolMatch[1];
            let scriptPath = '';
            let description = '';
            i++;
            // collect subsequent sub-lines
            while (i < lines.length) {
                const sub = lines[i];
                const scriptSub = sub.match(/^\s*\.script\("([^"]+)"\)\s*$/);
                if (scriptSub) {
                    scriptPath = scriptSub[1];
                    i++;
                    continue;
                }
                const descSub = sub.match(/^\s*\.description\("([^"]+)"\)\s*$/);
                if (descSub) {
                    description = descSub[1];
                    i++;
                    continue;
                }
                break; // not a sub-line, stop
            }
            if (scriptPath) {
                toolDefs.push({ name, scriptPath });
            }
            // Do not add tool lines to result
        } else {
            resultLines.push(line);
            i++;
        }
    }

    const filteredContent = resultLines.join('\n').replace(/\n{2,}/g, '\n');
    return { toolDefs, filteredContent };
}
