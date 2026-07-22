






import fs from 'fs/promises';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import os from 'os';

export class FileUtils {
    private static readonly BASE_DIR = `${path.join(os.homedir(), '.gneol', 'files')}`;

    constructor() {}

    static async ensureDirectory(): Promise<void> {
        if (!existsSync(this.BASE_DIR)) {
            mkdirSync(this.BASE_DIR, { recursive: true });
        }
    }

    static async saveFileToDisk(filename: string, data: string): Promise<string> {
        await this.ensureDirectory();
        
        const filePath = path.join(this.BASE_DIR, filename);
        await fs.writeFile(filePath, data);    
        return filePath;
    }

    static async readFileFromDisk(filepath: string): Promise<string> {
        return await fs.readFile(filepath, 'utf-8');
    }

    static async deleteFileFromDisk(filepath: string): Promise<void> {
        await fs.unlink(filepath);
    }
    
    static async fileExists(filepath: string): Promise<boolean> {
        try {
            await fs.access(filepath);
            return true;
        } catch {
            return false;
        }
    }
}