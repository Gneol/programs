import fs from 'fs';
import { parseGneolFile } from '../program/parser';
import { GneolProgram } from '../program/types';
import path from 'path';

// SDK types (redefined here to avoid dependency)
interface IDirective {
  type: string;
  data: Record<string, any>;
}

interface IState {
  resourceIds: string[];
  resources: Record<string, IDirective>;
}

function makeId(prefix: string, index: number): string {
  return `${prefix}_${index}`;
}

/**
 * Tokenize a .gneol file into the SDK's IState JSON format.
 * Uses the existing parser to extract structured data, then
 * maps each directive type into the expected shape.
 * Import directives are extracted from raw file content because
 * the parser merges them at parse time.
 */
export function tokenizeFile(filePath: string): IState {
  const program: GneolProgram = parseGneolFile(filePath);
  const rawContent = fs.readFileSync(filePath, 'utf-8');

  const resourceIds: string[] = [];
  const resources: Record<string, IDirective> = {};

  // Helper to push a directive
  function push(id: string, type: string, data: Record<string, any>) {
    resourceIds.push(id);
    resources[id] = { type, data };
  }

  // 1. Program directive
  const programData: Record<string, any> = {
    name: program.title,
  };
  if (program.name) programData.traits = program.name;
  if (program.traits) programData.traits = program.traits;
  if (program.backstory) programData.backstory = program.backstory;
  if (program.agentId) programData.id = program.agentId;
  if (program.parentModel) programData.model = program.parentModel;
  if (program.env) programData.env = program.env;
  if (program.contexts && program.contexts.length > 0) {
    programData.contexts = program.contexts.map(ctx => ({
      label: ctx.label,
      ...(ctx.type === 'text' ? { text: ctx.value } : { resource: ctx.value }),
    }));
  }
  push('__program__', 'program', programData);

  // 2. Model directives
  if (program.modelBindings) {
    program.modelBindings.forEach((mb, i) => {
      const id = makeId('model', i);
      push(id, 'model', {
        name: mb.tag,
        provider: mb.provider,
        modelId: mb.modelId,
        apiKey: mb.apiKey,
        temperature: mb.temperature,
        maxTokens: mb.maxTokens,
        rateLimit: mb.rateLimit,
      });
    });
  }

  // 3. Subagent directives
  if (program.subagentDeclarations) {
    program.subagentDeclarations.forEach((sd, i) => {
      const id = makeId('subagent', i);
      push(id, 'subagent', {
        name: sd.name,
        model: sd.model,
        id: sd.id,
        description: sd.description,
      });
    });
  }

  // 4. Summarization directive (if present)
  if (program.summarizationModel || program.summarizationPrompt) {
    push('__summarization__', 'summarization', {
      model: program.summarizationModel,
      prompt: program.summarizationPrompt,
    });
  }

  // 5. MCP directives
  if (program.mcpConfigs) {
    Object.entries(program.mcpConfigs).forEach(([name, config], i) => {
      const id = makeId('mcp', i);
      push(id, 'mcp', { name, config });
    });
  }

  // 6. Tool directives
  if (program.toolDefs) {
    program.toolDefs.forEach((td, i) => {
      const id = makeId('tool', i);
      push(id, 'tool', {
        name: td.name,
        script: td.scriptPath,
      });
    });
  }

  // 7. Actions (at and on directives, preserving order)
  if (program.actions) {
    program.actions.forEach((a, i) => {
      if (a.type === 'time') {
        const id = makeId('at', i);
        const data: Record<string, any> = {
          timeExpr: a.marker,
        };
        if (a.instructions && a.instructions.length > 0) data.do = a.instructions;
        if (a.condition) data.if = a.condition;
        if (a.ifExec) {
          data.ifExec = `${a.ifExec.script} ${a.ifExec.operator} ${a.ifExec.expected}`;
        }
        if (a.resources && a.resources.length > 0) data.resource = a.resources[0];
        if (a.maxTrigger !== undefined) data.max = a.maxTrigger;
        if (a.subagent) data.subagent = a.subagent;
        if (a.modify) data.modify = true;
        push(id, 'at', data);
      } else if (a.type === 'event') {
        const id = makeId('on', i);
        const data: Record<string, any> = {
          eventName: a.marker,
        };
        if (a.instructions && a.instructions.length > 0) data.do = a.instructions;
        if (a.condition) data.if = a.condition;
        if (a.resources && a.resources.length > 0) data.resource = a.resources[0];
        if (a.eventOptions) {
          if (a.eventOptions.maxBucketSize !== undefined) data.maxSize = a.eventOptions.maxBucketSize;
          if (a.eventOptions.delay !== undefined) data.delay = a.eventOptions.delay;
        }
        if (a.maxTrigger !== undefined) data.max = a.maxTrigger;
        if (a.subagent) data.subagent = a.subagent;
        if (a.modify) data.modify = true;
        push(id, 'on', data);
      }
    });
  }

  // 8. Webhook directives
  if (program.webhooks) {
    program.webhooks.forEach((url, i) => {
      const id = makeId('webhook', i);
      push(id, 'webhook', { url });
    });
  }

  // 9. Import directives (extracted from raw content)
  const importRegex = /^(?:\s*)import\(['"]([^'"]+)['"]\)\s*(?:\/\/.*)?$/gm;
  let match;
  let importIndex = 0;
  while ((match = importRegex.exec(rawContent)) !== null) {
    const id = makeId('import', importIndex++);
    push(id, 'import', { path: match[1] });
  }

  return { resourceIds, resources };
}

/**
 * Convert an IState object back into .gneol source code.
 */
export function stateToGneol(state: IState): string {
  const lines: string[] = [];

  for (const id of state.resourceIds) {
    const directive = state.resources[id];
    const { type, data } = directive;

    switch (type) {
      case 'import': {
        lines.push(`import("${data.path}")`);
        break;
      }
      case 'program': {
        let line = `program("${(data.name || '').replace(/"/g, '\\"')}")`;
        if (data.id) line += `\n    .id("${data.id}")`;
        if (data.traits) line += `\n    .traits("${data.traits}")`;
        if (data.backstory) line += `\n    .backstory("${data.backstory}")`;
        if (data.model) line += `\n    .model("${data.model}")`;
        if (data.env) line += `\n    .env("${data.env}")`;
        if (data.contexts) {
          for (const c of data.contexts) {
            if (c.text) {
              line += `\n    .context("${c.label}").text("${c.text.replace(/"/g, '\\"')}")`;
            } else if (c.resource) {
              line += `\n    .context("${c.label}").resource("${c.resource}")`;
            }
          }
        }
        lines.push(line, '');
        break;
      }
      case 'model': {
        let line = `model("${(data.name || '').replace(/"/g, '\\"')}")`;
        if (data.provider) line += `\n    .provider("${data.provider}")`;
        if (data.modelId) line += `\n    .modelId("${data.modelId}")`;
        if (data.apiKey) line += `\n    .apiKey("${data.apiKey}")`;
        if (data.temperature !== undefined) line += `\n    .temperature(${data.temperature})`;
        if (data.maxTokens !== undefined) line += `\n    .maxTokens(${data.maxTokens})`;
        if (data.rateLimit !== undefined) line += `\n    .rateLimit(${data.rateLimit})`;
        lines.push(line, '');
        break;
      }
      case 'subagent': {
        let line = `subagent("${(data.name || '').replace(/"/g, '\\"')}")`;
        if (data.model) line += `\n    .model("${data.model}")`;
        if (data.id) line += `\n    .id("${data.id}")`;
        if (data.description) line += `\n    .description("${data.description.replace(/"/g, '\\"')}")`;
        lines.push(line, '');
        break;
      }
      case 'summarization': {
        let line = `summarization()`;
        if (data.model) line += `.model("${data.model}")`;
        if (data.prompt) line += `.prompt("${data.prompt.replace(/"/g, '\\"')}")`;
        lines.push(line, '');
        break;
      }
      case 'mcp': {
        lines.push(`mcp("${(data.name || '').replace(/"/g, '\\"')}").config("${(data.config || '').replace(/"/g, '\\"')}")`, '');
        break;
      }
      case 'tool': {
        let line = `tool("${(data.name || '').replace(/"/g, '\\"')}")`;
        if (data.script) line += `\n    .script("${data.script}")`;
        if (data.description) line += `\n    .description("${data.description.replace(/"/g, '\\"')}")`;
        lines.push(line, '');
        break;
      }
      case 'at': {
        let line = `at("${data.timeExpr || ''}")`;
        if (data.do && Array.isArray(data.do)) {
          line += data.do.map(d => `\n    .do("${d.replace(/"/g, '\\"')}")`).join('');
        } else if (data.do) {
          line += `\n    .do("${String(data.do).replace(/"/g, '\\"')}")`;
        }
        if (data.if) line += `\n    .if("${data.if.replace(/"/g, '\\"')}")`;
        if (data.ifExec) {
          const parts = data.ifExec.split(' ');
          if (parts.length >= 3) {
            line += `\n    .ifExec("${parts[0]}", "${parts[1]}", "${parts.slice(2).join(' ')}")`;
          } else if (parts.length === 2) {
            line += `\n    .ifExec("${parts[0]}", "${parts[1]}")`;
          } else {
            line += `\n    .ifExec("${parts[0]}")`;
          }
        }
        if (data.resource) line += `\n    .resource("${data.resource}")`;
        if (data.max !== undefined) line += `\n    .max(${data.max})`;
        if (data.maxSize !== undefined) line += `\n    .maxSize(${data.maxSize})`;
        if (data.delay !== undefined) line += `\n    .delay(${data.delay})`;
        if (data.subagent) line += `\n    .subagent("${data.subagent}")`;
        if (data.modify) line += `\n    .modify()`;
        lines.push(line, '');
        break;
      }
      case 'on': {
        let line = `on("${data.eventName || ''}")`;
        if (data.do && Array.isArray(data.do)) {
          line += data.do.map(d => `\n    .do("${d.replace(/"/g, '\\"')}")`).join('');
        } else if (data.do) {
          line += `\n    .do("${String(data.do).replace(/"/g, '\\"')}")`;
        }
        if (data.if) line += `\n    .if("${data.if.replace(/"/g, '\\"')}")`;
        if (data.resource) line += `\n    .resource("${data.resource}")`;
        if (data.maxSize !== undefined) line += `\n    .maxSize(${data.maxSize})`;
        if (data.delay !== undefined) line += `\n    .delay(${data.delay})`;
        if (data.max !== undefined) line += `\n    .max(${data.max})`;
        if (data.subagent) line += `\n    .subagent("${data.subagent}")`;
        if (data.modify) line += `\n    .modify()`;
        lines.push(line, '');
        break;
      }
      case 'webhook': {
        lines.push(`webhook("${(data.url || '').replace(/"/g, '\\"')}")`, '');
        break;
      }
    }
  }

  return lines.join('\n');
}


export const convert = async (scriptPath: string, targetFormat: string, outputPath: string) => {
  const resolvedPath = path.resolve(scriptPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${scriptPath}`);
  }

  const ext = path.extname(resolvedPath).toLowerCase();

  // Source is .gneol → target is json or yaml
  if (ext === '.gneol') {
    const state = tokenizeFile(resolvedPath);
    const out = outputPath || resolvedPath.replace(/\.gneol$/i, '.' + targetFormat);
    const content = targetFormat === 'yaml'
      ? require('js-yaml').dump(state, { indent: 2, lineWidth: 120, noRefs: true })
      : JSON.stringify(state, null, 2);
    fs.writeFileSync(out, content, 'utf-8');
    return `Converted ${scriptPath} → ${out}`;
  }

  // Source is json or yaml → target is gneol
  if (['.json', '.yaml', '.yml'].includes(ext)) {
    const raw = fs.readFileSync(resolvedPath, 'utf-8');
    const state = ext === '.json'
      ? JSON.parse(raw)
      : require('js-yaml').load(raw);
    const source = stateToGneol(state);
    const out = outputPath || resolvedPath.replace(/\.(json|yaml|yml)$/i, '.gneol');
    fs.writeFileSync(out, source, 'utf-8');
    return `Converted ${scriptPath} → ${out}`;
  }

  throw new Error(`Unsupported source format: ${ext}. Use .gneol, .json, .yaml, or .yml`);
}