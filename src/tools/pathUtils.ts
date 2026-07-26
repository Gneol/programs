import path from 'path';
import { getGlobalSoulStore } from '../db/program';

/**
 * Get a soul's effective workspace. If the soul is a subagent (has parentId),
 * use the parent's workspace so all records share the same .gneol folder.
 */
export function resolveAgentWorkspace(soulId: string): string {
  const store = getGlobalSoulStore();
  const soul = store.get(soulId);
  if (!soul) throw new Error('agent does not exist')
  if (soul.parentId) {
    const parent = store.get(soul.parentId);
    if (parent) return parent.workSpace;
  }
  return soul.workSpace;
}

/**
 * Resolve a file path relative to the soul's effective workspace.
 * Throws if the resolved path escapes the workspace.
 */
export function resolveFilePath(filePath: string, soulId: string): string {
  const store = getGlobalSoulStore();
  const soul = store.get(soulId);
  const workspace = resolveAgentWorkspace(soulId);

  let resolved: string;
  if (filePath.startsWith('/') || filePath.startsWith('\\')) {
    resolved = path.resolve(filePath);
  } else {
    resolved = path.resolve(workspace, filePath);
  }

  // Containment check
  const relative = path.relative(workspace, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path '${filePath}' escapes the allowed workspace '${workspace}'`);
  }

  return resolved;
}

/**
 * Display a resolved path relative to the soul's workspace.
 */
export function displaySoulPath(filePath: string, soulId: string): string {
  const store = getGlobalSoulStore();
  const soul = store.get(soulId);
  const workspace = resolveAgentWorkspace(soulId);
  if (filePath.startsWith(workspace)) {
    return path.relative(workspace, filePath);
  }
  return filePath;
}

/**
 * Resolve a glob pattern relative to the soul's workspace.
 * Returns the pattern and a cwd for glob.
 */
export function resolveGlobPattern(pattern: string, soulId: string): { pattern: string; cwd: string } {
  const workspace = resolveAgentWorkspace(soulId);

  // If pattern is absolute, ensure it is within workspace
  if (pattern.startsWith('/') || pattern.startsWith('\\')) {
    const resolved = path.resolve(pattern);
    const relative = path.relative(workspace, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Glob pattern '${pattern}' escapes the allowed workspace '${workspace}'`);
    }
    // Convert absolute pattern to relative to workspace
    return { pattern: relative, cwd: workspace };
  }

  // Relative pattern – use workspace as cwd
  return { pattern, cwd: workspace };
}
