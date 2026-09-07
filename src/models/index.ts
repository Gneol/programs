import { LLMModel, BaseModelConfig, Provider, ModelResult } from './types.js';
import { invokeModel, onCompleteInvokation, onErrorOnInvokation } from '../llm/core.js';
import { OpenAIModel } from './openai.js';
import { Deepseek } from './deepseek.js';
import { OpenRouter } from './openrouter.js';
import { Grok } from './grok.js';
import { KimiK2 } from './kimi.js';
import { Minimax } from './minimax.js';
import { Gemini } from './gemini.js';
import { Anthropic } from './anthropic.js';
import { Ollama } from './ollama.js';
import { CacheEngine, ModelCacheData } from './cache.js';
import { ModelBinding } from '../program/types.js';
import { RateLimiter } from 'ttc-rate-limit';
import crypto from 'crypto';

const REQUIRED_API_KEY: Provider[] = [
  'openai', 'deepseek', 'openrouter', 'grok', 'kimi', 'minimax', 'gemini', 'anthropic'
];


export type TaskResponse = {
  content: string,
  clean: any,
  status: 'success' | 'error',
  error: boolean,
  usage_metadata: {
    inputTokens: number,
    outputTokens: number,
    totalTokens: number,
    cachedTokens
  }
}

export const cacheEngine = new CacheEngine<ModelCacheData>();

async function createLLMInstance(config: BaseModelConfig): Promise<LLMModel> {
  if (REQUIRED_API_KEY.includes(config.provider as any) && !config.apiKey) {
    throw new Error(`Provider '${config.provider}' requires an apiKey`);
  }

  switch (config.provider) {
    case 'openai':
      return new OpenAIModel({ ...config, apiKey: config.apiKey! });
    case 'deepseek':
      return new Deepseek({ ...config, apiKey: config.apiKey!, model: config.model as any });
    case 'openrouter':
      return new OpenRouter({ ...config, apiKey: config.apiKey! });
    case 'grok':
      return new Grok({ ...config, apiKey: config.apiKey! });
    case 'kimi':
      return new KimiK2({ ...config, apiKey: config.apiKey! });
    case 'minimax':
      return new Minimax({ ...config, apiKey: config.apiKey! });
    case 'gemini':
      return new Gemini({ ...config, apiKey: config.apiKey! });
    case 'anthropic':
      return new Anthropic({ ...config, apiKey: config.apiKey! });
    case 'ollama':
      return new Ollama(config);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

export async function ModelInstance(config: BaseModelConfig): Promise<ModelCacheData> {
  const cacheKey = config.tag ?? `${config.provider}:${config.model}`;
  // console.log(cacheKey, 'CACHE KEY!!');
  const cached = await cacheEngine.get(cacheKey);
  if (cached) {
    // If cached entry was created with a missing/stale API key but we now have
    // a key (or the model/provider changed), invalidate so we rebuild the instance.
    const sameProvider = cached.provider === config.provider;
    const sameModel = cached.name === config.model;
    const sameKey = cached.apiKey === (config.apiKey ?? undefined);
    if (sameProvider && sameModel && sameKey) return cached;
    await cacheEngine.invalidate(cacheKey);
  }

  // console.log(config.apiKey, config.program);
  const llm = await createLLMInstance(config);

  const rateLimit = config.rateLimit ?? 20;
  // console.log('register .....')

  const rateLimiter = new RateLimiter<string, TaskResponse>({
    id: cacheKey,
    request: rateLimit,
    per: 'minute',
    mode: 'burst',
    maxRetry: 2,
    cb: async (soulId: string): Promise<TaskResponse> => {
      return await invokeModel(llm, soulId);
    },
  });

  rateLimiter.on('completed', async (response) => await onCompleteInvokation(response));
  rateLimiter.on('error', async (error) => await onErrorOnInvokation(error));


  const invoke = async (soulId: string) => {
    await rateLimiter.invoke(soulId, {
      _urId: soulId
    });
  };

  const data: ModelCacheData = {
    id: cacheKey,
    llm,
    program: config.program,
    rateLimiter,
    name: config.model,
    provider: config.provider,
    apiKey: config.apiKey,
    options: {
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      rate_limit: rateLimit,
    },
    invoke
  };

  await cacheEngine.cache(cacheKey, data, 60 * 60); // 1 hour TTL
  return data;
}


/** Pre‑seed the model cache from the model bindings declared in a program */
export async function preloadModelsFromBindings(
  bindings: ModelBinding[],
  envStore: Record<string, string> = {},
  programPath: string
): Promise<void> {

  for (const binding of bindings) {
    if (!binding.provider) {
      console.warn(`Model binding "${binding.tag}" has no provider; skipping.`);
      continue;
    }

    // if(cacheEngine.get(binding.tag)){
    //   continue;
    // }

    // Resolve apiKey: look up in envStore, then process.env, then fallback to literal
    let resolvedKey: string | undefined;
    if (binding.apiKey) {
      // Order: loaded env file → process.env → internal token store.
      // (The final fallback here should never be the literal env var name —
      // that would cache a bogus key. Callers are expected to have run
      // runtime.resolveEnv() already, which pulls from the token store.)
      resolvedKey = envStore[binding.apiKey] ?? process.env[binding.apiKey];
    }

    const config: BaseModelConfig = {
      tag: binding.tag,
      provider: binding.provider,
      model: binding.modelId,
      temperature: binding.temperature ?? 0.7,
      maxTokens: binding.maxTokens ?? 2048,
      apiKey: resolvedKey,
      program: programPath,
      rateLimit: binding.rateLimit
    };
    try {
      await ModelInstance(config);
      // console.log(`Pre‑cached model "${binding.tag}" (${binding.provider}:${binding.modelId})`);
    } catch (err: any) {
      console.warn(`Failed to pre‑cache model "${binding.tag}": ${err.message}`);
    }
  }
}
