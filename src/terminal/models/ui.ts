import { confirm, text, showPrompt } from '../utils/prompt';
import { licenseState } from '../utils/licenseStatus';
import { current, pushSystemMessage } from '../interface/chat';
import { invokeCli } from '../utils/cliInvoke';
import { modelsData } from './models';

interface ProviderInfo {
    apikeyurl: string;
    models: string[];
    type: string;
}

interface ModelsData {
    [provider: string]: ProviderInfo;
}

const typedModelsData: ModelsData = modelsData as any;

// Get LLM providers only (filtered by license status)
const getLlmProviders = (): string[] => {
    const allProviders = Object.entries(typedModelsData)
        .filter(([_, info]) => info.type === 'llm')
        .map(([provider]) => provider);
    
    if (!licenseState.valid) {
        // Free tier: only deepseek allowed
        return allProviders.filter(p => p === 'deepseek');
    }
    return allProviders;
};

export async function listModels() {
    try {
        // Get all models
        const models = await current.getModels();
        // pushSystemMessage(JSON.stringify(models, null, 2))
        // Get client models (custom ones)
        // const clientModels = await current.model.fetchModels();

        if (models.length === 0) {
            console.log('No models available.');
            pushSystemMessage && pushSystemMessage('No models available.');
            return;
        }

        // pushSystemMessage(models);

        // // Ask if user wants to select a model
        // // const shouldSelect = await confirm('Do you want to select a model?');
        // // if (shouldSelect) {
        // const customModelOptions = clientModels.data.map(model => ({
        //     label: `${model.name} (${model.provider}) [custom]`,
        //     value: model.id
        // }));
        const options = models.map(model => ({
            label: `${model.name} (${model.provider}) ${model.isdefault_llm ? '[default]' : ''}`,
            value: model.id
        }));

        // options.push(...customModelOptions);

        options.push({ label: 'Cancel', value: 'cancel' });

        const modelId = await showPrompt({
            message: 'Select a model to use:',
            type: 'select',
            options
        });

        if (modelId && modelId !== 'cancel') {
            await current.selectModel(modelId, 'llm');
            const selectedModel = models.find(m => m.id === modelId);
            current.llm = selectedModel.name;
            console.log(`\nModel switched to ${selectedModel.name}`);
            pushSystemMessage && pushSystemMessage(`Model switched to ${selectedModel.name}`);
        }
        // }

    } catch (error) {
        console.error('Error listing models:');
        pushSystemMessage && pushSystemMessage(error);
    }
}

const getOpenRouterModels = async (): Promise<string[]> => {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { 'Accept': 'application/json' }
        });
        const json = await response.json() as any;
        return json.data.map((m: any) => m.id);
    } catch {
        return [];
    }
};

const getOllamaModels = async (): Promise<string[]> => {
    const cmd = 'ollama ls';
    const response = await invokeCli(cmd);
    if (response.code !== 0) {
        return [];
    }
    const lines = response.stdout.trim().split('\n');
    return lines.slice(1).map(line => line.split(/\s+/)[0]);
}

export async function addModel() {
    try {
        console.log('\n=== Add Custom Model ===');

        const _llmProviders = getLlmProviders();
        // Select provider
        if (_llmProviders.length === 0) {
            console.log('No LLM providers available in models.json');
            pushSystemMessage && pushSystemMessage('No LLM providers available.');
            return;
        }

        const providerOptions = _llmProviders.map(provider => ({
            label: provider.charAt(0).toUpperCase() + provider.slice(1),
            value: provider
        }));

        providerOptions.push({ label: 'Cancel', value: 'cancel' });

        const selectedProvider = await showPrompt({
            message: 'Select provider:',
            type: 'select',
            options: providerOptions
        });

        if (!selectedProvider || selectedProvider === 'cancel') {
            console.log('Model addition cancelled.');
            return;
        }

        // Select model for the chosen provider
        const providerModels = selectedProvider === 'ollama' ? await getOllamaModels() : selectedProvider === 'openrouter' ? await getOpenRouterModels() : typedModelsData[selectedProvider].models;
        const modelOptions = providerModels.map(model => ({
            label: model,
            value: model
        }));

        modelOptions.push({ label: 'Cancel', value: 'cancel' });

        const selectedModel = await showPrompt({
            message: `Select ${selectedProvider} model:`,
            type: 'select',
            options: modelOptions
        });

        if (!selectedModel || selectedModel === 'cancel') {
            console.log('Model addition cancelled.');
            return;
        }

        // Colate options
        console.log('\n--- Model Options ---');
        const rateLimitStr = await text('Rate limit (e.g. "100/min" or leave empty for none):');
        const temperatureStr = await text('Temperature (0.0 - 1.0, e.g. "0.7" or leave empty for none):');
        const maxTokensStr = await text('Max tokens (e.g. "4096" or leave empty for none):');

        const addModelOptions: Record<string, any> = {};
        if (rateLimitStr.trim()) addModelOptions.rate_limit = rateLimitStr.trim();
        if (temperatureStr.trim()) addModelOptions.temperature = parseFloat(temperatureStr.trim());
        if (maxTokensStr.trim()) addModelOptions.max_tokens = parseInt(maxTokensStr.trim(), 10);

        // Get API key
        const apiSecret = await text(`API Secret for ${selectedProvider} (get from ${typedModelsData[selectedProvider].apikeyurl}):`);

        const confirmAdd = await confirm(`Add ${selectedModel} from ${selectedProvider}?`);
        if (confirmAdd) {
            try {
                const result = await current.addModel({
                    name: selectedModel,
                    provider: selectedProvider,
                    apiSecret: apiSecret.trim(),
                    options: addModelOptions,
                    type: 'llm'
                });

                if (result.status === 'success') {
                    console.log(`\nModel '${selectedModel}' added successfully!`);
                    pushSystemMessage && pushSystemMessage(`Model '${selectedModel}' added.`);
                } else {
                    console.log(`\nFailed to add model: ${JSON.stringify(result)}`);
                    pushSystemMessage && pushSystemMessage(`Failed to add model: ${result.data}`);
                }
            } catch (error) {
                console.error('Error adding model:', error);
                pushSystemMessage && pushSystemMessage('Error adding model.');
            }
        } else {
            console.log('Model addition cancelled.');
        }

    } catch (error) {
        console.error('Error adding model:', error);
        pushSystemMessage && pushSystemMessage('Error adding model.');
    }
}

export async function updateModel() {
    try {
        // Get client models (custom ones only)
        const models = await current.getModels();

        // Get client models (custom ones)
        // const clientModels = await current.model.fetchModels();

        if (models.length === 0) {
            console.log('No models available.');
            pushSystemMessage && pushSystemMessage('No models available.');
            return;
        }

        // pushSystemMessage(models);

        // // Ask if user wants to select a model
        // // const shouldSelect = await confirm('Do you want to select a model?');
        // // if (shouldSelect) {
        // const customModelOptions = clientModels.data.map(model => ({
        //     label: `${model.name} (${model.provider}) [custom]`,
        //     value: model.id
        // }));
        const options = models.map(model => ({
            label: `${model.name} (${model.provider}) ${model.isdefault_llm ? '[default]' : ''}`,
            value: model.id
        }));

        // options.push(...customModelOptions);

        options.push({ label: 'Cancel', value: 'cancel' });

        const modelId = await showPrompt({
            message: 'Update Model',
            type: 'select',
            options
        });

        if (!modelId || modelId === 'cancel') {
            console.log('Model deletion cancelled.');
            return;
        }

        const selectedModel = models.find(m => m.id === modelId);

        console.log(`\n=== Update Model: ${selectedModel.name} ===`);

        // Get new name - select from provider's available models
        const provider = selectedModel.provider;
        let providerModels: string[] = [];
        if (provider === 'ollama') {
            providerModels = await getOllamaModels();
        } else if (provider === 'openrouter') {
            providerModels = await getOpenRouterModels();
        } else if (typedModelsData[provider]) {
            providerModels = typedModelsData[provider].models;
        }

        let finalName = selectedModel.name;
        if (providerModels.length > 0) {
            const newModelOptions = providerModels.map(model => ({
                label: model,
                value: model
            }));
            newModelOptions.push({ label: `Keep current: "${selectedModel.name}"`, value: 'keep' });
            newModelOptions.push({ label: 'Cancel update', value: 'cancel' });

            const chosenModel = await showPrompt({
                message: `Select new model name for ${provider}:`,
                type: 'select',
                options: newModelOptions
            });

            if (chosenModel === 'cancel') {
                console.log('Model update cancelled.');
                return;
            }

            if (chosenModel !== 'keep') {
                finalName = chosenModel;
            }
        } else {
            const newName = await text(`Enter model name manually (current: "${selectedModel.name}"):`);
            if (newName.trim()) finalName = newName.trim();
        }

        // Get new API key
        // Colate options
        console.log('\n--- Model Options ---');
        const rateLimitStr = await text('Rate limit (e.g. "100/min" or leave empty to keep current):');
        const temperatureStr = await text('Temperature (0.0 - 1.0, e.g. "0.7" or leave empty to keep current):');
        const maxTokensStr = await text('Max tokens (e.g. "4096" or leave empty to keep current):');

        const modelOptions: Record<string, any> = {};
        if (rateLimitStr.trim()) modelOptions.rate_limit = rateLimitStr.trim();
        if (temperatureStr.trim()) modelOptions.temperature = parseFloat(temperatureStr.trim());
        if (maxTokensStr.trim()) modelOptions.max_tokens = parseInt(maxTokensStr.trim(), 10);

        const newApiSecret = await text(`New API Secret for ${selectedModel.provider} (leave empty to keep current):`);

        const confirmUpdate = await confirm(`Update model '${finalName}'?`);
        if (confirmUpdate) {
            try {
                const result = await current.updateModel(
                    modelId,
                    {
                        name: finalName,
                        options: modelOptions,
                        apiSecret: newApiSecret.trim()
                    }
                );

                if (result.status === 'success') {
                    console.log(`\nModel '${selectedModel.name}' updated successfully!`);
                    pushSystemMessage && pushSystemMessage(`Model '${selectedModel.name}' updated.`);
                } else {
                    console.log(`\nFailed to update model: ${result.data}`);
                    pushSystemMessage && pushSystemMessage(`Failed to update model: ${result.data}`);
                }
            } catch (error) {
                console.error('Error updating model:', error);
                pushSystemMessage && pushSystemMessage('Error updating model.');
            }
        } else {
            console.log('Model update cancelled.');
        }

    } catch (error) {
        console.error('Error updating model:', error);
        pushSystemMessage && pushSystemMessage('Error updating model.');
    }
}

export async function deleteModel() {
    try {
        // Get all models
        const models = await current.getModels();

        // Get client models (custom ones)
        // const clientModels = await current.model.fetchModels();

        if (models.length === 0) {
            console.log('No models available.');
            pushSystemMessage && pushSystemMessage('No models available.');
            return;
        }

        // pushSystemMessage(models);

        // // Ask if user wants to select a model
        // // const shouldSelect = await confirm('Do you want to select a model?');
        // // if (shouldSelect) {
        // const customModelOptions = clientModels.data.map(model => ({
        //     label: `${model.name} (${model.provider}) [custom]`,
        //     value: model.id
        // }));
        const options = models.map(model => ({
            label: `${model.name} (${model.provider}) ${model.isdefault_llm ? '[default]' : ''}`,
            value: model.id
        }));

        // options.push(...customModelOptions);

        options.push({ label: 'Cancel', value: 'cancel' });

        const modelId = await showPrompt({
            message: 'Delete model',
            type: 'select',
            options
        });

        if (!modelId || modelId === 'cancel') {
            console.log('Model deletion cancelled.');
            return;
        }

        const selectedModel = models.find(m => m.id === modelId);

        const confirmDelete = await confirm(`Are you sure you want to delete model '${selectedModel.name}'? This action cannot be undone.`);

        if (confirmDelete) {
            try {
                const result = await current.deleteModel(modelId);

                if (result.status === 'success') {
                    console.log(`\nModel '${selectedModel.name}' deleted successfully!`);
                    pushSystemMessage && pushSystemMessage(`Model '${selectedModel.name}' deleted.`);
                } else {
                    console.log(`\nFailed to delete model: ${result.data}`);
                    pushSystemMessage && pushSystemMessage(`Failed to delete model: ${result.data}`);
                }
            } catch (error) {
                console.error('Error deleting model:', error);
                pushSystemMessage && pushSystemMessage('Error deleting model.');
            }
        } else {
            console.log('Model deletion cancelled.');
        }

        deleteModel();

    } catch (error) {
        console.error('Error deleting model:', error);
        pushSystemMessage && pushSystemMessage('Error deleting model.');
    }
}
