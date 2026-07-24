import fs from 'fs/promises';
import path from 'path';

/**
 * setInputKey((prev) => prev + relativePath.length + 2);
 * Recursively lists all files in a directory, returning relative paths.
 * Ignores common package manager directories (node_modules, .git, etc.)
 * @param rootDir - The directory to search from (default: current working directory)
 * @returns Array of relative file paths
 */
export async function listAllFiles(rootDir: string = process.cwd()): Promise<string[]> {
  const files: string[] = [];
  const IGNORE_DIRS = [
    'node_modules',
    '.git',
    '.next',
    '.nuxt',
    '.cache',
    'dist',
    'build',
    'out',
    '.output',
    'coverage',
    '.pnpm-store',
    '.yarn',
    'bower_components',
    '.terraform',
    '.serverless',
    '.idea',
    '.vscode',
    '.vs',
  ];

  async function traverse(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORE_DIRS.includes(entry.name)) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else {
        const relative = path.relative(rootDir, fullPath);
        files.push(relative);
      }
    }
  }

  await traverse(rootDir);
  return files;
}

/**
 * Filters file paths by a search string (case‑insensitive substring match).
 * @param files - Array of relative file paths
 * @param query - Search string
 * @returns Filtered array
 */
export function filterFiles(files: string[], query: string): string[] {
  const normalizedQuery = query.toLowerCase();
  return files.filter(file => file.toLowerCase().includes(normalizedQuery));
}

/**
 * Main search function: lists all files and filters by query.
 * @param query - Search string (empty returns all files)
 * @param rootDir - Root directory (default: cwd)
 * @returns Sorted array of matching relative file paths
 */
export async function searchFiles(query: string = '', rootDir: string = process.cwd()): Promise<string[]> {
  const allFiles = await listAllFiles(rootDir);
  const filtered = query ? filterFiles(allFiles, query) : allFiles;
  return filtered.sort();
}
