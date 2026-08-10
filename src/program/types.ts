


export type ModelBinding = {
    tag: string;
    modelId: string;
    provider?: string;
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    apiKey?: string;
    programPath?: string;
    temperature?: number;
    maxTokens?: number;
    rateLimit?: number;
};

export interface SubagentDeclaration {
    name: string;
    model?: string;
    id?: string;
    description?: string;
};

// Backward-compatible alias
export type SentinelDeclaration = SubagentDeclaration;

export type IfExecType = { script: string; expected: string; operator: 'eq' | 'lt' | 'gt' | 'contains' }

export interface Action {
    program: string;
    marker: string;
    snapShot: number; // the millisecond snapshot of the next invokation
    type: 'event' | 'time'
    instructions: string[];
    resources: string[];
    maxTrigger: number;
    initialMaxTrigger: number; // original max for display
    eventOptions: {
        maxBucketSize: number;
        delay: number;
    }
    modify: boolean;
    condition?: string; // Natural language condition evaluated by LLM before executing
    ifExec?: IfExecType;
    subagent?: string; // Sentinel name or ID to route this trigger to
}



export interface ToolDef {
    name: string;
    scriptPath: string;
}

export type PermissionLevel = 'ask' | 'dynamic' | 'allow';

export interface McpConfigDeclaration {
    config: string;
    tokens?: string[];
}

export interface GneolProgram {
    title: string;
    name?: string;
    traits?: string;
    backstory?: string;
    path: string;
    actions: Action[];
    contexts?: { label: string; type: 'text' | 'resource'; value: string }[];
    parentModel?: string;
    summarizationModel?: string;
    summarizationPrompt?: string;
    subagentDeclarations?: SubagentDeclaration[];
    wildcardModel?: string;
    modelBindings?: ModelBinding[];
    mcpConfigs?: Record<string, McpConfigDeclaration>;
    toolDefs?: ToolDef[];
    env?: string;
    agentId?: string;
    webhooks?: string[];
    permission?: Record<string, PermissionLevel>
}