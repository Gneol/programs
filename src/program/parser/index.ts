// ============================================================================
// Parser Index — orchestrates all directive parsers into parseGneol & parseGneolFile
// ============================================================================

import fs from 'fs';
import path from 'path';
import { GneolProgram } from '../types';
import { parseTitle, parseName, parseTraits, parseBackstory, parseContexts, parseEnvDirective, parseParentModel, parseId, removeProgramLine } from './program';
import { parseSubagents, parseSentinels } from './subagent';
import { parseSummarization } from './summarization';
import { parseMcp } from './mcp';
import { parseTools } from './tool';
import { parseModelBindings } from './modelBinding';
import { parseActions } from './action';
import { parseTimeExpression, parseEnvFile } from './utils';
import { mergeImports } from './importer';
import { parseWebhooks } from './webhook';

export { parseTimeExpression, parseEnvFile, mergeImports };

/**
 * Parse .gneol content into a GneolProgram data structure.
 */
export function parseGneol(content: string, path: string = ''): GneolProgram {

    console.log(path)
    // 0. Parse model() bindings FIRST so header parsers don't steal .name() from model blocks
    const { modelBindings, filteredContent: afterModels } = parseModelBindings(content);
    // console.log(modelBindings, afterModels)

    // 1. Parse program title (does not modify content)
    const { title } = parseTitle(afterModels);

    // 1.5 Parse agent identity: .name(), .traits(), .backstory()
    const { name, filteredContent: afterName } = parseName(afterModels);
    const { traits, filteredContent: afterTraits } = parseTraits(afterName);
    const { backstory, filteredContent: afterIdentity } = parseBackstory(afterTraits);

    // 2. Parse parent model (extracts .model() from the program line)
    const { parentModel, filteredContent: afterParentModel } = parseParentModel(afterIdentity);

    // 3. Parse .env() directive
    const { envFilePath, filteredContent: afterEnv } = parseEnvDirective(afterParentModel);

    // 3.5 Parse .id() directive (which agent this program targets)
    const { agentId, filteredContent: afterId } = parseId(afterEnv);

    // 4. Parse program-level .context() directives
    const { contexts, filteredContent: afterContexts } = parseContexts(afterId);

    // 5. Remove the program header line entirely
    const afterProgramLine = removeProgramLine(afterContexts);

    // 6. Parse subagent() declarations with model, id, description
    const { subagentDeclarations, wildcardModel, filteredContent: afterSentinel } = parseSubagents(afterProgramLine);

    // 7. Parse summarization() config
    const { summarizationModel, summarizationPrompt, filteredContent: afterSummarization } = parseSummarization(afterSentinel);

    // 8. Parse mcp() declarations
    const { mcpConfigs, filteredContent: afterMcp } = parseMcp(afterSummarization);

    // 8.5 Parse tool() declarations
    const { toolDefs, filteredContent: afterTools } = parseTools(afterMcp);

    // 8.6 Parse webhook() declarations
    const { webhooks, filteredContent: afterWebhooks } = parseWebhooks(afterTools);

    // 9. (modelBindings already parsed in step 0 — skip)

    // 10. Parse at() and on() actions
    const actions = parseActions(afterWebhooks, path);

    return {
        title,
        name,
        traits,
        backstory,
        path,
        actions,
        contexts,
        parentModel,
        summarizationModel,
        summarizationPrompt,
        agentId,
        subagentDeclarations: subagentDeclarations,
        wildcardModel,
        modelBindings,
        mcpConfigs,
        toolDefs,
        webhooks,
        env: envFilePath,
    };
}

/**
 * Convenience: load a .gneol file, resolve imports, and parse it.
 */
export function parseGneolFile(filePath: string): GneolProgram {
    const mergedContent = mergeImports(filePath);
    // console.log(filePath)
    return parseGneol(mergedContent, filePath);
}


