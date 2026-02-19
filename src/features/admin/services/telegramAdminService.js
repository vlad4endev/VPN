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
 * Текущие настройки Telegram (без токена). Только для админа.
 * @returns {Promise<{ configured: boolean, adminChatIdSet?: boolean, adminChatId?: string | null, botUsername?: string | null }>}
 */
export async function getTelegramStatus() {
  const url = `${getBaseUrl()}/api/admin/telegram/status`
  const res = await fetch(url, {
    method: 'GET',
    headers: await getAuthHeaders(),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    if (res.status === 404) {
      throw new Error('API Telegram не найден (404). Запустите или перезапустите backend (n8n-webhook-proxy) на порту 3001.')
    }
    if (res.status === 403) {
      throw new Error(json.hint || json.error || 'Доступ запрещён. Задайте role: admin в Firestore или ADMIN_EMAILS в server/.env.')
    }
    throw new Error(json.error || res.statusText || 'Ошибка загрузки статуса')
  }
  return {
    configured: Boolean(json.configured),
    adminChatIdSet: Boolean(json.adminChatIdSet),
    adminChatId: json.adminChatId ?? null,
    botUsername: json.botUsername ?? null,
  }
}

/**
 * Сохранить токен бота в настройках (Firestore). Только для админа.
 * @param {string} token - токен от @BotFather
 * @returns {Promise<{ configured: boolean }>}
 */
export async function saveTelegramToken(token) {
  return saveTelegramSettings({ token: token ? String(token).trim() : '' })
}

/**
 * Сохранить настройки Telegram (токен и/или Chat ID админа). Только для админа.
 * @param {{ token?: string, adminChatId?: string }} opts - token и/или adminChatId (пустая строка = удалить)
 * @returns {Promise<{ configured: boolean }>}
 */
export async function saveTelegramSettings(opts = {}) {
  const body = {}
  if (opts.token !== undefined) body.token = opts.token ? String(opts.token).trim() : ''
  if (opts.adminChatId !== undefined) body.adminChatId = opts.adminChatId ? String(opts.adminChatId).trim() : ''
  const res = await fetch(`${getBaseUrl()}/api/admin/telegram/settings`, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    if (res.status === 403) {
      throw new Error(json.hint || json.error || 'Доступ запрещён. Задайте role: admin в Firestore или ADMIN_EMAILS в server/.env.')
    }
    throw new Error(json.error || res.statusText || 'Ошибка сохранения')
  }
  return { configured: Boolean(json.configured) }
}

/**
 * Установить webhook для бота одной кнопкой. Только для админа.
 * @returns {Promise<{ webhookUrl?: string }>}
 */
export async function setTelegramWebhook() {
  const res = await fetch(`${getBaseUrl()}/api/admin/telegram/set-webhook`, {
    method: 'POST',
    headers: await getAuthHeaders(),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    if (res.status === 403) {
      throw new Error(json.hint || json.error || 'Доступ запрещён. Задайте role: admin в Firestore или ADMIN_EMAILS в server/.env.')
    }
    throw new Error(json.error || res.statusText || 'Ошибка установки webhook')
  }
  return { webhookUrl: json.webhookUrl }
}

/**
 * Информация о текущем webhook бота. Только для админа.
 * @returns {Promise<{ webhookInfo?: object }>}
 */
export async function getWebhookStatus() {
  const url = `${getBaseUrl()}/api/admin/telegram/webhook-status`
  const res = await fetch(url, {
    method: 'GET',
    headers: await getAuthHeaders(),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    if (res.status === 403) {
      throw new Error(json.hint || json.error || 'Доступ запрещён.')
    }
    throw new Error(json.error || res.statusText || 'Ошибка загрузки')
  }
  return { webhookInfo: json.webhookInfo }
}

/**
 * Получить данные чата/аккаунта по сохранённому Chat ID админа (getChat). Только для админа.
 * @returns {Promise<{ chat: { id, type, title?, username?, first_name?, last_name? } | null, error?: string }>}
 */
export async function getTelegramChatInfo() {
  const res = await fetch(`${getBaseUrl()}/api/admin/telegram/chat-info`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(json.error || res.statusText || 'Ошибка загрузки')
  }
  return {
    chat: json.chat ?? null,
    error: json.error ?? null,
  }
}

/**
 * Отправить тестовое уведомление на указанный Telegram ID (chat_id). Только для админа.
 * @param {string} chatId - Telegram ID получателя (число или строка)
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export async function sendTestMessage(chatId) {
  const id = (chatId != null && chatId !== '') ? String(chatId).trim() : ''
  if (!id) throw new Error('Укажите Telegram ID (chat_id)')
  const res = await fetch(`${getBaseUrl()}/api/admin/telegram/send-test`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ chatId: id }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    if (res.status === 403) {
      throw new Error(json.hint || json.error || 'Доступ запрещён.')
    }
    throw new Error(json.error || res.statusText || 'Ошибка отправки')
  }
  return { success: true, message: json.message }
}

const DEFAULT_SCENARIO = {
  welcomeMessage: '',
  menuMessage: '',
  menuButtons: [],
  callbackResponses: {},
}

/**
 * Получить сценарий бота (тексты и кнопки). Только для админа.
 * @returns {Promise<{ scenario: { welcomeMessage: string, menuMessage: string, menuButtons: Array, callbackResponses: Object } }>}
 */
export async function getTelegramScenario() {
  const res = await fetch(`${getBaseUrl()}/api/admin/telegram/scenario`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    if (res.status === 403) throw new Error(json.hint || json.error || 'Доступ запрещён.')
    throw new Error(json.error || res.statusText || 'Ошибка загрузки сценария')
  }
  return { scenario: json.scenario || DEFAULT_SCENARIO }
}

/**
 * Сохранить сценарий бота в Firestore. Только для админа.
 * @param {{ welcomeMessage?: string, menuMessage?: string, menuButtons?: Array, callbackResponses?: Object }} scenario
 * @returns {Promise<{ success: boolean }>}
 */
export async function saveTelegramScenario(scenario) {
  const res = await fetch(`${getBaseUrl()}/api/admin/telegram/scenario`, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ scenario: scenario || DEFAULT_SCENARIO }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    if (res.status === 403) throw new Error(json.hint || json.error || 'Доступ запрещён.')
    throw new Error(json.error || res.statusText || 'Ошибка сохранения сценария')
  }
  return { success: true }
}
