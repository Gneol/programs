type GeminiConfig = {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
};

type Message = { role: 'system' | 'user' | 'assistant'; content: any | string };

/**
 * Gemini model wrapper using Google Generative Language API.
 * Returns a shape consistent with Deepseek / OpenAI-style invoke.
 */
export class Gemini {
  private config: GeminiConfig;
  private baseURL = 'https://generativelanguage.googleapis.com/v1beta/models';

  constructor(config: GeminiConfig) {
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
    // Gemini uses 'system_instruction' and 'contents'
    const systemMsg = messages.find(m => m.role === 'system');
    const conversation = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
    }));

    const body: Record<string, any> = {
      contents: conversation,
      generationConfig: {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxTokens,
      },
    };
    if (systemMsg) {
      body.systemInstruction = {
        parts: [{ text: typeof systemMsg.content === 'string' ? systemMsg.content : JSON.stringify(systemMsg.content) }],
      };
    }

    const url = `${this.baseURL}/${this.config.model}:generateContent?key=${this.config.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errBody}`);
    }

    const data = await response.json();

    const content =
      data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';

    // Gemini usage metadata (may be present in newer models)
    const usage = data.usageMetadata || {};
    const inputTokens = usage.promptTokenCount || 0;
    const outputTokens = usage.candidatesTokenCount || 0;

    return {
      content,
      usage_metadata: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        cachedTokens: usage.cachedContentTokenCount || 0,
      },
    };
  }
}
