import { spawn } from 'child_process';
import { startChat } from '../terminal/interface/chat';

/**
 * Launch the gneol-terminal Ink app via spawn with shell:true
 * to ensure a fresh TTY context for Ink rendering.
 * 
 * Resets stdin to normal mode before spawning, because @clack/prompts
 * may leave stdin in raw mode, which breaks Ink's TTY detection.
 */
export async function launchTerminal(soulId: string, programPath: string): Promise<void> {
  // // Reset stdin TTY mode if clack left it raw
  // if (process.stdin.isTTY) {
  //   process.stdin.setRawMode?.(false);
  //   process.stdin.resume();
  // }

  // return new Promise((resolve, reject) => {
  //   const child = spawn('gneol-terminal', ['--id', soulId, '--path', programPath], {
  //     shell: true,
  //     stdio: 'inherit',
  //   });

  //   child.on('close', (code) => {
  //     if (code === 0) {
  //       resolve();
  //     } else {
  //       reject(new Error(`gneol-terminal exited with code ${code}`));
  //     }
  //   });

  //   child.on('error', (err) => {
  //     reject(err);
  //   });
  // });
  await startChat( soulId , programPath );
}
