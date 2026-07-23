import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { getTemplate, resources } from './program/template.js';
import { resourceAction, approveFunction, deploy, convert, deleteAgent } from './cli-utils/resource.js';
import { api } from './cli-utils/api.js';

const program = new Command();

program
  .name('gneol-cli')
  .description('Gneol CLI – manage AI platform resources via .gneol scripts')
  .version('1.0.0');

// ─── Scaffold template helpers ───

function scaffoldFile(resource: string, name: string, filePath: string) {
  const block = getTemplate(resource, name);
  if (fs.existsSync(filePath)) {
    fs.appendFileSync(filePath, '\n' + block, 'utf8');
    console.log(`Appended ${resource} scaffold to ${filePath}`);
  } else {
    fs.writeFileSync(filePath, block, 'utf8');
    console.log(`Created ${filePath}`);
  }
}

// ─── Per‑resource sub-commands (scaffold, list, prune) ───

for (const resource of resources) {
  const resourceCmd = program.command(resource);

  resourceCmd
    .command('scaffold')
    .argument('<name>', 'Name for the resource')
    .argument('[file]', 'Output .gneol file (default: <name>.gneol)')
    .description(`Generate a ${resource} scaffold as a .gneol snippet (creates or appends to a file)`)
    .action((name: string, file?: string) => {
      const outFile = file || `${name}.gneol`;
      const resolvedPath = outFile.endsWith('.gneol') ? outFile : outFile + '.gneol';
      scaffoldFile(resource, name, resolvedPath);
    });

  resourceCmd
    .command('list')
    .option('-i, --id <id>', `Optional ${resource} ID to filter`)
    .option('-p, --page <page>', 'Page number (1-indexed)', parseInt)
    .option('-l, --limit <limit>', 'Results per page', parseInt)
    .description(`List all ${resource}s currently active on the server`)
    .action(async (opts: { id?: string; page?: number; limit?: number }) => {
      try {
        const items = await resourceAction('list', resource, {
          id: opts.id,
          page: opts.page,
          limit: opts.limit
        });
        console.log(JSON.stringify(items, null, 2));
      } catch (err: any) {
        console.error(err.message);
      }
      process.exit(0)
    });

  resourceCmd
    .command('prune')
    .description(`Remove stale/unreferenced ${resource}s`)
    .option('-y, --yes', 'Skip confirmation')
    .option('-i, --id <id>', `Optional ${resource} ID to filter`)
    .action(async (opts: { yes?: boolean; id?: string }) => {
      try {
        await resourceAction('prune', resource, {
          id: opts.id
        });
        console.log(`Pruned ${resource} successfully.`);
      } catch (err: any) {
        console.error(err.message);
      }
    });
}

// ─── Agent Delete ───

const agentCmd = program.commands.find(c => c.name() === 'agent');
if (agentCmd) {
  agentCmd
    .command('delete')
    .argument('[id]', 'Agent ID to delete (omit for interactive selection)')
    .description('Permanently delete an agent and its contexts')
    .action(async (id?: string) => {
      try {
        const result = await deleteAgent(id || '');
        console.log(result);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });
}

// ─── Approve Permission ───

program
  .command('approve')
  .description('Approve or reject a function permission request')
  .requiredOption('-i, --id <id>', 'The function request ID')
  .option('-y, --yes', 'Approve the request (default)')
  .option('-n, --no', 'Reject the request')
  .action(async (opts: { id: string; yes?: boolean; no?: boolean }) => {
    const state = opts.no ? false : true;
    try {
      await approveFunction(opts.id, state);
      process.exit(0)
    } catch (err: any) {
      console.error(err.message);
    }
  });

// ─── Deploy ───

program
  .command('deploy')
  .description('Reconcile server state with a .gneol script')
  .requiredOption('-f, --file <path>', 'Path to the .gneol script file')
  .action(async (options) => {
    const resolvedPath = path.resolve(options.file);
    const response = await deploy(resolvedPath);
    console.log(JSON.stringify(response, null, 2))
    process.exit(0)
  });

// ─── Rollback ───

program
  .command('rollback')
  .description('Rollback a previous deployment or resource change')
  .argument('[target]', 'Optional rollback target (e.g., deployment ID, revision) to rollback to')
  .option('-f, --file <path>', 'Path to a .gneol script to revert from')
  .option('-d, --deployment <id>', 'Specific deployment ID to rollback')
  .action((target: string | undefined, opts: { file?: string; deployment?: string }) => {
    // TODO: implement rollback logic
    console.log('Rollback command triggered', { target, opts });
  });

// ─── Convert ───

program
  .command('convert')
  .description('Convert .gneol to JSON/YAML or JSON/YAML back to .gneol')
  .requiredOption('-f, --file <path>', 'Path to the source file (.gneol, .json, .yaml, .yml)')
  .requiredOption('-t, --to <format>', 'Target format: json, yaml, or gneol')
  .option('-o, --output <path>', 'Output file path (default: same name with new extension)')
  .action(async (opts: { file: string; to: string; output?: string }) => {
    try {
      await convert(opts.file, opts.to, opts.output || '');
      process.exit(0)
    } catch (err: any) {
      console.error(err.message);
      process.exit(1);
    }
  });

// ─── Init (default) ───

import { initializeSession } from './cli-utils/init.js';
import { launchTerminal } from './cli-utils/terminal.js';

program
  .command('init')
  .description('Initialize a Gneol session in the current directory')
  .action(async () => {
    try {
      const { soulId, programPath } = await initializeSession();
      await launchTerminal(soulId, programPath);
    } catch (err: any) {
      console.error(err.message);
      process.exit(1);
    }
  });

// ─── Start Server ───

program
  .command('start')
  .description('Start the Gneol server in background')
  .action(() => {
    const { spawn } = require('child_process');
    const child = spawn('node', [require('path').join(__dirname, 'server.js')], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    console.log('Server started in background.');
  });

// ─── Stop Server ───

program
  .command('stop')
  .description('Stop the Gneol server')
  .action(() => {
    try {
      require('child_process').execSync('kill $(lsof -t -i:3999)', { stdio: 'ignore' });
      console.log('Server stopped.');
    } catch {
      console.log('Server not running or could not be stopped.');
    }
  });

export default program;

// If run directly
if (require.main === module) {
  // If no command given, default to 'init'
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0].startsWith('-')) {
    program.parse(['node', 'gneol-cli', 'init', ...args]);
  } else {
    program.parse(process.argv);
  }
}
