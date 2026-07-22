// ============================================================================
// Parser: program() header — title, .name(), .traits(), .backstory(), .model(), .context(), .env(), .use()
// ============================================================================

import { GneolProgram } from '../types';

/**
 * Parse the program() title from content.
 * Throws if missing. Does NOT modify content.
 */
export function parseTitle(content: string): { title: string } {
    const titleMatch = content.match(/^program\("([^"]+)"\)/m);
    if (!titleMatch) {
        throw new Error("Missing program title. Expected 'program(\"Title\")'");
    }
    const title = titleMatch[1];
    return { title };
}

/**
 * Remove the program header line from content (after all header-level extractions are done).
 */
export function removeProgramLine(content: string): string {
    return content.replace(/^program\("[^"]+"\)[^\n]*\n?/m, '');
}

/**
 * Extract .name() from the header block — matches any line after program title.
 */
export function parseName(content: string): { name: string | undefined; filteredContent: string } {
    const regex = /^\s*\.name\("([^"]+)"\)/m;
    const match = content.match(regex);
    if (match) {
        return {
            name: match[1],
            // Remove the entire line containing .name()
            filteredContent: content.replace(regex, ''),
        };
    }
    return { name: undefined, filteredContent: content };
}

/**
 * Extract .traits() from the header block — matches any line after program title.
 */
export function parseTraits(content: string): { traits: string | undefined; filteredContent: string } {
    const regex = /^\s*\.traits\("([^"]+)"\)/m;
    const match = content.match(regex);
    if (match) {
        return {
            traits: match[1],
            filteredContent: content.replace(regex, ''),
        };
    }
    return { traits: undefined, filteredContent: content };
}

/**
 * Extract .backstory() from the header block — matches any line after program title.
 */
export function parseBackstory(content: string): { backstory: string | undefined; filteredContent: string } {
    const regex = /^\s*\.backstory\("([^"]+)"\)/m;
    const match = content.match(regex);
    if (match) {
        return {
            backstory: match[1],
            filteredContent: content.replace(regex, ''),
        };
    }
    return { backstory: undefined, filteredContent: content };
}

/**
 * Extract .model() from the program header line.
 * Must be called while program line is still present.
 */
export function parseParentModel(content: string): {
    parentModel: string | undefined;
    filteredContent: string;
} {
    let parentModel: string | undefined;
    let filteredContent = content;
    const regex = /^program\("[^"]+"\)[^\n]*(?:\n(?:\s*\/\/[^\n]*)?)*\n?\s*\.model\("([^"]+)"\)/m;
    const match = filteredContent.match(regex);
    if (match) {
        parentModel = match[1];
        filteredContent = filteredContent.replace(regex, (m) => m.replace(/\n?\s*\.model\("[^"]+"\)/, ''));
    }
    return { parentModel, filteredContent };
}

/**
 * Extract .context() directives from content and return parsed contexts + cleaned content.
 */
export function parseContexts(content: string): {
    contexts: { label: string; type: 'text' | 'resource'; value: string }[];
    filteredContent: string;
} {
    const contexts: { label: string; type: 'text' | 'resource'; value: string }[] = [];
    const pattern = /\.context\("([^"]+)"\)\.(text|resource)\("([^"]+)"\)/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
        contexts.push({ label: match[1], type: match[2] as 'text' | 'resource', value: match[3] });
    }
    const filteredContent = content.replace(pattern, '');
    return { contexts, filteredContent };
}

/**
 * Extract .id() from program header block.
 * .id("agentId") specifies which agent this program belongs to.
 * Matches .id() anywhere after the program title line.
 */
export function parseId(content: string): {
    agentId: string | undefined;
    filteredContent: string;
} {
    let agentId: string | undefined;
    let filteredContent = content;
    // Match .id("value") on any line within the program header block
    const idLineRegex = /^\s*\.id\("([^"]+)"\)/m;
    const match = filteredContent.match(idLineRegex);
    if (match) {
        agentId = match[1];
        // Remove the entire line containing .id()
        filteredContent = filteredContent.replace(idLineRegex, '');
    }
    return { agentId, filteredContent };
}

/**
 * Extract .env() from program declaration line.
 * Supports .env("path") for explicit path or .env() for auto-detect.
 */
export function parseEnvDirective(content: string): {
    envFilePath: string | undefined;
    filteredContent: string;
} {
    let envFilePath: string | undefined;
    let filteredContent = content;

    // Try with explicit path first
    const envFileRegex = /\.env\("([^"]+)"\)/m;
    const envFileMatch = filteredContent.match(envFileRegex);
    if (envFileMatch) {
        envFilePath = envFileMatch[1];
        filteredContent = filteredContent.replace(envFileRegex, '');
    } else {
        // Then try bare .env()
        const bareEnvMatch = filteredContent.match(/\.env\(\)/m);
        if (bareEnvMatch) {
            envFilePath = ''; // empty string signals auto-detect
            filteredContent = filteredContent.replace(bareEnvMatch[0], '');
        }
    }

    return { envFilePath, filteredContent };
}
