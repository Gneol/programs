import OpenAI from 'openai';
// import { config } from 'dotenv';

// config();

type DeepseekConfig = {
  apiKey: string,
  model: DSModel,
  temperature: number,
  maxTokens: number
}

export class Deepseek {
  private client: OpenAI;
  config: DeepseekConfig
  constructor(config: DeepseekConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: 'https://api.deepseek.com',
    });
  }

  async invoke(messages: Array<{ role: 'system' | 'user' | 'assistant', content: any | string }>): Promise<{
    content: string,
    usage_metadata: {
      inputTokens: number,
      outputTokens: number,
      totalTokens: number,
      cachedTokens: number
    }
  }> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      });

      const usage = response.usage;
      const inputTokens = usage?.prompt_tokens || 0;
      const outputTokens = usage?.completion_tokens || 0;
      const totalTokens = usage?.total_tokens || 0;
      const cachedTokens = (usage as any)?.prompt_cache_hit_tokens || 0;
      // console.log(response);
      return {
        content: response.choices[0]?.message?.content || '',
        usage_metadata: {
          inputTokens,
          outputTokens,
          totalTokens,
          cachedTokens
        }
      }
    } catch (error) {
      console.error('Deepseek API error:', error);
      throw error;
    }
  }
}

type DSModel = 'deepseek-chat' | 'deepseek-reasoner' | 'deepseek-v4-flash' | 'deepseek-v4-pro'

// const deepseekAPIKey = process.env.DEEPSEEK_API_KEY || '';
// const grok = new Deepseek({
//   apiKey: deepseekAPIKey,
//   model: 'deepseek-chat',
//   temperature: 0.7,
//   maxTokens: 4000
// });


// (async () => {
//   const response = await grok.invoke([
//     { role: 'system', content: 'You are a helpful assistant.' },
//     { role: 'user', content: 'Hello, how are you?' },
//   ]);

//   console.log('Deepseek Response:', response.content);
//   console.log('Usage Metadata:', response.usage_metadata);
// })();