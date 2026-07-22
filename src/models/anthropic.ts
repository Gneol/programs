

type AnthropicConfig = {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
};

type Message = { role: 'system' | 'user' | 'assistant'; content: any | string };

/**
 * Anthropic model wrapper using the Anthropic Messages API.
 * Returns a shape consistent with Deepseek / OpenAI-style invoke.
 */
export class Anthropic {
  private config: AnthropicConfig;
  private baseURL = 'https://api.anthropic.com/v1/messages';

  constructor(config: AnthropicConfig) {
    // console.log(JSON.stringify(config, null, 2))
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
    // Separate system message from others
    try {
      const systemMsg = messages.find(m => m.role === 'system');
      const conversation = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role as 'user' | 'assistant',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }));
  
      const body: Record<string, any> = {
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: 1,
        messages: conversation,
      };
      if (systemMsg) {
        body.system = typeof systemMsg.content === 'string' ? systemMsg.content : JSON.stringify(systemMsg.content);
      }
  
      const response = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
  
      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
      }
  
      const data = await response.json();
  
      // Extract content
      const content =
        data.content
          ?.map((block: any) => block.text || '')
          .join('') || '';
  
      const inputTokens = data.usage?.input_tokens || 0;
      const outputTokens = data.usage?.output_tokens || 0;
  
      return {
        content,
        usage_metadata: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          cachedTokens: data.usage?.cache_creation_input_tokens || data.usage?.cache_read_input_tokens || 0,
        },
      };
    } catch (error: any) {
      console.log(error.message);
      throw error;
    }
  }
}



// const grokApiKey = process.env.ANTHROPIC_API_KEY || '';
// const grok = new Anthropic({
//   apiKey: grokApiKey,
//   model: 'claude-fable-5',
//   temperature: 1,
//   maxTokens: 4000
// });


// (async () => {
//   const response = await grok.invoke([
//     { role: 'system', content: 'You are a helpful assistant.' },
//     { role: 'user', content: 'Hello, how are you?' }
//   ]);

//   console.log('GROK Response:', response.content);
//   console.log('Usage Metadata:', response.usage_metadata);
// })();