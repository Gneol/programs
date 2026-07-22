import OpenAI from 'openai';

type OpenAIConfig = {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  baseURL?: string;
};

/**
 * OpenAI model wrapper using official OpenAI SDK.
 * Returns a shape consistent with Deepseek-style invoke.
 */
export class OpenAIModel {
  private client: OpenAI;
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://api.openai.com/v1',
    });
  }

  async invoke(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: any | string }>
  ): Promise<{
    content: string;
    usage_metadata: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      cachedTokens: number;
    };
  }> {
    // Ensure content is string
    const formatted = messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));

    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages: formatted as any,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    });

    const usage = response.usage;
    const inputTokens = usage?.prompt_tokens || 0;
    const outputTokens = usage?.completion_tokens || 0;
    const totalTokens = usage?.total_tokens || 0;
    const cachedTokens = (usage as any)?.prompt_tokens_details?.cached_tokens || 0;

    return {
      content: response.choices[0]?.message?.content || '',
      usage_metadata: {
        inputTokens,
        outputTokens,
        totalTokens,
        cachedTokens,
      },
    };
  }
}
