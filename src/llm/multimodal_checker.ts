
// multimodal_checker.ts
import fs from 'fs';
import { modelList } from './model_list';


interface ProviderModels {
  [key: string]: {
    apikey?: string;
    models: string[];
    type: string;
  }
}

let cachedModels: ProviderModels | null = null;

function loadModels(): ProviderModels {
  if (cachedModels) return cachedModels;


  const providers = modelList;
  cachedModels = providers as any
  return cachedModels as any;
}

// console.log(loadModels());

/**
 * Checks if a given model supports multimodal input by referencing help.json model lists
 * and applying rules:
 * - All models in 'openai', 'anthropic', 'gemini' providers are multimodal.
 * - For 'grok' provider, only models containing 'grok-4ss' are multimodal.
 * @param provider - The AI provider key from help.json (e.g., 'openai', 'anthropic', 'grok', 'gemini')
 * @param model - The model name to check
 * @returns {boolean} True if multimodal, false otherwise
 */
export function isMultimodal(provider: string, model: string): boolean {
  const models = loadModels();
  const normalizedModel = model.toLowerCase();
  const providerKey = provider.toLowerCase();

  if (!(providerKey in models)) {
    return false; // Unknown provider
  }

  // Check if model exists in provider's list
  const providerModels = models[providerKey];
  const modelExists = providerModels.models.some(m => m.toLowerCase() === normalizedModel);
  if (!modelExists) {
    return false; // Model not recognized
  }

  // Apply multimodal rules based on provider
  switch (providerKey) {
    case 'openai':
      return true;
    case 'anthropic':
      return true;
    case 'gemini':
      return true;
    case 'grok':
      // return ['grok-'].includes(normalizedModel);
      return true;
    case 'kimi':
      return ['kimi-k2.5'].includes(normalizedModel);
    case 'minimax':
      return ["MiniMax-M2.5", "MiniMax-M2.5-highspeed", "MiniMax-M2.7", "MiniMax-M2.7-highspeed"].includes(normalizedModel)
    default:
      return false;
  }
}

// Example usage:
// console.log(isMultimodal('openai', 'gpt-4o')); // true (if in help.json)
// console.log(isMultimodal('grok', 'grok-4ss')); // true (if exists and matches rule)
// console.log(isMultimodal('grok', 'grok-beta')); // false