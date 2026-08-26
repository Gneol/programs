# GNEOL Program Format Reference

A `.gneol` file defines a program for the Gneol platform. This document covers everything you need to write, deploy, and understand `.gneol` programs.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Architecture](#architecture)
3. [Path Resolution](#path-resolution)
4. [Installation & Deployment](#installation--deployment)
5. [Directives](#directives)
   - [program()](#1-program)
   - [model()](#2-model)
   - [subagent()](#3-subagent)
   - [summarization()](#4-summarization)
   - [import()](#5-import)
   - [at() — Time-Based Triggers](#6-at--time-based-triggers)
   - [on() — Event-Based Triggers](#7-on--event-based-triggers)
   - [tool() — Custom Tool Scripts](#8-tool--custom-tool-scripts)
   - [mcp() — MCP Server Declarations](#9-mcp--mcp-server-declarations)
6. [Built-in Events](#built-in-events)
7. [Troubleshooting](#troubleshooting)

---

## Getting Started

A minimal `.gneol` program is just a header:

```
program("Hello World")
  .model("fast-llm")
```

Save it as `hello.gneol`, then deploy:

```bash
gneol-cli deploy -f hello.gneol
```

That creates an agent named after your program title. Agents are the workers of Gneol: they receive messages, call functions, and execute triggers. From here you can add models, subagents, triggers, tools, and MCP servers as described below.

---

## Architecture

Gneol programs describe a system of cooperating agents:

- **Program** — a `.gneol` file. Defines models, subagents, triggers, tools, and MCP connections.
- **Agent** — a worker spawned from the program header. Each agent has a name, traits, backstory, workspace, and a model.
- **Subagent** — a specialized child agent declared with `subagent("Name")`. Useful for delegating focused tasks (CI monitoring, UI debugging, etc.).
- **Trigger** — `at()` (time-based) or `on()` (event-based) blocks that fire actions automatically.
- **Tool** — a function an agent can call. Built-ins come from the platform; custom ones come from `tool()` scripts or MCP servers.
- **MCP Server** — an external Model Context Protocol server whose tools become callable by agents.

A deployed program creates a root agent. It can dispatch work to its subagents (e.g., via trigger routing with `.sentinel("Name")`, an alias for routing to a subagent).

---

## Path Resolution

**All relative paths in a `.gneol` file resolve relative to the directory containing that `.gneol` file** — not the process CWD and not the agent workspace.

This applies to:

- `.context("Label").resource("path")`
- `import("path")`
- `.script("path")` in `tool()`
- `.config("path")` in `mcp()`
- `.ifExec("path", ...)` in `at()`/`on()`

Absolute paths and URLs are used as-is.

---

## Installation & Deployment

Programs are deployed with the Gneol CLI. Start the server first if it isn't already running:

```bash
gneol-cli start          # start the server (--daemonize to run in background)
gneol-cli deploy -f path/to/file.gneol
```

`deploy` reconciles server state with your `.gneol` script:

1. Parses the `.gneol` file and its `import()`s.
2. Creates/updates the root agent for the program.
3. Applies model bindings, subagent declarations, and triggers.
4. Loads custom `tool()` scripts.
5. Connects `mcp()` servers and syncs their tools.
6. Rebuilds the agent's function list so new tools are immediately available.

> Note: some sync steps (e.g., MCP connections) require a server restart to take full effect.

### Other useful commands

| Command | Purpose |
|---------|---------|
| `gneol-cli agent` | List and select an existing agent. |
| `gneol-cli model` | Manage models. |
| `gneol-cli mcp` | Manage MCP servers. |
| `gneol-cli tool` | Manage tools. |
| `gneol-cli event` | Manage events. |
| `gneol-cli schedule` | Manage scheduled triggers. |
| `gneol-cli secrets set <key> <value>` | Store an API key securely. |
| `gneol-cli convert` | Convert `.gneol` to/from JSON or YAML. |
| `gneol-cli rollback [target]` | Rollback a previous deployment or resource change. |
| `gneol-cli stop` | Stop the server. |

Run `gneol-cli --help` for the full command list.

---

## Directives

### 1. program()

The program header. Every `.gneol` file must start with exactly one `program()` directive.

```
program("Title")
```

| Function | Description |
|----------|-------------|
| `.model("tag")` | Assigns the parent agent's model tag. |
| `.use("agentId")` | Binds the program to a specific existing agent. Usually auto-injected on install. |
| `.env("path")` | Specifies an env file path (default: auto-detect). |
| `.context("Label").text("static text")` | Injects static context into the system message. |
| `.context("Label").resource("path/or/url")` | Loads file/URL content into the system message. |
| `.id("agentId")` | Explicitly sets the agent ID. Unless you know what you're doing, let it be auto-injected. |

```
program("My App")
  .model("fast-llm")
  .env(".env")
  .context("Policy").text("Never share internal keys.")
  .context("FAQ").resource("./docs/faq.md")
```

---

### 2. model()

Declares a model binding for a tag used by agents, subagents, or summarization.

```
model("tag")
```

| Function | Description |
|----------|-------------|
| `.provider("name")` | The provider name (e.g., `openrouter`). Required if `.apiKey()` is set. |
| `.modelId("id")` | The model identifier (e.g., `openai/gpt-4o`). |
| `.apiKey("ENV_VAR")` | Env variable name holding the API key. |
| `.temperature(0.7)` | 0.0 to 1.0. |
| `.maxTokens(4000)` | Max output tokens. |
| `.rateLimit(10)` | Requests per minute. |

> **Validation:** `provider` and `apiKey` must always be paired.

```
model("eagle-eye")
  .provider("openrouter")
  .modelId("openai/gpt-4o")
  .apiKey("OPENROUTER_API_KEY")
  .temperature(0.2)
  .maxTokens(4000)
```

---

### 3. subagent()

Declares a specialized child agent. (The older `sentinel()` keyword is deprecated — use `subagent()`.)

```
subagent("Name")
```

| Function | Description |
|----------|-------------|
| `.model("tag")` | Assigns a model tag (empty name = wildcard for all). |
| `.id("agent_id")` | Assigns an immutable identifier (used for lookups on re-parse). |
| `.description("text")` | Sets the subagent's specialty/description (updates on re-parse). |
| `.backstory("text")` | Sets the subagent's persona/instructions. |

All sub-functions are optional per subagent.

```
subagent("Marcus")
  .model("eagle-eye")
  .description("CI monitoring specialist")
  .backstory("You are a CI sentinel. Watch pipelines and report failures.")
```

A wildcard declaration applies its model to all subagents that don't declare one:

```
subagent().model("deepseek-v4-flash")
```

---

### 4. summarization()

Configures how conversations are summarized for the program's agents.

```
summarization()
```

| Function | Description |
|----------|-------------|
| `.model("tag")` | Model tag to use for summarization. |
| `.prompt("...")` | Summarization prompt (inline text, file path, or URL). |

```
summarization()
  .model("fast-llm")
  .prompt("tl;dr in 3 bullets")
```

---

### 5. import()

Recursively resolves another `.gneol` file and inlines its contents. Imported files should be **fragments**: they may contain any directive except another `program()` header (headers and sub-directives are stripped on import). Circular imports are detected and skipped. Imports can appear anywhere in the file.

```
import("common.gneol")
```

```
// common.gneol — a fragment with shared declarations
model("shared-model")
  .provider("openai")
  .modelId("gpt-4o-mini")
  .apiKey("OPENAI_API_KEY")
```

---

### 6. at() — Time-Based Triggers

Schedules an action to run at specific times or intervals.

```
at("timeExpr")
```

#### Supported Time Expressions

| Expression | Meaning |
|------------|---------|
| `+10s` / `+5min` / `+2h` / `+1d` | Relative from deployment time. |
| `9am` / `3pm` / `9:40am` | Absolute 12-hour (agent's local timezone). |
| `14:30` / `18:00` | Absolute 24-hour (agent's local timezone). |
| `every:30mins` / `every:1h` | Recurring interval. |
| `every:Mon` / `every:Tuesday` | Day of week. |
| `every:1st` / `every:15th` | Day of month. |

Fires are executed while the server is running; a missed fire while the server is down is not retroactively queued.

#### Sub-functions

| Function | Description |
|----------|-------------|
| `.max(N)` | Max triggers before auto-stop. |
| `.do("message")` | Action message sent to the agent (or routed subagent). Chainable: `.do("a").do("b")`. |
| `.resource("path")` | Attach file/URL context to the action. |
| `.if("condition text")` | LLM-evaluated condition; action only runs if true. |
| `.ifExec("script", "operator", "expected")` | Runs a shell script and compares stdout to expected. Operators: `eq` (default), `lt`, `gt`, `contains`. Two-arg form uses `eq`. |
| `.sentinel("name")` | Route the action to a subagent (deprecated alias: use a subagent name). |
| `.modify()` | Tag for review. |

```
at("every:10min")
  .if("Backend health endpoint is reachable")
  .do("Run health probe")
  .max(1)
```

```
at("every:5min")
  .ifExec("./scripts/health.sh", "ok")
  .do("Health check passed.")
  .max(3)
```

```
at("every:1min")
  .ifExec("./scripts/cpu.sh", "gt", "80")
  .do("CPU threshold exceeded.")
  .max(5)
```

---

### 7. on() — Event-Based Triggers

Fires when an event is received. Events are pushed to the agent via the platform; see [Built-in Events](#built-in-events).

```
on("eventName")
```

| Function | Description |
|----------|-------------|
| `.maxSize(N)` | Max pending jobs before auto-fire (fires once threshold reached). |
| `.delay(Ns)` | Debounce window in seconds (coalesces rapid events). |
| `.do("message")` | Action message. Chainable: `.do("a").do("b")`. |
| `.resource("path")` | Attach file/URL context. |
| `.if("condition text")` | LLM-evaluated condition. |
| `.sentinel("name")` | Route to a subagent (deprecated alias). |
| `.modify()` | Tag for review. |
| `.max(N)` | Max triggers before auto-stop (global limit). |

```
on("deploy-event")
  .maxSize(1)
  .delay(10)
  .if("Latest CI passed")
  .do("Run deployment.")
  .sentinel("Marcus")
```

---

### 8. tool() — Custom Tool Scripts

Declares a custom tool module from a worker script.

```
tool("name")
```

| Function | Description |
|----------|-------------|
| `.script("path")` | Path to the worker script (relative or absolute). |
| `.description("text")` | Human-readable description of the module. |

**Worker script requirements:**

- Import `{ Module }` from `gneol-sdk` (npm) and `{ z }` from `zod`.
- Instantiate `new Module("Name")`.
- Register tools via `.tool({...})` — `parameters` and `output` must be Zod schemas, not strings.
- Call `.parse()` to start the worker.

```js
import { Module } from "gneol-sdk";
import { z } from "zod";

const mod = new Module("MyTool");
mod.tool({
    name: "myFunc",
    description: "Does something useful",
    parameters: z.object({ input: z.string() }),
    output: z.object({ result: z.string() }),
    func: async (args) => { /* runs when called */ },
    action: async (args) => { /* runs for action logs */ },
});
mod.parse();
```

After install, tools are available as `tool.<ModuleName>.<toolName>()`. Action logs from `action()` are forwarded to the session stream.

```
tool("CustomTool")
  .script("./custom_tool.js")
```

---

### 9. mcp() — MCP Server Declarations

Connects MCP servers and syncs their tools into the agent's function list. `mcp("name").config(...)` uses the standard MCP config JSON format.

```
mcp("name")
```

| Function | Description |
|----------|-------------|
| `.config("path/or/url")` | Local JSON config file path, or URL to a remote config. |
| `.token("ENV_VAR")` | Chainable. Adds auth tokens: first token becomes `Authorization: Bearer` (HTTP) or `TOKEN` env (STDIO); extras become `X-Token-2` (HTTP) / `TOKEN_2` (STDIO). |

**Config format:**

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    },
    "exa": {
      "url": "https://mcp.exa.ai/mcp"
    }
  }
}
```

Supports `stdio` (`command`/`args`) and HTTP Streamable (`url`) transports. Optional `env`/`headers` fields are supported; `${VAR}` placeholders are expanded from the environment.

```
mcp("test-servers")
  .config("mcp-servers.json")

mcp("secure-api")
  .config("mcp-remote.json")
  .token("MY_API_TOKEN")
```

---

## Built-in Events

| Event | Fired when |
|-------|-----------|
| `Idle` | The agent is idle (no pending work). Often used for keep-alive checks. |
| `deploy-event` | A program is deployed/redeployed (useful for CI-triggered deployments). |
| `message` | A user or agent message arrives. |

> Custom application events can be emitted by tools/scripts; `on("name")` listens for any event pushed to the agent.

---

## Troubleshooting

**Deploy fails with "missing model binding"** — Every `.model("tag")` reference in the header/subagents must have a matching `model("tag")` block, or the tag must already be cached.

**MCP tools not appearing** — Ensure `mcp()` config paths are correct, then restart the server after deploy; HTTP servers may require network access. Tools appear prefixed with the declared MCP name: `mcp.<name>.<toolName>` (e.g., `mcp.test-servers.<toolName>`).

**Trigger never fires** — Check the `at()` / `on()` conditions. LLM-evaluated `.if()` can fail silently; try removing it to isolate.

**`ifExec` not matching** — Confirm the script is executable and its stdout exactly matches (or use `contains`). Paths resolve relative to the `.gneol` file.

**Subagent not receiving routed actions** — Verify the subagent name matches a `subagent("Name")` declaration exactly.

---

## Complete Example

```
import('reusable_tasks.gneol')

program("Dispatch Test")
  .model("deepseek-v4-flash")
  .env(".env")
  .context("Policy").text("Never share internal keys.")
  .context("FAQ").resource("./docs/faq.md")

model("eagle-eye")
  .provider("openrouter")
  .modelId("openai/gpt-4o")
  .apiKey("OPENROUTER_API_KEY")
  .temperature(0.2)
  .maxTokens(4000)

subagent("Marcus")
  .model("eagle-eye")
  .description("CI sentinel")

subagent().model("deepseek-v4-flash")

summarization().model("deepseek-v4-flash").prompt("tl;dr in 3 bullets")

tool("CustomTool")
  .script("./custom_tool.js")

mcp("test-servers")
  .config("mcp-servers.json")

at("every:10min")
  .if("Context feature is fully working")
  .do("Log: Context feature is done.")
  .max(1)

on("deploy-event")
  .maxSize(1)
  .if("Latest CI passed")
  .do("Run deployment.")

at("every:5min")
  .ifExec("./scripts/health.sh", "ok")
  .do("Health check passed.")
  .max(3)

at("every:1min")
  .ifExec("./scripts/cpu.sh", "gt", "80")
  .do("CPU threshold exceeded.")
  .max(5)
```

