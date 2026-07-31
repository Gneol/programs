export type ModelMessage = {
  role: 'system' | 'user' | 'assistant';
  content: any | string;
};

export type ModelResult = {
  content: string;
  usage_metadata: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedTokens?: number;
  };
};

export type BaseModelConfig = {
  provider?: string;
  apiKey?: string;
  tag?: string;           // tag used as cache key (from model bindings)
  model: string;
  temperature: number;
  maxTokens: number;
  baseURL?: string;
  program?: string;
  rateLimit?: number;
};

export type Provider =
  | 'openai'
  | 'deepseek'
  | 'openrouter'
  | 'grok'
  | 'kimi'
  | 'minimax'
  | 'gemini'
  | 'anthropic'
  | 'ollama';

export interface LLMModel {
  invoke(messages: ModelMessage[]): Promise<ModelResult>;
}
