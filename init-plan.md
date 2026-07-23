# gneol-cli Initialization Flow — Implementation Plan

## Goal
When `gneol-cli` is invoked (with no arguments or `start`/`init` subcommand), it should:
1. Look for `index.gneol` in the current working directory.
2. If found → deploy it, extract `soulId` and `programPath`, then launch the terminal app with those values.
3. If not found → present a menu with three options:
   - **Create new** — scaffold a minimal `index.gneol`, deploy, get IDs, launch terminal.
   - **Select existing agent** — list all souls from `GlobalSoulStore`, user picks one → get `soulId` and `programPath` → launch terminal.
   - **Select .gneol file** — scan `cwd` for `*.gneol` files, user picks one → deploy → launch terminal.

## Key Components

### 1. Utility: `src/cli-utils/init.ts`
- `findOrPromptIndexGneol(): Promise<{ filePath: string, newlyCreated: boolean }>`
  - Look for `index.gneol` in cwd.
  - If not found, use `@clack/prompts` to present options.
- `scaffoldIndexGneol(): string`
  - Generate a basic `index.gneol` with a default program header and title based on folder name.
  - Write to `./index.gneol`.
  - Return the file path.
- `listGneolFiles(): string[]`
  - Glob for `*.gneol` in cwd, excluding `node_modules`.
- `selectGneolFile(): Promise<string>`
  - If multiple files exist, prompt user to pick one.
- `initializeSession(filePath: string): Promise<{ soulId: string, programPath: string }>`
  - Call `deploy(filePath)` from `resource.ts` (which should return `{ soulId, programPath }`).
  - Note: The current `deploy()` function only logs and doesn't return data. We need to modify it to return the result.

### 2. Modify existing files
- **`src/cli-utils/resource.ts`** — `deploy()` should return `{ soulId: string, programPath: string }` instead of void.
- **`src/cli-utils/soul.ts`** — Already updated; add `programPath` to `AgentRecord` interface and to the fetch mapping.
- **`src/cli-utils/terminal.ts`** (new) — Launch the terminal app with given `soulId` and `programPath`. (Implementation details depend on the terminal app interface; for now placeholder.)

### 3. Entry point adjustment (`src/index.ts`)
- Add a `start` or `init` command (or default behavior if no subcommand).
- If no command given, run `initializeSession()` and then pass to terminal.

## Detailed Steps

### Step 1: Update `soul.ts` AgentRecord
- Extend `AgentRecord` to include `programPath: string`.
- `fetchAgents()` should map `s => ({ id: s.id, name: s.name, programPath: s.programPath })`.

### Step 2: Create `src/cli-utils/init.ts`
- Implement `findOrPromptIndexGneol()`:
  ```
  if (fs.existsSync('index.gneol')) return { filePath: 'index.gneol', newlyCreated: false };
  const option = await select({ message: 'No index.gneol found. What do you want to do?', options: [...] });
  switch (option) {
    case 'create': return { filePath: scaffoldIndexGneol(), newlyCreated: true };
    case 'select-agent': ...  // use resolveAgentId, then get programPath from store
    case 'select-file': ...   // list .gneol files, user picks, deploy, return
  }
  ```
- Note: For selecting an existing agent, we don't need to deploy again — `soul.programPath` is already stored. So `initializeSession` can skip deployment for existing agents.

### Step 3: Modify `src/cli-utils/resource.ts` deploy()
```typescript
export async function deploy(filePath: string): Promise<{ soulId: string; programPath: string }> {
  // ... existing code ...
  if (res.status === 'error') throw new Error(res.data);
  const result = res.data;
  console.log(`Deployed: ${result.title}`);
  console.log(`Memory ID: ${result.soulId}`);
  return { soulId: result.soulId, programPath: resolvedPath };
}
```

### Step 4: Create `src/cli-utils/terminal.ts` (placeholder)
```typescript
export async function launchTerminal(soulId: string, programPath: string): Promise<void> {
  // This will eventually call the external terminal app
  console.log(`Launching terminal with soulId=${soulId}, programPath=${programPath}`);
  // For now, just connect to the Gneol server via WebSocket/RPC and begin interactive chat
}
```

### Step 5: Wire into `src/index.ts`
- If no subcommand given, run `init` logic:
```typescript
program
  .command('init', { isDefault: true })
  .description('Initialize Gneol session in the current directory')
  .action(async () => {
    const { soulId, programPath } = await initializeSession();
    await launchTerminal(soulId, programPath);
  });
```
- Keep existing subcommands (agent, model, etc.) accessible.

## Edge Cases
- No agents exist and no .gneol files → only offer "create new".
- index.gneol exists but is corrupt → error with option to overwrite.
- .gneol file deployed already → we should detect if soul already exists for that path (maybe via programPath lookup). For v1, just redeploy.

## Open Questions
1. Should the terminal app be a separate process or in-process? Separate process is better for isolation.
2. Does the server need to be running already? `gneol-cli start` should launch the server if not running.
3. How does the terminal app receive soulId and programPath? Via CLI arguments or environment variables? We'll design placeholder for now.

## Validation
- Ensure `npm run build` compiles without errors.
- Test `gneol-cli init` in a fresh directory.
- Test `gneol-cli init` where index.gneol exists.
- Test agent selection with and without agents.
