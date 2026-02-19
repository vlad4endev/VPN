/**
 * Модель BotScenario для конструктора сценариев Telegram-бота.
 * Хранится в Firestore: artifacts/${APP_ID}/public/data/bot_scenarios
 *
 * Поля: id, trigger_type (command|text|callback), trigger_value, response_type (text|keyboard),
 * response_text, keyboard_json (inline_keyboard), created_at, updated_at.
 */

const TRIGGER_TYPES = ['command', 'text', 'callback']
const RESPONSE_TYPES = ['text', 'keyboard']

/**
 * Путь к коллекции сценариев в Firestore.
 * @param {string} appId
 * @returns {string}
 */
export function getScenariosCollectionPath(appId) {
  return `artifacts/${appId}/public/data/bot_scenarios`
}

/**
 * Нормализовать данные сценария для записи в БД.
 * @param {Object} raw — поля с фронта
 * @returns {Object} — документ для Firestore (без id)
 */
export function normalizeScenarioDoc(raw) {
  const trigger_type = TRIGGER_TYPES.includes(raw.trigger_type) ? raw.trigger_type : 'text'
  const trigger_value = typeof raw.trigger_value === 'string' ? raw.trigger_value.trim() : ''
  const response_type = RESPONSE_TYPES.includes(raw.response_type) ? raw.response_type : 'text'
  const response_text = typeof raw.response_text === 'string' ? raw.response_text.trim() : ''
  let keyboard_json = null
  if (raw.keyboard_json != null) {
    if (typeof raw.keyboard_json === 'string') {
      try {
        keyboard_json = JSON.parse(raw.keyboard_json)
      } catch {
        keyboard_json = null
      }
    } else if (Array.isArray(raw.keyboard_json)) {
      keyboard_json = raw.keyboard_json
    } else if (raw.keyboard_json && typeof raw.keyboard_json === 'object' && Array.isArray(raw.keyboard_json.inline_keyboard)) {
      keyboard_json = raw.keyboard_json.inline_keyboard
    } else if (raw.keyboard_json && typeof raw.keyboard_json === 'object') {
      keyboard_json = raw.keyboard_json
    }
  }
  const now = new Date().toISOString()
  return {
    trigger_type,
    trigger_value,
    response_type,
    response_text,
    keyboard_json: keyboard_json || null,
    updated_at: now,
  }
}

/**
 * Добавить created_at при создании (остальное в normalizeScenarioDoc).
 * @param {Object} doc — результат normalizeScenarioDoc
 * @returns {Object}
 */
export function withCreatedAt(doc) {
  const created_at = doc.created_at || new Date().toISOString()
  return { ...doc, created_at }
}

/**
 * Преобразовать документ Firestore в объект с id.
 * @param {string} id — id документа
 * @param {Object} data — data из snap.data()
 * @returns {Object} — BotScenario
 */
export function fromFirestore(id, data) {
  if (!data) return null
  return {
    id,
    trigger_type: data.trigger_type || 'text',
    trigger_value: data.trigger_value || '',
    response_type: data.response_type || 'text',
    response_text: data.response_text || '',
    keyboard_json: data.keyboard_json ?? null,
    created_at: data.created_at || null,
    updated_at: data.updated_at || null,
  }
}
