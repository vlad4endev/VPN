/**
 * Клиент DeepSeek API (OpenAI-совместимый).
 * Используется для автоматизации: ответы в поддержку, суммаризация, классификация и т.д.
 *
 * Документация: https://api-docs.deepseek.com/
 * Модели: deepseek-chat (обычный), deepseek-reasoner (режим рассуждений, 128K контекст).
 */

import axios from 'axios'

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'

/**
 * Получить API-ключ из окружения (DEEPSEEK_API_KEY). Для ключа из Firestore вызывающий код передаёт options.apiKey.
 * @returns {string}
 */
export function getApiKey() {
  const key = process.env.DEEPSEEK_API_KEY
  return (key && typeof key === 'string' ? key.trim() : '') || ''
}

/**
 * Проверка доступности DeepSeek по ключу из env. Если ключ берётся из Firestore, проверяйте доступность на стороне сервера (передав apiKey в options).
 * @returns {boolean}
 */
export function isAvailable() {
  return getApiKey().length > 0
}

/**
 * Вызов Chat Completions API (без стриминга).
 *
 * @param {Array<{ role: 'system'|'user'|'assistant', content: string }>} messages - массив сообщений
 * @param {{ model?: string, temperature?: number, max_tokens?: number, stream?: boolean }} [options]
 * @returns {Promise<{ ok: true, content: string, usage?: object } | { ok: false, error: string, code?: string }>}
 */
export async function chat(messages, options = {}) {
  const apiKey = (options.apiKey != null && String(options.apiKey).trim()) ? String(options.apiKey).trim() : getApiKey()
  if (!apiKey) {
    return { ok: false, error: 'API-ключ не задан (DEEPSEEK_API_KEY в .env или настройки ИИ в админке)', code: 'NO_API_KEY' }
  }

  const model = (options.model || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL).trim()
  const payload = {
    model,
    messages: Array.isArray(messages) && messages.length ? messages : [{ role: 'user', content: 'Hello' }],
    stream: options.stream === true,
    temperature: options.temperature != null ? options.temperature : 0.7,
    max_tokens: options.max_tokens != null ? options.max_tokens : 2048,
  }

  try {
    const res = await axios.post(
      `${DEEPSEEK_BASE_URL}/chat/completions`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: (options.timeout != null ? options.timeout : 60) * 1000,
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
      return { ok: false, error: 'Пустой ответ от модели', code: 'EMPTY_RESPONSE' }
    }

    const first = choices[0]
    const content = (first.message && first.message.content) ? String(first.message.content).trim() : ''
    const usage = data.usage || undefined

    return { ok: true, content, usage }
  } catch (err) {
    const message = err.response?.data?.error?.message || err.response?.data?.message || err.message || 'Ошибка запроса к DeepSeek'
    const code = err.code === 'ECONNABORTED' ? 'TIMEOUT' : (err.response?.data?.error?.code || err.code || 'NETWORK_ERROR')
    return { ok: false, error: message, code }
  }
}

/**
 * Удобный вызов с одним системным промптом и одним пользовательским сообщением.
 *
 * @param {string} userMessage - текст от пользователя
 * @param {string} [systemPrompt] - системный промпт (роль ассистента)
 * @param {{ model?: string, temperature?: number, max_tokens?: number }} [options]
 * @returns {Promise<{ ok: true, content: string, usage?: object } | { ok: false, error: string, code?: string }>}
 */
export async function complete(userMessage, systemPrompt = '', options = {}) {
  const messages = []
  if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt.trim() })
  }
  messages.push({ role: 'user', content: typeof userMessage === 'string' ? userMessage : String(userMessage) })
  return chat(messages, options)
}
