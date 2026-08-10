import { z } from 'zod';
import os from 'os';
// import { current, getCliPermissionLevel } from "../utils/memory";
import { invokeCli } from './utils/cliInvoke';
import { Module } from 'gneol-sdk';
import { isDangerousCommand } from './utils/cli_filter';
import { ProgramRuntime } from '../program/runtime';
import { PermissionLevel } from '../program/types';
import { getGlobalSoulStore } from '../db/program';
import { markForRebuild } from '../llm/system_message';




export const CliModule = new Module('Cli');


CliModule.tool({
    name: 'setWorkspace',
    description: "Change the current workspace directory for the agent",
    action: async (input: any) => {
        return `changing workspace to ${input.path}`;
    },
    parameters: z.object({
        path: z.string().describe("Absolute or relative path to set as the workspace directory")
    }),
    func: async (input: { path: string }, id: string): Promise<any> => {
        const store = getGlobalSoulStore();
        const soul = store.get(id);
        if (soul) {
            await store.update(soul.id, {
                workSpace: input.path
            })

            markForRebuild(id, true);
        }
        return `Workspace set to ${input.path}`
    }
})


const normalizePath = (p: string): string => {
    if (os.platform() === 'win32') {
        return p.replace(/\//g, '\\');
    }
    return p;
};

const ensureWorkspace = (id: string, command: string): string => {
    const store = getGlobalSoulStore();
    const soul = store.get(id);

    if (soul.workSpace) {
        const ws = normalizePath(soul.workSpace);
        if (os.platform() === 'win32') {
            return `cd /d "${ws}" && ${command}`;
        }
        return `cd "${ws}" && ${command}`;
    }

    return command;
}


CliModule.tool({
    name: 'execute',
    description: "Execute a terminal command",
    auth: async (input, id) => {
        const { command } = input;
        console.log(input, id)
        const store = getGlobalSoulStore();
        const soul = store.get(id);
        const runtime = ProgramRuntime.getRuntime(soul.programPath);
        const permissionLevel = runtime.program.permission ? await runtime.program.permission['Cli.execute'] : null;
        const level: PermissionLevel = permissionLevel || 'dynamic';
        if (level === 'allow') {
            return false;
        }
        if (level === 'ask' || isDangerousCommand(command)) {
            return `Requesting permission to execute: "${command}"`;
        }
    },
    action: async (input: any) => {
        return `executing - ${input.command}`;
    },
    parameters: z.object({
        command: z.string().describe("The terminal command to execute"),
        timeout: z.number().optional().describe("Timeout in seconds")
    }),
    func: async (input: {
        command: string, timeout: number
    }, id: string) => {
        let { command, timeout } = input;
        timeout = timeout || 60;
        command = ensureWorkspace(id, command)
        const response = await invokeCli(command, timeout);
        return response ? response : 'executed command';
    }
})