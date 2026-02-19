/**
 * OpenRouter API (OpenAI-compatible). Доступ ко многим моделям: OpenAI, Anthropic, Google, Meta и др.
 * https://openrouter.ai/docs/api-reference/chat-completion
 */

import axios from 'axios'

const BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'openai/gpt-4o-mini'

/**
 * @param {Array<{ role: 'system'|'user'|'assistant', content: string }>} messages
 * @param {{ apiKey: string, model?: string, temperature?: number, max_tokens?: number, timeout?: number }} options
 * @returns {Promise<{ ok: true, content: string, usage?: object } | { ok: false, error: string, code?: string }>}
 */
export async function chat(messages, options = {}) {
  const apiKey = options.apiKey && String(options.apiKey).trim()
  if (!apiKey) {
    return { ok: false, error: 'OpenRouter API key not set', code: 'NO_API_KEY' }
  }

  const model = (options.model || DEFAULT_MODEL).trim()
  const payload = {
    model,
    messages: Array.isArray(messages) && messages.length ? messages : [{ role: 'user', content: 'Hello' }],
    stream: false,
    temperature: options.temperature != null ? options.temperature : 0.7,
    max_tokens: options.max_tokens != null ? options.max_tokens : 2048,
  }

  try {
    const res = await axios.post(
      `${BASE_URL}/chat/completions`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': options.referer || 'https://skyputh.app',
        },
        timeout: ((options.timeout != null ? options.timeout : 60) * 1000),
        validateStatus: () => true,
      }
    )

    if (res.status !== 200) {
      const errBody = res.data && typeof res.data === 'object' ? res.data : {}
      const errMsg = errBody.error?.message || errBody.message || res.statusText || `HTTP ${res.status}`
      return { ok: false, error: errMsg, code: errBody.error?.code || `HTTP_${res.status}` }
    }

    const data = res.data || {}
    const choices = data.choices
    if (!Array.isArray(choices) || choices.length === 0) {
      return { ok: false, error: 'Empty response from model', code: 'EMPTY_RESPONSE' }
    }

    const first = choices[0]
    const content = (first.message && first.message.content) ? String(first.message.content).trim() : ''
    return { ok: true, content, usage: data.usage }
  } catch (err) {
    const message = err.response?.data?.error?.message || err.response?.data?.message || err.message || 'OpenRouter request failed'
    const code = err.code === 'ECONNABORTED' ? 'TIMEOUT' : (err.response?.data?.error?.code || err.code || 'NETWORK_ERROR')
    return { ok: false, error: message, code }
  }
}

export const defaultModel = DEFAULT_MODEL
