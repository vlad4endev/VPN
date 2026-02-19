/**
 * Сервис конструктора сценариев: CRUD в Firestore, поиск по триггеру, кэширование.
 */

import {
  getScenariosCollectionPath,
  normalizeScenarioDoc,
  withCreatedAt,
  fromFirestore,
} from './botbuilder.model.js'
import {
  getCachedScenarios,
  setCachedScenarios,
  invalidateCachedScenarios,
} from './botbuilder.cache.js'

/**
 * Загрузить все сценарии из БД и записать в кэш. Вызывать при старте сервера и после CRUD.
 * @param {Object} db — Firestore
 * @param {string} appId
 */
export async function loadScenariosIntoCache(db, appId) {
  if (!db || !appId) return
  try {
    const path = getScenariosCollectionPath(appId)
    const snap = await db.collection(path).get()
    const scenarios = []
    snap.docs.forEach((d) => {
      const s = fromFirestore(d.id, d.data())
      if (s) scenarios.push(s)
    })
    await setCachedScenarios(appId, scenarios)
  } catch (err) {
    console.error('Bot-builder loadScenariosIntoCache:', err.message)
  }
}

/**
 * Найти сценарий по trigger_type и trigger_value. Сначала кэш, при пустом кэше — загрузка из БД.
 * @param {Object} db — Firestore
 * @param {string} appId
 * @param {string} trigger_type — command | text | callback
 * @param {string} trigger_value — например /start, PROFILE, hello
 * @returns {Promise<Object|null>} — BotScenario или null
 */
export async function findScenario(db, appId, trigger_type, trigger_value) {
  if (!db || !appId || !trigger_type || trigger_value == null) return null
  const value = String(trigger_value).trim()
  if (!value) return null

  let list = await getCachedScenarios(appId)
  if (list == null) {
    await loadScenariosIntoCache(db, appId)
    list = await getCachedScenarios(appId)
  }
  if (!Array.isArray(list) || list.length === 0) return null

  const found = list.find(
    (s) => s.trigger_type === trigger_type && s.trigger_value === value
  )
  return found || null
}

/**
 * Получить все сценарии (из кэша или БД).
 * @param {Object} db
 * @param {string} appId
 * @returns {Promise<Array<Object>>}
 */
export async function listScenarios(db, appId) {
  if (!db || !appId) return []
  let list = await getCachedScenarios(appId)
  if (list == null) {
    await loadScenariosIntoCache(db, appId)
    list = await getCachedScenarios(appId)
  }
  return Array.isArray(list) ? list : []
}

/**
 * Создать сценарий. Возвращает созданный документ с id.
 * @param {Object} db
 * @param {string} appId
 * @param {Object} body — trigger_type, trigger_value, response_type, response_text, keyboard_json?
 * @returns {Promise<Object>}
 */
export async function createScenario(db, appId, body) {
  if (!db || !appId) throw new Error('Сервис недоступен')
  const colPath = getScenariosCollectionPath(appId)
  const doc = withCreatedAt(normalizeScenarioDoc(body))
  const ref = await db.collection(colPath).add(doc)
  await invalidateCachedScenarios(appId)
  await loadScenariosIntoCache(db, appId)
  return { id: ref.id, ...doc }
}

/**
 * Обновить сценарий по id.
 * @param {Object} db
 * @param {string} appId
 * @param {string} id
 * @param {Object} body
 * @returns {Promise<Object>}
 */
export async function updateScenario(db, appId, id, body) {
  if (!db || !appId || !id) throw new Error('Не указан id сценария')
  const colPath = getScenariosCollectionPath(appId)
  const ref = db.collection(colPath).doc(id)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Сценарий не найден')
  const doc = normalizeScenarioDoc(body)
  await ref.update(doc)
  await invalidateCachedScenarios(appId)
  await loadScenariosIntoCache(db, appId)
  return { id, ...snap.data(), ...doc }
}

/**
 * Удалить сценарий по id.
 * @param {Object} db
 * @param {string} appId
 * @param {string} id
 */
export async function deleteScenario(db, appId, id) {
  if (!db || !appId || !id) throw new Error('Не указан id сценария')
  const colPath = getScenariosCollectionPath(appId)
  const ref = db.collection(colPath).doc(id)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Сценарий не найден')
  await ref.delete()
  await invalidateCachedScenarios(appId)
  await loadScenariosIntoCache(db, appId)
}
