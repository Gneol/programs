import fs from 'fs/promises';
import path from 'path';

export class FileBrowser {
  private currentPath: string;

  constructor(initialPath?: string) {
    this.currentPath = initialPath || process.cwd();
  }

  getCurrentPath(): string {
    return this.currentPath;
  }

  async listContents(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.currentPath, { withFileTypes: true });
      const items = entries.map(entry => {
        const name = entry.name;
        return entry.isDirectory() ? name + '/' : name;
      });
      return items.sort((a, b) => {
        // Directories first
        if (a.endsWith('/') && !b.endsWith('/')) return -1;
        if (!a.endsWith('/') && b.endsWith('/')) return 1;
        return a.localeCompare(b);
      });
    } catch (error) {
      console.error('Error reading directory:', error);
      return [];
    }
  }

  async navigate(selection: string): Promise<boolean> {
    if (selection.endsWith('/')) {
      // Enter directory
      const dirName = selection.slice(0, -1);
      const newPath = path.join(this.currentPath, dirName);
      try {
        await fs.access(newPath);
        this.currentPath = newPath;
        return true;
      } catch {
        return false;
      }
    } else if (selection === '..') {
      // Go up
      const parent = path.dirname(this.currentPath);
      if (parent !== this.currentPath) {
        this.currentPath = parent;
        return true;
      }
    }
    return false;
  }

  getFullPath(selection: string): string {
    if (selection === '..') {
      return path.dirname(this.currentPath);
    }
    return path.join(this.currentPath, selection.replace(/\/$/, ''));
  }

  async filterContents(filter: string): Promise<string[]> {
    const all = await this.listContents();
    if (!filter) return all;
    return all.filter(item => 
      item.toLowerCase().includes(filter.toLowerCase())
    );
  }
}
