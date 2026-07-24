import { exec, spawn } from 'child_process'

export interface CliResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export const DEFAULT_CLI_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export function invokeCli(command: string, timeout?: number): Promise<CliResult> {
  return new Promise((resolve) => {
    timeout = timeout ? timeout * 1000 : DEFAULT_CLI_TIMEOUT_MS
    
    const child = exec(command, { timeout }, (error, stdout, stderr) => {
      const truncate = (str: string, maxLength: number = 10000) => {
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength) + `\n...[truncated ${str.length - maxLength} characters]`;
      };
      
      if (error) {
        const stdoutStr = stdout ? truncate(String(stdout)) : ''
        const stderrStr = stderr ? truncate(String(stderr)) : truncate(String(error.message || ''))
        const timedOut = error.killed || false
        const code = typeof error.code === 'number' ? error.code : null
        resolve({ code, stdout: stdoutStr, stderr: stderrStr, timedOut })
      } else {
        const stdoutStr = stdout ? truncate(String(stdout)) : ''
        const stderrStr = stderr ? truncate(String(stderr)) : ''
        resolve({ code: 0, stdout: stdoutStr, stderr: stderrStr, timedOut: false })
      }
    })
    
    // Handle timeout separately
    if (timeout) {
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill()
        }
      }, timeout)
    }
  })
}

export interface DetachedProcess {
  pid: number | undefined
  kill: () => boolean
}

export function spawnDetached(
  command: string, 
  args: string[] = [], 
  options: {
    cwd?: string
    env?: NodeJS.ProcessEnv
    stdio?: 'ignore' | 'inherit' | 'pipe'
    shell?: boolean
  } = {}
): DetachedProcess {
  const stdioOption = options.stdio || 'ignore';
  
  const child = spawn(command, args, {
    ...options,
    detached: true,
    stdio: stdioOption,
    shell: options.shell ?? true // Use shell by default for better process separation
  });
  
  child.unref();
  
  return {
    pid: child.pid,
    kill: () => {
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL'); // Kill entire process group
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  };
}

export function execDetached(command: string): DetachedProcess {
  // Split command into executable and args
  const parts = command.match(/[^\s"']+|"[^"]*"|'[^']*'/g) || [];
  const executable = parts[0];
  const args = parts.slice(1).map(arg => 
    arg.replace(/^['"]|['"]$/g, '')
  );
  
  return spawnDetached(executable, args);
}
