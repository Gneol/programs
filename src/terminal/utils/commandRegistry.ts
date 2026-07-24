import { pushSystemMessage } from "../interface/chat"
import { invokeCli } from "./cliInvoke"

type CommandHandler = (args: string[]) => void

class CommandRegistry {
  private commands: Map<string, CommandHandler> = new Map()

  registerCommand(name: string, handler: CommandHandler) {
    this.commands.set(name, handler)
  }

  executeCommand(name: string, args: string[] = []) {
    const handler = this.commands.get(name)
    if (handler) {
      handler(args)
      return true
    }
    return false
  }

  getCommands() {
    return Array.from(this.commands.keys())
  }
}

const registry = new CommandRegistry()

export function registerCommand(name: string, handler: CommandHandler) {
  registry.registerCommand(name, handler)
}

export function executeCommand(name: string, args: string[] = []) {
  return registry.executeCommand(name, args)
}

export function getRegisteredCommands() {
  const cmds = registry.getCommands()
  return cmds;
}

export function filterCommands(filter: string): string[] {
  const commands = getRegisteredCommands();
  if (!filter) return commands;
  return commands.filter(cmd => 
    cmd.toLowerCase().includes(filter.toLowerCase())
  );
}

export function interceptInput(input: string): boolean {
  const trimmed = input.trim()
  if (trimmed.startsWith('/')) {
    const command = trimmed.replace('/', '');
    // Only execute if command exists exactly
    if (getRegisteredCommands().includes(command)) {
      executeCommand(command, [])
      return true
    }
    // Otherwise, let the UI handle it as a filter
    return false
  }
  return false
}

export function isCliInvocation(input: string): boolean {
  return typeof input === 'string' && input.trim().startsWith('!')
}