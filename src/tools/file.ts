import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { z } from 'zod';
import { Module } from 'gneol-sdk';
import { resolveFilePath, displaySoulPath, resolveGlobPattern } from './pathUtils';
import { fileMetaManager } from './utils/fileRepo';

// export class ttcFile {
export const FileModule = new Module('File');

FileModule.tool({
  name: 'create',
  description: 'Creates a new file at the specified path with the given content, if file exists, do not call this function.',
  parameters: z.object({
    filePath: z.string().describe('Path to the file to create'),
    content: z.string().describe('Content to write to the file')
  }),
  output: z.string(),
  action: async (input, id: string) => {
    return `Creating - ${displaySoulPath(input.filePath, id)}`;
  },
  auth: async (inputData, id: string) => {
    const fullPath = resolveFilePath(inputData.filePath, id);
    if (await fs.stat(fullPath).catch(() => false)) {
      const tempPath = fullPath + '.preview';
      await fs.writeFile(tempPath, inputData.content, 'utf8');
      return `Requesting permission to recreate file ${inputData.filePath}, \n A preview has been saved to ${tempPath} — review it and approve or deny.`;
    }
    // return false;
  },
  func: async (input: { filePath: string, content: string }, id: string) => {
    const fullPath = resolveFilePath(input.filePath, id);

    // authorize
    await fileMetaManager.authorize(id, fullPath, id);

    // Remove preview temp file if it exists from auth
    await fs.unlink(fullPath + '.preview').catch(() => { });

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, input.content, 'utf8');
    return `File created at ${displaySoulPath(fullPath, id)}`;
  }
});

FileModule.tool({
  name: 'replace',
  description: 'Replaces all occurrences of a string in a file with a new string.',
  action: async (input, id: string) => {
    return `Editing ${displaySoulPath(input.filePath, id)}`;
  },
  parameters: z.object({
    filePath: z.string().describe('Path to the file to modify'),
    oldString: z.string().describe('The string to be replaced'),
    newString: z.string().describe('The string to replace with'),
    useRegex: z.boolean().optional().describe('Whether oldString should be treated as a regular expression')
  }),
  output: z.string(),
  func: async (input: { filePath: string; oldString: string; newString: string; useRegex?: boolean }, id: string) => {
    const fullPath = resolveFilePath(input.filePath, id);

    const authorization = fileMetaManager.isAuthorized(fullPath, id);

    if (!authorization.authorized) {
      return `You are not authorized to edit this file, the owner of the file is ${authorization.owner}, consider collaborating with them rather than modifying their file and if important, ask for access`
    }

    if (!input.oldString || input.oldString === "") {
      throw new Error('oldString is empty, please pass in a value for oldString')
    }

    if (input.oldString.length < 10) {
      input.useRegex = false;
    }
    let content = await fs.readFile(fullPath, 'utf8');
    if (!content.includes(input.oldString) && !input.useRegex) {
      throw new Error(`String '${input.oldString}' not found in file`);
    }
    let pattern: RegExp;
    if (input.useRegex) {
      pattern = new RegExp(input.oldString, 'g');
    } else {
      const escaped = input.oldString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = new RegExp(escaped, 'g');
    }
    content = content.replace(pattern, input.newString);
    await fs.writeFile(fullPath, content, 'utf8');
    return `Replaced in ${displaySoulPath(fullPath, id)}`;
  }
});

FileModule.tool({
  name: 'search',
  description: 'Searches for a string in files matching a glob pattern.',
  action: async (input) => {
    return `Searching for '${input.searchString}'`;
  },
  parameters: z.object({
    globPattern: z.string().describe('Glob pattern to match files, e.g. "src/**/*.ts"'),
    searchString: z.string().describe('String to search for within the matched files')
  }),
  output: z.array(z.object({
    file: z.string(),
    line: z.number(),
    content: z.string()
  })),
  func: async (input: { globPattern: string; searchString: string }, id: string) => {
    const { pattern, cwd } = resolveGlobPattern(input.globPattern, id);
    const files = await glob(pattern, { cwd });
    const results: Array<{ file: string; line: number; content: string }> = [];
    for (const file of files) {
      const absFile = path.resolve(cwd, file);
      const content = await fs.readFile(absFile, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (line.includes(input.searchString)) {
          results.push({
            file: displaySoulPath(absFile, id),
            line: index + 1,
            content: line.trim()
          });
        }
      });
    }
    return results;
  }
})

FileModule.tool({
  name: 'insertAtMarker',
  description: 'Inserts content after a line containing a marker string.',
  action: async (input, id: string) => {
    return `inserting to ${displaySoulPath(input.filePath, id)}`;
  },
  parameters: z.object({
    filePath: z.string().describe('Path to the file to modify'),
    marker: z.string().describe('A unique string that identifies the line after which content will be inserted'),
    contentToInsert: z.string().describe('The content to insert after the marker line')
  }),
  func: async (input: { filePath: string; marker: string; contentToInsert: string }, id: string) => {
    const fullPath = resolveFilePath(input.filePath, id);
    const authorization = fileMetaManager.isAuthorized(fullPath, id);

    if (!authorization.authorized) {
      return `You are not authorized to edit this file, the owner of the file is ${authorization.owner}, consider collaborating with them rather than modifying their file and if important, ask for access`
    }

    if (!input.marker || input.marker === "") {
      throw new Error('marker is empty, please pass in a value for marker')
    }
    let fileContent = await fs.readFile(fullPath, 'utf8');
    const lines = fileContent.split('\n');
    const markerIndex = lines.findIndex(line => line.includes(input.marker));
    if (markerIndex === -1) {
      throw new Error(`Marker '${input.marker}' not found in file`);
    }
    lines.splice(markerIndex + 1, 0, input.contentToInsert);
    const newContent = lines.join('\n');
    await fs.writeFile(fullPath, newContent, 'utf8');
    return `Inserted after marker '${input.marker}' in ${displaySoulPath(fullPath, id)}`;
  }
})

FileModule.tool({
  name: 'stats',
  description: 'Get file statistics: size, line count, modification time, owner, and authorized editors.',
  action: async (input, id: string) => {
    return `scanning ${displaySoulPath(input.filePath, id)}`;
  },
  parameters: z.object({
    filePath: z.string().describe('Path to the file to analyze')
  }),
  output: z.object({
    size: z.number(),
    lineCount: z.number(),
    modified: z.any(),
    created: z.any(),
    isFile: z.boolean(),
    isDirectory: z.boolean(),
    owner: z.string(),
    editors: z.array(z.string())
  }),
  func: async (input: { filePath: string }, id: string) => {
    const fullPath = resolveFilePath(input.filePath, id);
    const stat = await fs.stat(fullPath);
    const content = await fs.readFile(fullPath, 'utf8');
    const lines = content.split('\n');
    const meta = fileMetaManager.getRecord(id, fullPath);
    return {
      size: stat.size,
      lineCount: lines.length,
      modified: stat.mtime,
      created: stat.birthtime,
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      owner: meta.fileRecord.owner,
      editors: meta.fileRecord.editors
    };
  }
})

FileModule.tool({
  name: 'readSlice',
  description: 'Read a slice of a file between startLine and endLine (1‑based, inclusive).',
  action: async (input, id: string) => {
    return `Reading lines ${input.startLine}‑${input.endLine} from ${displaySoulPath(input.filePath, id)}`;
  },
  parameters: z.object({
    filePath: z.string().describe('Path to the file to read'),
    startLine: z.number().describe('Starting line number (1-based)'),
    endLine: z.number().describe('Ending line number (1-based, inclusive)')
  }),
  output: z.object({
    file: z.string(),
    startLine: z.number(),
    endLine: z.number(),
    totalLines: z.number(),
    lines: z.array(z.string())
  }),
  func:
    async (input: {
      filePath: string; startLine: number; endLine: number
    }, id: string) => {
      let { filePath, startLine, endLine } = input;
      const fullPath = resolveFilePath(filePath, id);
      const content = await fs.readFile(fullPath, 'utf8');
      const lines = content.split('\n');
      if (startLine < 1) startLine = 1;
      if (endLine > lines.length) endLine = lines.length;
      if (startLine > endLine) return [];
      const slice = lines.slice(startLine - 1, endLine);
      return {
        file: displaySoulPath(fullPath, id),
        startLine,
        endLine,
        totalLines: lines.length,
        lines: slice
      };
    }
})

FileModule.tool({
  name: 'authorize',
  description: 'Grant edit access to an agent for a file. Only the file owner can authorize others.',
  action: async (input, id: string) => {
    return `Authorizing ${input.agentId} on ${input.filePath}`;
  },
  parameters: z.object({
    filePath: z.string().describe('Path to the file to grant access to'),
    agentId: z.string().describe('The agent ID to grant access to')
  }),
  output: z.string(),
  func: async (input: { filePath: string; agentId: string }, id: string) => {
    const fullPath = resolveFilePath(input.filePath, id);
    const result = fileMetaManager.authorize(input.agentId, fullPath, id);
    if (result) {
      throw new Error(result);
    }
    return `Authorized ${input.agentId} on ${input.filePath}`;
  }
});

FileModule.tool({
  name: 'revokeAuthorization',
  description: 'Revoke edit access from an agent for a file. Only the file owner can revoke.',
  action: async (input, id: string) => {
    return `Revoking authorization for ${input.agentId} on ${input.filePath}`;
  },
  parameters: z.object({
    filePath: z.string().describe('Path to the file to revoke access from'),
    agentId: z.string().describe('The agent ID to revoke access from')
  }),
  output: z.string(),
  func: async (input: { filePath: string; agentId: string }, id: string) => {
    const fullPath = resolveFilePath(input.filePath, id);
    const result = fileMetaManager.revokeAuthorization(input.agentId, fullPath, id);
    if (result) {
      throw new Error(result);
    }
    return `Revoked access for ${input.agentId} on ${input.filePath}`;
  }
});

FileModule.tool({
  name: 'writeLog',
  description: 'Write a log note for a file. Logs are visible to anyone with access to the file.',
  action: async (input, id: string) => {
    return `Logging note on ${input.filePath}`;
  },
  parameters: z.object({
    filePath: z.string().describe('Path to the file to log on'),
    message: z.string().describe('The log message')
  }),
  output: z.string(),
  func: async (input: { filePath: string; message: string }, id: string) => {
    const fullPath = resolveFilePath(input.filePath, id);
    fileMetaManager.writeLog(fullPath, id, input.message);
    return `Log written for ${input.filePath}`;
  }
});

FileModule.tool({
  name: 'readLogs',
  description: 'Read logs for a file, optionally filtered by agent ID. Returns array of log entries.',
  action: async (input, id: string) => {
    return `Reading logs for ${input.filePath}`;
  },
  parameters: z.object({
    filePath: z.string().describe('Path to the file to read logs from'),
    agentId: z.string().optional().describe('Optional agent ID to filter logs by')
  }),
  output: z.array(z.object({
    agentId: z.string(),
    message: z.string(),
    timestamp: z.string()
  })),
  func: async (input: { filePath: string; agentId?: string }, id: string) => {
    const fullPath = resolveFilePath(input.filePath, id);
    const logs = fileMetaManager.readLogsFor(input.agentId || '', fullPath, id);
    return logs;
  }
});


