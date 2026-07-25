// ============================================================================
// Parser: at() and on() triggers — schedules and events
// ============================================================================

import { Action, IfExecType } from "../types.js";
import { parseTimeExpression } from "./utils.js";



/**
 * Parse all actions from cleaned content (after removing header, models, sentinels, summarization, env).
 * Actions are lines starting with at() or on() followed by chained sub-functions.
 */
export function parseActions(content: string, path: string): Action[] {
    const actions: Action[] = [];

    // Remove comments
    const clean = content.replace(/\/\/.*$/gm, '');
    // Tokenize: split into lines, trim, remove blanks
    const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        // Find a line that starts with at() or on()
        let marker = '';
        let type: 'event' | 'time' = 'time';
        const atMatch = line.match(/^at\("([^"]+)"\)(.*)$/);
        const onMatch = line.match(/^on\("([^"]+)"\)(.*)$/);

        if (atMatch) {
            marker = atMatch[1];
            type = 'time';
        } else if (onMatch) {
            marker = onMatch[1];
            type = 'event';
        } else {
            i++;
            continue;
        }

        // Track original line number for error reporting (1‑based)
        const actionStartLine = i + 1;

        // Collect the remainder of this line plus subsequent chained lines
        let remainder = (atMatch ? atMatch[2] : onMatch![2]) || '';

        // Peek at subsequent lines and accumulate chained methods
        i++;
        while (i < lines.length) {
            const next = lines[i];
            // Stop if we hit a new statement start: program(), at(), on(), mcp(), tool()
            if (/^(program|at|on|mcp|tool)\(/.test(next)) break;
            // Append this line
            remainder += ' ' + next.replace(/;$/, '');
            // If line ends with semicolon, consume it and stop
            if (next.endsWith(';')) break;
            i++;
        }

        // Compute snapShot for time-based, for events set to 0
        const snapShot = type === 'time' ? parseTimeExpression(marker) : 0;

        // Extract all .do("...") instructions
        const doMatches = remainder.match(/\.do\("((?:[^"\\]|\\.)*)"\)/g);
        const instructions: string[] = [];
        if (doMatches) {
            for (const d of doMatches) {
                const inner = d.match(/\.do\("((?:[^"\\]|\\.)*)"\)/);
                if (inner) instructions.push(inner[1]);
            }
        }

        // Extract all .if("...") and combine with " and "
        const ifMatches = remainder.match(/\.if\("((?:[^"\\]|\\.)*)"\)/g);
        const conditions: string[] = [];
        if (ifMatches) {
            for (const d of ifMatches) {
                const inner = d.match(/\.if\("((?:[^"\\]|\\.)*)"\)/);
                if (inner) conditions.push(inner[1]);
            }
        }
        const condition = conditions.length > 0 ? conditions.join(' and ') : undefined;

        // Extract .ifExec("script", "operator", "expected")
        const bareIfExec = remainder.match(/\.ifExec(?!\s*\()/);
        if (bareIfExec) {
            throw new Error(`Line ${actionStartLine}: Malformed .ifExec - expected .ifExec("script", "operator", "expected")`);
        }
        const ifExecMatches = remainder.match(/\.ifExec\("((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"(?:\s*,\s*"((?:[^"\\]|\\.)*)")?\)/);
        let ifExec: IfExecType | undefined;
        if (ifExecMatches) {
            if (ifExecMatches[3] !== undefined) {
                ifExec = {
                    script: ifExecMatches[1],
                    operator: ifExecMatches[2].toLowerCase() as 'eq' | 'lt' | 'gt' | 'contains',
                    expected: ifExecMatches[3],
                };
            } else {
                ifExec = {
                    script: ifExecMatches[1],
                    operator: 'eq',
                    expected: ifExecMatches[2],
                };
            }
        }

        // Extract .subagent("...") [or .subagent(...) for backward compat]
        const subagentMatch = remainder.match(/\.subagent\("((?:[^"\\]|\\.)*)"\)/) || remainder.match(/\.sentinel\("((?:[^"\\]|\\.)*)"\)/);
        const subagent = subagentMatch ? subagentMatch[1] : undefined;

        // Extract all .resource("...")
        const resourceMatches = remainder.match(/\.resource\("((?:[^"\\]|\\.)*)"\)/g);
        const resources: string[] = [];
        if (resourceMatches) {
            for (const r of resourceMatches) {
                const inner = r.match(/\.resource\("((?:[^"\\]|\\.)*)"\)/);
                if (inner) resources.push(inner[1]);
            }
        }

        // Extract .max(N)
        const maxMatch = remainder.match(/\.max\((\d+)\)/);
        const maxTrigger = maxMatch ? parseInt(maxMatch[1], 10) : Infinity;

        // Extract .maxSize(N) for event buckets
        const maxSizeMatch = remainder.match(/\.maxSize\((\d+)\)/);
        const maxBucketSize = maxSizeMatch ? parseInt(maxSizeMatch[1], 10) : 10;

        // Extract .delay(N) for event buckets (seconds)
        const delayMatch = remainder.match(/\.delay\((\d+)\)/);
        const delay = delayMatch ? parseInt(delayMatch[1], 10) : 5;

        // Build eventOptions
        const eventOptions = { maxBucketSize, delay };

        // Check for .modify()
        const modify = remainder.includes('.modify()');

        // Detect unknown directives
        const strippedForDirectives = remainder.replace(/".*?"/g, '').replace(/'[^']*'/g, '');
        const knownDirectives = new Set(['.do', '.resource', '.max', '.maxSize', '.delay', '.modify', '.if', '.ifExec', '.text', '.sentinel', '.subagent', '.model', '.provider', '.modelId', '.apiKey']);
        const unknownDirs: string[] = [];
        const dirMatch = strippedForDirectives.match(/\.(\w+)\(/g);
        if (dirMatch) {
            for (const d of dirMatch) {
                const name = d.replace('(', '');
                if (!knownDirectives.has(name)) {
                    unknownDirs.push(name);
                }
            }
        }
        if (unknownDirs.length > 0) {
            throw new Error(`Line ${actionStartLine}: Unknown directive(s): ${unknownDirs.join(', ')}`);
        }

        actions.push({
            program: path,
            marker,
            snapShot,
            type,
            instructions,
            resources,
            condition,
            ifExec,
            subagent,
            maxTrigger,
            initialMaxTrigger: maxTrigger,
            modify,
            eventOptions,
        });
    }

    return actions;
}
