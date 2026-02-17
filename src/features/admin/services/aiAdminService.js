import { auth } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'

const APP_ID_HEADER = 'X-App-Id'

function getBaseUrl() {
  return typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
    : ''
}

async function getAuthHeaders() {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
  if (!token) throw new Error('Требуется авторизация')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    [APP_ID_HEADER]: APP_ID,
  }
}

/**
 * Статус настройки ИИ (без токена). Только админ.
 * @returns {Promise<{ configured: boolean, model: string, temperature: number, maxTokens: number, timeoutSeconds: number, systemPromptPreset: string }>}
 */
export async function getAiStatus() {
  const res = await fetch(`${getBaseUrl()}/api/admin/ai/status`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    if (res.status === 404) {
      throw new Error(
        'API ИИ не найден (404). Запустите или перезапустите backend (n8n-webhook-proxy) на порту 3001 и убедитесь, что в проекте есть маршруты /api/admin/ai/*.',
      )
    }
    if (res.status === 403) {
      throw new Error(json.hint || json.error || 'Доступ запрещён.')
    }
    throw new Error(json.error || res.statusText || 'Ошибка загрузки статуса ИИ')
  }
  return {
    configured: Boolean(json.configured),
    model: json.model ?? 'deepseek-chat',
    temperature: json.temperature != null ? Number(json.temperature) : 0.7,
    maxTokens: json.maxTokens != null ? Number(json.maxTokens) : 2048,
    timeoutSeconds: json.timeoutSeconds != null ? Number(json.timeoutSeconds) : 60,
    systemPromptPreset: json.systemPromptPreset != null ? String(json.systemPromptPreset) : '',
  }
}

/**
 * Сохранить настройки ИИ в Firestore. Только админ.
 * @param {{ apiKey?: string, model?: string, temperature?: number, maxTokens?: number, timeoutSeconds?: number, systemPromptPreset?: string }} opts
 * @returns {Promise<{ configured: boolean, savedTo: string }>}
 */
export async function saveAiSettings(opts = {}) {
  const body = {}
  if (opts.apiKey !== undefined) body.apiKey = opts.apiKey ? String(opts.apiKey).trim() : ''
  if (opts.model !== undefined) body.model = opts.model != null ? String(opts.model).trim() : ''
  if (opts.temperature !== undefined) body.temperature = opts.temperature
  if (opts.maxTokens !== undefined) body.maxTokens = opts.maxTokens
  if (opts.timeoutSeconds !== undefined) body.timeoutSeconds = opts.timeoutSeconds
  if (opts.systemPromptPreset !== undefined) body.systemPromptPreset = opts.systemPromptPreset != null ? String(opts.systemPromptPreset) : ''
  const res = await fetch(`${getBaseUrl()}/api/admin/ai/settings`, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    if (res.status === 404) {
      throw new Error(
        'API ИИ не найден (404). Запустите backend (n8n-webhook-proxy) на порту 3001.',
      )
    }
    if (res.status === 403) {
      throw new Error(json.hint || json.error || 'Доступ запрещён.')
    }
    throw new Error(json.error || res.statusText || 'Ошибка сохранения настроек ИИ')
  }
  return { configured: Boolean(json.configured), savedTo: json.savedTo || 'firestore' }
}

/**
 * Тестовый запрос к ИИ (POST /api/ai/chat). Только админ.
 * @param {{ messages: Array<{ role: string, content: string }>, model?: string, temperature?: number, max_tokens?: number }} opts
 * @returns {Promise<{ success: boolean, content?: string, usage?: object, error?: string }>}
 */
export async function sendAiChat(opts = {}) {
  const res = await fetch(`${getBaseUrl()}/api/ai/chat`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      messages: opts.messages || [{ role: 'user', content: 'Привет, ответь одним словом.' }],
      model: opts.model,
      temperature: opts.temperature,
      max_tokens: opts.max_tokens,
      timeout: opts.timeout,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { success: false, error: json.error || res.statusText || 'Ошибка запроса к ИИ' }
  }
  return {
    success: Boolean(json.success),
    content: json.content,
    usage: json.usage,
    error: json.error,
  }
}

/**
 * Предложить ответ по тикету поддержки (ИИ анализирует вопрос и данные пользователя). Только админ.
 * @param {string} ticketId - ID тикета
 * @returns {Promise<{ success: boolean, reply?: string, escalate?: boolean, userWarning?: string, escalateReason?: string, error?: string }>}
 */
export async function getSupportSuggestReply(ticketId) {
  const res = await fetch(`${getBaseUrl()}/api/ai/support-suggest`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ ticketId: String(ticketId).trim() }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    return {
      success: false,
      error: json.error || res.statusText || 'Ошибка формирования ответа ИИ',
    }
  }
  return {
    success: Boolean(json.success),
    reply: json.reply,
    escalate: Boolean(json.escalate),
    userWarning: json.userWarning,
    escalateReason: json.escalateReason,
    error: json.error,
  }
}
