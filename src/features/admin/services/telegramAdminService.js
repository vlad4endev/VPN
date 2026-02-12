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
 * Статус интеграции Telegram (бот настроен или нет). Только для админа.
 * @returns {Promise<{ configured: boolean }>}
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
  return { configured: Boolean(json.configured) }
}

/**
 * Сохранить токен бота в настройках (Firestore). Только для админа. Быстрая настройка без .env.
 * @param {string} token - токен от @BotFather
 * @returns {Promise<{ configured: boolean }>}
 */
export async function saveTelegramToken(token) {
  const res = await fetch(`${getBaseUrl()}/api/admin/telegram/settings`, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ token: token ? String(token).trim() : '' }),
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
