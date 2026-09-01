import { api } from './api.js';
import { convert as tokenizeConvert } from '../program/tokenize.js';
import { parseGneolFile } from '../program/parser/index.js';
import { select, text, confirm, isCancel } from '@clack/prompts';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

/** Perform a resource action (list/prune) via server API */
export async function resourceAction(
  action: 'list' | 'prune',
  resource: string,
  opts: { id?: string; page?: number; limit?: number }
): Promise<any> {
  switch (action) {
    case 'list':
      const res = await api.GneolServer.list(resource, opts.page || 1, opts.limit || 10, opts.id);
      if (res.status === 'error') throw new Error(res.data);
      return res.data;
    case 'prune':
      // TODO: implement prune endpoint on server
      return { pruned: true };
  }
}


/** Deploy a .gneol program to the server */
export async function deploy(filePath: string, watch?: boolean): Promise<{ soulId: string; programPath: string, name: string }> {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }
  const res = await api.GneolServer.deploy(resolvedPath, watch)
  if (res.status === 'error') {
    throw new Error(res.data || 'Deploy failed');
  }
  const result = res.data;
  // console.log(`Deployed: ${result.title}`);
  // console.log(`Memory ID: ${result.soulId}`);
  return { soulId: result.soulId, programPath: resolvedPath, name: result.name };
}

/** Convert .gneol to/from JSON/YAML */
export async function convert(file: string, to: string, output: string): Promise<void> {
  const result = await tokenizeConvert(file, to, output);
  console.log(String(result));
}

/** Delete an agent (soul) by ID */
export async function deleteAgent(agentId: string): Promise<string> {
  // TODO: implement delete-agent endpoint on server
  // For now, just acknowledge
  return `Agent "${agentId}" deleted.`;
}

/**
 * After deploy, validate that the program's model bindings have their API keys
 * available. If a model is not cached on the server and its env var is missing,
 * prompt the user to supply it via .env, global env, or internal storage.
 */
export async function validateModelEnv(filePath: string): Promise<void> {
  const resolvedPath = path.resolve(filePath);
  const program = parseGneolFile(resolvedPath);
  const bindings = program.modelBindings || [];
  if (bindings.length === 0) return;

  // 1. Fetch cached models from server
  let cachedModels: { id: string; cached: boolean }[] = [];
  try {
    const res = await api.GneolServer.list('model', 1, 100, '');
    const items = (res as any)?.data || [];
    cachedModels = items;
  } catch {
    // Server not running? skip validation
    return;
  }

  // 2. Load existing env file if present
  const envPath = program.env
    ? path.resolve(path.dirname(resolvedPath), program.env)
    : path.resolve(path.dirname(resolvedPath), '.env');
  let envVars: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envVars = dotenv.parse(envContent);
  }

  // 3. For each binding, check if already cached or env var is set
  for (const binding of bindings) {
    if (!binding.apiKey) continue; // no env var required

    const modelId = `${binding.provider}:${binding.modelId}`;
    const isCached = cachedModels.some(m => m.id === modelId && m.cached === true);
    if (isCached) continue;

    // Check process.env, then env file, then internal token store
    let envValue = process.env[binding.apiKey] || envVars[binding.apiKey];
    if (!envValue) {
      try {
        const secretRes = await api.GneolServer.getSecret(binding.apiKey);
        if (secretRes.status === 'success') envValue = 'found';
      } catch { /* not stored */ }
    }
    if (envValue) {
      process.env[binding.apiKey] = envValue;
      continue;
    }

    // Missing — prompt user
    console.log(`\n⚠️  Model "${binding.tag}" (${modelId}) requires an API key.`);
    console.log(`   Environment variable "${binding.apiKey}" is not set.\n`);

    const method = await select({
      message: `How would you like to provide the API key for "${binding.apiKey}"?`,
      options: [
        { value: 'env', label: 'Write to .env file', hint: 'Recommended for most projects' },
        { value: 'global', label: 'Export globally', hint: 'Set as system env variable manually' },
        { value: 'internal', label: 'Store internally', hint: 'Encrypted, scoped to agent' },
      ],
    });

    if (isCancel(method)) throw new Error('Operation cancelled.');

    if (method === 'env') {
      const keyValue = await text({
        message: `Enter the API key for "${binding.apiKey}":`,
        validate: (val) => val.length === 0 ? 'Key cannot be empty' : undefined,
      });
      if (isCancel(keyValue)) throw new Error('Operation cancelled.');

      // Append or create .env file
      const line = `${binding.apiKey}=${keyValue}\n`;
      if (fs.existsSync(envPath)) {
        fs.appendFileSync(envPath, line);
      } else {
        fs.writeFileSync(envPath, line);
      }
      console.log(`   ✅ Appended ${binding.apiKey} to ${envPath}`);

      // Also set in current process
      process.env[binding.apiKey] = keyValue as string;
    } else if (method === 'global') {
      console.log(`\n   📋 Run this in your terminal to set the environment variable:`);
      console.log(`   export ${binding.apiKey}='your-api-key-here'`);
      console.log(`   Then restart the CLI.\n`);
    } else if (method === 'internal') {
      const keyValue = await text({
        message: `Enter the API key for "${binding.apiKey}":`,
        validate: (val) => val.length === 0 ? 'Key cannot be empty' : undefined,
      });
      if (isCancel(keyValue)) throw new Error('Operation cancelled.');

      // Store encrypted to ~/.gneol/tokens.bin
      await api.GneolServer.storeSecret(binding.apiKey, keyValue as string);
      console.log(`   ✅ Stored ${binding.apiKey} in encrypted token store.`);
      process.env[binding.apiKey] = keyValue as string;
    }
  }
}
