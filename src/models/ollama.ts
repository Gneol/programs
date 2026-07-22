type OllamaConfig = {
  model: string;
  temperature: number;
  baseUrl?: string;
  maxTokens?: number;
};

type Message = { role: 'system' | 'user' | 'assistant'; content: any | string };

/**
 * Ollama model wrapper using the Ollama API directly.
 * Returns a shape consistent with Deepseek / OpenAI-style invoke.
 */
export class Ollama {
  private config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = config;
  }

  async invoke(
    messages: Message[]
  ): Promise<{
    content: string;
    usage_metadata: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      cachedTokens: number;
    };
  }> {
    const baseUrl = this.config.baseUrl || 'http://localhost:11434';
    const url = `${baseUrl}/api/chat`;

    const formattedMessages = messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));

    const body: Record<string, any> = {
      model: this.config.model,
      messages: formattedMessages,
      stream: false,
    };

    if (this.config.temperature !== undefined || this.config.maxTokens !== undefined) {
      const options: Record<string, any> = {};
      if (this.config.temperature !== undefined) options.temperature = this.config.temperature;
      if (this.config.maxTokens !== undefined) options.num_predict = this.config.maxTokens;
      body.options = options;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${errBody}`);
    }

    const data = await response.json();

    // Ollama returns content directly
    const content = data.message?.content || '';

    // Ollama doesn't provide token usage natively; estimate from string length
    const approxTokens = (content.length + formattedMessages.reduce((acc, m) => acc + m.content.length, 0)) / 4;
    const approxInput = Math.round(approxTokens * 0.7);
    const approxOutput = Math.round(approxTokens * 0.3);

    return {
      content,
      usage_metadata: {
        inputTokens: approxInput,
        outputTokens: approxOutput,
        totalTokens: approxInput + approxOutput,
        cachedTokens: 0,
      },
    };
  }
}
