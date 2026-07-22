import OpenAI from 'openai';

// config();

type MinimaxConfig = {
  apiKey: string,
  model: string,
  temperature: number,
  maxTokens: number
}

export class Minimax {
  private client: OpenAI;
  config: MinimaxConfig
  constructor(config: MinimaxConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: 'https://api.minimax.io/v1'
    });
  }

  async invoke(messages: { role: 'user' | 'system' | 'assistant', content: string | any }[]): Promise<{
    content: string,
    usage_metadata: {
      inputTokens: number,
      outputTokens: number,
      totalTokens: number
    }
  }> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      });

      const content = response.choices[0]?.message?.content || '';
      const usage = response.usage;
      const inputTokens = usage?.prompt_tokens || 0;
      const outputTokens = usage?.completion_tokens || 0;
      const totalTokens = usage?.total_tokens || 0;

      // return think texts in the think tags
      const cleanContent = content.split(/<think>|<\/think>/).filter((_, index) => index % 2 === 0).join('').trim();

      return {
        content: cleanContent,
        usage_metadata: {
          inputTokens,
          outputTokens,
          totalTokens
        }
      }
    } catch (error) {
      console.error('Minimax:', error);
      throw error;
    }
  }
}



// const fixSchemaErrors = async (output: string, schema: any): Promise<any> => {
//   const fixPrompt = `
// Fix this output
// Output: ${output} which does not align with the schema below
// Schema: ${zodToTs(schema)}
// Fix the output to match the schema.
// Return the fixed output in a \`\`\`json\` markup and do not include any other text.
// `


//   return [
//     { role: "system", content: 'You are a helpful assistant that fixes zod JSON schema errors.' },
//     { role: "user", content: fixPrompt }
//   ]
// }

// const messages_to_fix = `[
//   {
//     "File.insertAtMarker": {
//       "contentToInsert": "  async cancelSubscription(subscriptionId: string) {\n    const subscription = await this.stripe.subscriptions.cancel(subscriptionId);\n    return subscription;\n  }\n\n  async retrieveSubscription(subscriptionId: string) {\n    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);\n    return subscription;\n  }",
//       "filePath": "/Users/elijah/Desktop/faemous-api/src/integrations/ecommerce/StripeService.ts",
//       "marker": "  async listCustomers"
//     }
//   }
// ]`

// fixSchemaErrors(messages_to_fix, llmOutput).then(async messages => {

//   const minimaxApiKey = process.env.MINIMAX_API_KEY || '';
//   const minimax = new Minimax({
//     apiKey: minimaxApiKey,
//     model: 'MiniMax-M2',
//     temperature: 1,
//     maxTokens: 4000
//   });

//   const response = await minimax.invoke(messages);

//   console.log('OpenAI Response:', response.content);
//   console.log('Usage Metadata:', response.usage_metadata);
// }).catch(error => {
//   console.error('Error fixing schema errors:', error);
// });