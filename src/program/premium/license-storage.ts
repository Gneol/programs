import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync, accessSync } from 'fs';

const CONFIG_DIR = path.join(os.homedir(), '.gneol');
const CONFIG_FILE = path.join(CONFIG_DIR, 'cert_.json');
const MACHINE_ID_FILE = path.join(CONFIG_DIR, 'machine-id');

let configCache: Record<string, string> | null = null;
let machineIdCache: string | null = null;

// Hardcoded salt — will be obfuscated in the compiled binary
// Complex unique salt with multiple entropy sources
const HARDCODED_SALT = 'gneol-license-salt-v3-9a8b7c6d5e4f3a2b1c0d!@#$%^&*()_+-=[]{}|;:,.<>?/';

/**
 * Gets (or generates and persists) a stable machine ID.
 * Stored in ~/.gneol/machine-id as a UUID.
 * This ensures the encryption key survives network/MAC/hostname changes.
 */
function getOrCreateMachineIdSync(): string {
  if (machineIdCache) return machineIdCache;

  try {
    // Try to read existing machine-id file
    if (existsSync(MACHINE_ID_FILE)) {
      const data = readFileSync(MACHINE_ID_FILE, 'utf-8').trim();
      if (data) {
        machineIdCache = data;
        return data;
      }
    }
  } catch {
    // File doesn't exist or can't be read — will generate new one
  }

  // Generate a new UUID v4
  const newId = crypto.randomUUID();
  
  // Ensure directory exists
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writeFileSync(MACHINE_ID_FILE, newId, 'utf-8');
  } catch {
    // Best-effort — if we can't persist, use fallback
  }

  machineIdCache = newId;
  return newId;
}

/**
 * Derives an encryption key from a persistent machine ID.
 * The machine ID is a UUID stored in ~/.gneol/machine-id, 
 * generated once on first run and never changed.
 * Falls back to a composite of stable system identifiers if the file is missing.
 */
function deriveEncryptionKey(): Buffer {
  let machineFingerprint: string;

  try {
    machineFingerprint = getOrCreateMachineIdSync();
  } catch {
    // Fallback: use only the most stable identifiers
    const arch = os.machine ? os.machine() : process.arch;
    const platform = process.platform;
    machineFingerprint = `fallback:${arch}:${platform}`;
  }

  // Derive a 32-byte key using PBKDF2 with higher iterations
  return crypto.pbkdf2Sync(machineFingerprint, HARDCODED_SALT, 200000, 32, 'sha512');
}

/**
 * Ensures the config directory exists.
 */
async function ensureConfigDir(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch {
    // Directory already exists
  }
}

/**
 * Reads and decrypts the config file.
 */
async function readConfig(): Promise<Record<string, string>> {
  if (configCache !== null) {
    return configCache;
  }

  try {
    // Check if file exists before reading
    try {
      await fs.access(CONFIG_FILE);
    } catch {
      configCache = {};
      return configCache;
    }
    // console.log(CONFIG_FILE)
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    
    // Validate JSON before parsing
    if (!data || data.trim().length === 0) {
      configCache = {};
      return configCache;
    }
    
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch (parseError) {
      // Corrupted config file - return empty and let caller handle
      console.warn('Corrupted config file detected, resetting to empty config');
      configCache = {};
      return configCache;
    }
    
    // Check if the config has encrypted fields
    if (parsed.encrypted && parsed.iv && parsed.tag) {
      try {
        const key = deriveEncryptionKey();
        // console.log(key);
        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(parsed.iv, 'hex')
        );
        decipher.setAuthTag(Buffer.from(parsed.tag, 'hex'));
        
        let decrypted = decipher.update(parsed.encrypted, 'hex', 'utf-8');
        decrypted += decipher.final('utf-8');
        
        configCache = JSON.parse(decrypted);
        return configCache;
      } catch (decryptError) {
        // Decryption failed - likely different machine or corrupted data
        console.warn('Config decryption failed, config may be from another machine', decryptError);
        configCache = {};
        return configCache;
      }
    }
    
    // Legacy unencrypted config
    configCache = parsed;
    return configCache;
  } catch {
    configCache = {};
    return configCache;
  }
}

/**
 * Writes encrypted config to file.
 */
async function writeConfig(config: Record<string, string>): Promise<void> {
  await ensureConfigDir();
  
  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(JSON.stringify(config), 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  
  const payload = {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
  
  await fs.writeFile(CONFIG_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  configCache = config;
}

/**
 * Stores the license key and optionally the instance ID to local encrypted storage.
 */
export async function storeLicenseKey(licenseKey: string, instanceId?: string): Promise<void> {
  const config = await readConfig();
  config.licenseKey = licenseKey;
  if (instanceId) {
    config.instanceId = instanceId;
  }
  await writeConfig(config);
}

/**
 * Retrieves the stored license key from local encrypted storage.
 * Returns null if no license key is stored.
 */
export async function getLicenseKey(): Promise<string | null> {
  const config = await readConfig();
  return config.licenseKey || null;
}

/**
 * Retrieves the stored instance ID from local encrypted storage.
 * Returns null if no instance ID is stored.
 */
export async function getInstanceId(): Promise<string | null> {
  const config = await readConfig();
  return config.instanceId || null;
}

/**
 * Checks if a license key is currently stored in local encrypted storage.
 * 
 * @returns True if a license key exists, false otherwise
 */
export async function hasLicenseKey(): Promise<boolean> {
  try {
    const config = await readConfig();
    return !!config.licenseKey;
  } catch {
    return false;
  }
}

/**
 * Stores the cached date to local encrypted storage.
 */
export async function storeCachedDate(cachedDate: string): Promise<void> {
  const config = await readConfig();
  config.cachedDate = cachedDate;
  await writeConfig(config);
}

/**
 * Retrieves the cached date from local encrypted storage.
 * Returns null if no cached date is stored.
 */
export async function getCachedDate(): Promise<string | null> {
  const config = await readConfig();
  return config.cachedDate || null;
}

/**
 * Clears all stored license data from local encrypted storage.
 */
export async function clearLicenseKey(): Promise<void> {
  try {
    const config = await readConfig();
    delete config.licenseKey;
    delete config.instanceId;
    delete config.cachedDate;
    await writeConfig(config);
  } catch {
    // Config doesn't exist or read failed
  }
}
