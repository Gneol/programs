import OpenAI from 'openai';
import { config } from 'dotenv';

config();

type ORModel = string;

type OpenRouterConfig = {
  apiKey: string;
  model: ORModel;
  temperature: number;
  maxTokens: number;
};

export class OpenRouter {
  private client: OpenAI;
  config: OpenRouterConfig;

  constructor(config: OpenRouterConfig) {
    this.config = config;
    // console.log(JSON.stringify(this.config, null, 2))
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://gneol.dev',
        'X-Title': 'Gneol',
      },
    });
  }

  async invoke(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: any | string }>): Promise<{
    content: string;
    usage_metadata: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      cachedTokens: number;
    };
  }> {
    try {
      // console.log('messages sent here hmmmm', messages)
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        temperature: 1,
        max_tokens: this.config.maxTokens,
      });

      // console.log(JSON.stringify(response, null, 2))
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
    } catch (error) {
      console.error('OpenRouter API error:', error);
      throw error;
    }
  }
}


// const grokApiKey = process.env.OPENROUTER || '';
// const grok = new OpenRouter({
//   apiKey: grokApiKey,
//   model: 'tencent/hy3:free',
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