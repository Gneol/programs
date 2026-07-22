import { api } from './api.js';
import { convert as tokenizeConvert } from '../program/tokenize.js';
import fs from 'fs';
import path from 'path';

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

/** Approve or reject a function permission request */
export async function approveFunction(id: string, state: boolean): Promise<void> {
  // TODO: implement approve endpoint on server
  console.log(`Function ${id} ${state ? 'approved' : 'rejected'}`);
}

/** Deploy a .gneol program to the server */
export async function deploy(filePath: string): Promise<void> {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }
  try {
    const res = await api.GneolServer.deploy(resolvedPath);
    if (res.status === 'error') {
      console.error(`Error: ${res.data || 'Unknown error'}`);
      process.exit(1);
    }
    const result = res.data;
    console.log(`Deployed: ${result.title}`);
    console.log(`Memory ID: ${result.soulId}`);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
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
