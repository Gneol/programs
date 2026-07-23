import fs from 'fs';
import path from 'path';
import { fetchAgents, getAgent } from './soul';
import { deploy } from './resource';

export interface SessionInfo {
  soulId: string;
  programPath: string;
}

function scaffoldIndexGneol(): string {
  const folderName = path.basename(process.cwd()).replace(/[^a-zA-Z0-9_-]/g, '_');
  const content = `program("${folderName}")
  .model("eagle-eye")
  .env(".env")
  .context("Readme").resource("README.md")

model("eagle-eye")
  .provider("openrouter")
  .modelId("openai/gpt-4o")
  .apiKey("OPENROUTER_API_KEY")
  .temperature(0.2)
  .maxTokens(4000)

sentinel().model("eagle-eye")

summarization().model("eagle-eye").prompt("Summarize in 3 bullets")
`;
  const filePath = path.join(process.cwd(), 'index.gneol');
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`Created ${filePath}`);
  return filePath;
}

function listGneolFiles(): string[] {
  const cwd = process.cwd();
  const files = fs.readdirSync(cwd).filter(f => f.endsWith('.gneol'));
  return files.map(f => path.join(cwd, f));
}

export async function findOrPromptIndexGneol(): Promise<{
  filePath: string;
  newlyCreated: boolean;
  soulId?: string;
  programPath?: string;
}> {
  const indexFile = path.join(process.cwd(), 'index.gneol');

  // 1. Check if index.gneol already exists
  if (fs.existsSync(indexFile)) {
    return { filePath: indexFile, newlyCreated: false };
  }

  // 2. Not found — prompt user
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

export async function initializeSession(): Promise<SessionInfo> {
  const { filePath, newlyCreated, soulId, programPath } = await findOrPromptIndexGneol();

  // If we already have soulId and programPath (existing agent selected), return directly
  if (soulId && programPath) {
    console.log(`Using existing agent: ${soulId}`);
    return { soulId, programPath };
  }

  // Otherwise deploy the selected/newly created file
  console.log(`Deploying ${filePath}…`);
  return await deploy(filePath);
}
