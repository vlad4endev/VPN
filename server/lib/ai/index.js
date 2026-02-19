/**
 * Единый модуль ИИ: выбор провайдера (DeepSeek, OpenAI, OpenRouter, Gemini) и общий интерфейс chat().
 * Используется поддержкой (support-auto-reply, support-suggest), админкой (тест, аналитика) и /api/ai/chat.
 */

import { chat as deepseekChat } from './providers/deepseek.js'
import { chat as openaiChat } from './providers/openai.js'
import { chat as openrouterChat } from './providers/openrouter.js'
import { chat as geminiChat } from './providers/gemini.js'

export const PROVIDERS = {
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    chat: deepseekChat,
    defaultModel: 'deepseek-chat',
    envKey: 'DEEPSEEK_API_KEY',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    chat: openaiChat,
    defaultModel: 'gpt-4o-mini',
    envKey: 'OPENAI_API_KEY',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    chat: openrouterChat,
    defaultModel: 'openai/gpt-4o-mini',
    envKey: 'OPENROUTER_API_KEY',
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    chat: geminiChat,
    defaultModel: 'gemini-1.5-flash',
    envKey: 'GEMINI_API_KEY',
  },
}

/** Список моделей по провайдеру (для админки). */
export const PROVIDER_MODELS = {
  deepseek: [
    { value: 'deepseek-chat', label: 'deepseek-chat' },
    { value: 'deepseek-reasoner', label: 'deepseek-reasoner (128K)' },
  ],
  openai: [
    { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    { value: 'gpt-4o', label: 'gpt-4o' },
    { value: 'gpt-4-turbo', label: 'gpt-4-turbo' },
    { value: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo' },
  ],
  openrouter: [
    { value: 'openai/gpt-4o-mini', label: 'OpenAI gpt-4o-mini' },
    { value: 'openai/gpt-4o', label: 'OpenAI gpt-4o' },
    { value: 'google/gemini-2.0-flash-001', label: 'Google Gemini 2.0 Flash' },
    { value: 'anthropic/claude-3.5-sonnet', label: 'Anthropic Claude 3.5 Sonnet' },
    { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Meta Llama 3.3 70B' },
  ],
  gemini: [
    { value: 'gemini-1.5-flash', label: 'gemini-1.5-flash' },
    { value: 'gemini-1.5-pro', label: 'gemini-1.5-pro' },
    { value: 'gemini-2.0-flash-exp', label: 'gemini-2.0-flash-exp' },
  ],
}

/**
 * Универсальный вызов чата: по конфигу провайдера выбирается нужный клиент.
 *
 * @param {Array<{ role: 'system'|'user'|'assistant', content: string }>} messages
 * @param {{
 *   provider: 'deepseek'|'openai'|'openrouter'|'gemini',
 *   apiKey: string,
 *   model?: string,
 *   temperature?: number,
 *   max_tokens?: number,
 *   timeout?: number
 * }} config
 * @returns {Promise<{ ok: true, content: string, usage?: object } | { ok: false, error: string, code?: string }>}
 */
export async function unifiedChat(messages, config) {
  const providerId = (config?.provider || 'deepseek').toLowerCase()
  const provider = PROVIDERS[providerId]
  if (!provider) {
    return { ok: false, error: `Unknown AI provider: ${providerId}`, code: 'UNKNOWN_PROVIDER' }
  }

  const apiKey = config?.apiKey && String(config.apiKey).trim()
  if (!apiKey) {
    return { ok: false, error: `${provider.name}: API key not set`, code: 'NO_API_KEY' }
  }

  const model = config?.model && String(config.model).trim() || provider.defaultModel
  const opts = {
    apiKey,
    model,
    temperature: config?.temperature,
    max_tokens: config?.max_tokens,
    timeout: config?.timeout,
  }

  return provider.chat(messages, opts)
}
