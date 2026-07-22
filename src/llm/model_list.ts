

export const modelList = {
    "openai": {
        "apikeyurl": "https://platform.openai.com/api-keys",
        "models": [
            "gpt-4o",
            "gpt-4o-mini",
            "gpt-4-turbo",
            "gpt-3.5-turbo",
            "gpt-3.5-turbo-instruct",
            "gpt-4o-2024-05-13",
            "gpt-4-1106-preview"
        ],
        "type": "llm"
    },
    "anthropic": {
        "apikeyurl": "https://console.anthropic.com/settings/keys",
        "models": [
            "claude-sonnet-4-6",
            "claude-opus-4-7",
            "claude-haiku-4-5-20251001"

        ],
        "type": "llm"
    },
    "gemini": {
        "apikeyurl": "https://aistudio.google.com/apikey",
        "models": [
            "gemini-3-pro-preview",
            "gemini-2.5-pro",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-2.5-flash-lite",
            "gemma-3-27b-it"
        ],
        "type": "llm"
    },
    "deepseek": {
        "apikeyurl": "https://platform.deepseek.com/api_keys",
        "models": [
            "deepseek-chat",
            "deepseek-reasoner"
        ],
        "type": "llm"
    },
    "grok": {
        "apikeyurl": "https://console.x.ai",
        "models": [
            "grok-code-fast-1",
            "grok-4.1-fast-reasoning",
            "grok-4.1-fast-non-reasoning",
            "grok-4-fast-reasoning",
            "grok-4-fast-non-reasoning",
            "grok-4-0709",
            "grok-3"
        ]
    },
    "elevenlabs": {
        "apikeyurl": "https://elevenlabs.io/app/developers",
        "models": [
            "eleven_monolingual_v1",
            "eleven_multilingual_v2",
            "eleven_ttv_v3",
            "eleven_flash_v2_5",
            "eleven_flash_v2"
        ],
        "type": "tts"
    },
    "assemblyai": {
        "apikeyurl": "https://www.assemblyai.com/dashboard/api-keys",
        "models": [
            "universal-streaming"
        ],
        "type": "stt"
    },
    "gemini_tts": {
        "apikeyurl": "https://aistudio.google.com/apikey",
        "models": [
            "gemini-2.5-flash-preview-tts",
            "gemini-2.5-pro-preview-tts"
        ],
        "type": "tts"
    },
    "kimi": {
        "apikeyurl": "https://platform.moonshot.ai/console/api-keys",
        "models": [
            "kimi-k2.5",
            "kimi-k2-turbo-preview",
            "kimi-k2-thinking",
            "kimi-k2-thinking-turbo",
            "kimi-k2-0905-preview"
        ],
        "type": "llm"   
    },
    "minimax": {
        "apikeyurl": "https://platform.minimax.io/user-center/basic-information/interface-key",
        "models": [
            "MiniMax-M2.5",
            "MiniMax-M2.1",
            "MiniMax-M2.1-lightning",
            "MiniMax-M2",
            "M2-her"
        ],
        "type": "llm"
    }
}