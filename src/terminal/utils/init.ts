import fs from 'fs';
import path from 'path';
import { invokeCli } from './cliInvoke';

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

  // Fetch agents from the CLI
  const agentsResult = await invokeCli('gneol-cli agent list --page 1 --limit 100');
  let agents: any[] = [];
  if (agentsResult.code === 0) {
    try {
      agents = JSON.parse(agentsResult.stdout);
    } catch {}
  }
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
      const agentOptions = agents.map((a: any) => ({
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

      // Fetch agent details via CLI
      const fetchResult = await invokeCli(`gneol-cli agent list --id ${selectedId}`);
      let agent: any = null;
      if (fetchResult.code === 0) {
        try {
          agent = JSON.parse(fetchResult.stdout);
        } catch {}
      }
      if (!agent) throw new Error(`Agent ${selectedId} not found via CLI`);

      // Prompt for the gneol program file to associate with this agent
      const { text } = await import('@clack/prompts');
      const programFile = await text({
        message: 'Enter path to the agent\'s .gneol program file (or press Enter to skip):',
        placeholder: 'index.gneol',
      });
      const resolvedPath = programFile && typeof programFile === 'string' && programFile.trim()
        ? (path.isAbsolute(programFile.trim()) ? programFile.trim() : path.join(process.cwd(), programFile.trim()))
        : '';

      return {
        filePath: resolvedPath || 'index.gneol',
        newlyCreated: false,
        soulId: agent.id,
        programPath: resolvedPath,
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

  // If we already have an agent selected, return it directly
  if (soulId && programPath) {
    console.log(`Using existing agent: ${soulId}`);
    return { soulId, programPath };
  }

  // Otherwise deploy via gneol-cli
  console.log(`Deploying ${filePath}…`, `gneol-cli deploy -f "${filePath}"`);
  const result = await invokeCli(`gneol-cli deploy -f "${filePath}"`);
  // console.log(result);
  if (result.code !== 0) {
    throw new Error(`Deploy failed: ${result.stderr}`);
  }

  // Try to parse JSON output from deploy (if CLI prints it)
  let data: any;
  try {
    data = JSON.parse(result.stdout);
    console.log(data);
  } catch {
    // Otherwise get newest agent from list
    const list = await invokeCli('gneol-cli agent list --page 1 --limit 10');
    if (list.code === 0) {
      const agents: any[] = JSON.parse(list.stdout);
      if (agents.length > 0) data = agents[agents.length - 1];
    }
  }

  return {
    soulId: data?.soulId || '',
    programPath: data?.programPath || filePath,
  };
}
