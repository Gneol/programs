import fs from 'fs';
import path from 'path';
import { AgentRecord, fetchAgents, getAgent, resolveAgentId } from './soul';
import { deploy } from './resource';
import { confirm } from '@clack/prompts';
import { api } from './api';

import { defaultGneolMdContent } from './defaultGneolMd';

export interface SessionInfo {
  soulId: string;
  programPath: string;
  name: string
}

function scaffoldIndexGneol(): string {
  const folderName = path.basename(process.cwd()).replace(/[^a-zA-Z0-9_-]/g, '_');
  const content = `program("${folderName}")
  .model("primary")
  .env(".env")
  .context("USER INSTRUCTIONS").resource("GNEOL.md")

model("primary")
  .provider("deepseek")
  .modelId("deepseek-v4-flash")
  .apiKey("OPENROUTER_API_KEY")
  .temperature(0.7)
  .maxTokens(60000)

subagent().model("primary")

summarization().model("primary").prompt("Summarize in 3 bullets")

on("Idle")
  .if("if the last message of the ai expresses an intention to continue but makes no function call")
  .do("if you are done, call keepQuiet or continue with your work")
`;
  const filePath = path.join(process.cwd(), 'index.gneol');
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`Created ${filePath}`);

  // Also write GNEOL.md with default user instructions
  const gneolMdPath = path.join(process.cwd(), 'GNEOL.md');
  if (!fs.existsSync(gneolMdPath)) {
    fs.writeFileSync(gneolMdPath, defaultGneolMdContent, 'utf-8');
    console.log(`Created ${gneolMdPath}`);
  }

  return filePath;
}

function listGneolFiles(): string[] {
  const cwd = process.cwd();
  const files = fs.readdirSync(cwd).filter(f => f.endsWith('.gneol'));
  return files.map(f => path.join(cwd, f));
}


function findIndexGneolUpwards(startDir: string, maxSteps: number): { path: string; steps: number } | null {
  let current = startDir;
  for (let i = 1; i <= maxSteps; i++) {
    const parent = path.dirname(current);
    if (parent === current) break; // reached root
    current = parent;
    const candidate = path.join(current, 'index.gneol');
    if (fs.existsSync(candidate)) {
      return { path: candidate, steps: i };
    }
  }
  return null;
}

function findIndexGneolAuto(startDir: string): { path: string; steps: number } | null {
  return findIndexGneolUpwards(startDir, 5);
}

function findIndexGneolDeep(startDir: string): { path: string; steps: number } | null {
  return findIndexGneolUpwards(startDir, 10);
}

export async function findOrPromptIndexGneol(): Promise<{
  filePath: string;
  newlyCreated: boolean;
  soulId?: string;
  programPath?: string;
}> {
  const indexFile = path.join(process.cwd(), 'index.gneol');

  // 1. Check if index.gneol already exists in cwd
  if (fs.existsSync(indexFile)) {
    return { filePath: indexFile, newlyCreated: false };
  }

  // 2. Search upward directories — auto-use if found within 5 levels
  const autoFound = findIndexGneolAuto(process.cwd());
  if (autoFound) {
    return { filePath: autoFound.path, newlyCreated: false };
  }

  // 3. Search deeper (up to 10 levels) — prompt if found
  const deepFound = findIndexGneolDeep(process.cwd());
  if (deepFound) {
    const relativePath = path.relative(process.cwd(), deepFound.path);
    const shouldUse = await confirm({
      message: `index.gneol detected ${deepFound.steps} levels up in ${relativePath}. Use this file?`,
      initialValue: true,
    });
    if (shouldUse) {
      process.chdir(path.dirname(deepFound.path));
      console.log(`Switched to ${process.cwd()}`);
      return { filePath: deepFound.path, newlyCreated: false };
    }
    // else fall through to creation prompt
  }

  // 4. Not found — prompt user
  const { select } = await import('@clack/prompts');

  const options: { label: string; value: string }[] = [
    { label: 'Create a new index.gneol', value: 'create' },
  ];

  // Check for existing agents
  const agents = fetchAgents();
  if (agents.length > 0) {
    options.push({ label: 'Select an existing agent', value: 'select-agent' });
  }

  // Check for .gneol files in cwd
  const gneolFiles = listGneolFiles();
  if (gneolFiles.length > 0) {
    options.push({ label: 'Select a .gneol file from this folder', value: 'select-file' });
  }

  options.push({ label: 'Cancel', value: '__cancel' });

  const choice = await select({
    message: 'No index.gneol found. How would you like to proceed?',
    options,
  });

  if (choice === '__cancel' || typeof choice !== 'string') {
    throw new Error('Initialization cancelled.');
  }

  switch (choice) {
    case 'create': {
      const filePath = scaffoldIndexGneol();
      return { filePath, newlyCreated: true };
    }

    case 'select-agent': {
      // Present agent list with names and IDs
      const agentOptions = agents.map(a => ({
        label: `${a.name} (${a.id.slice(0, 8)}…)`,
        value: a.id,
      }));
      agentOptions.push({ label: 'Cancel', value: '__cancel' });

      const selectedId = await select({
        message: 'Select an existing agent:',
        options: agentOptions,
      });

      if (selectedId === '__cancel' || typeof selectedId !== 'string') {
        throw new Error('Initialization cancelled.');
      }

      const agent = getAgent(selectedId);
      if (!agent) throw new Error(`Agent ${selectedId} not found`);

      // Check workspace mismatch before proceeding
      if (agent.workSpace && path.resolve(agent.workSpace) !== path.resolve(process.cwd())) {
        const shouldSwitch = await confirm({
          message: `Agent workspace "${agent.workSpace}" differs from current directory "${process.cwd()}". Switch to agent's workspace?`,
          initialValue: true,
        });
        if (shouldSwitch) {
          process.chdir(agent.workSpace);
          console.log(`Switched workspace to ${agent.workSpace}`);
        }
      }

      return {
        filePath: agent.programPath,
        newlyCreated: false,
        soulId: agent.id,
        programPath: agent.programPath,
      };
    }

    case 'select-file': {
      const fileOptions = gneolFiles.map(f => ({
        label: path.basename(f),
        value: f,
      }));
      fileOptions.push({ label: 'Cancel', value: '__cancel' });

      const selectedFile = await select({
        message: 'Select a .gneol file to deploy:',
        options: fileOptions,
      });

      if (selectedFile === '__cancel' || typeof selectedFile !== 'string') {
        throw new Error('Initialization cancelled.');
      }

      return { filePath: selectedFile, newlyCreated: true };
    }

    default:
      throw new Error('Invalid selection');
  }
}

async function checkWorkspace(agent: AgentRecord): Promise<void> {
  const cwd = process.cwd();
  if (agent.workSpace && path.resolve(agent.workSpace) !== path.resolve(cwd)) {
    const shouldSwitch = await confirm({
      message: `Agent workspace "${agent.workSpace}" differs from current directory "${cwd}". Switch to current workspace?`,
      initialValue: true,
    });
    if (shouldSwitch) {
      await api.GneolServer.setWorkspace(agent.id, path.resolve(cwd))
      console.log(`Switched workspace to ${agent.workSpace}`);
    }
  }
}

export async function initializeSession(opts?: { id?: string; agent?: boolean }): Promise<SessionInfo> {
  // If id is provided, use it directly (takes priority over -a)
  if (opts?.id) {
    const agent = getAgent(opts.id);
    if (!agent) throw new Error(`Agent ${opts.id} not found`);
    await checkWorkspace(agent);
    console.log(`Using existing agent: ${agent.id}`);
    return { soulId: agent.id, programPath: agent.programPath, name: agent.name };
  }

  // If -a flag is set, prompt user to select an agent
  if (opts?.agent) {
    const agentId = await resolveAgentId();
    const agent = getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    await checkWorkspace(agent);
    console.log(`Using existing agent: ${agent.id}`);
    return { soulId: agent.id, programPath: agent.programPath, name: agent.name };
  }

  const { filePath, newlyCreated, soulId, programPath } = await findOrPromptIndexGneol();

  // If we already have soulId and programPath (existing agent selected), return directly
  if (soulId && programPath) {
    console.log(`Using existing agent: ${soulId}`);
    return { soulId, programPath, name: '' };
  }

  // Otherwise deploy the selected/newly created file
  console.log(`Deploying ${filePath}…`);
  return await deploy(filePath);
}
