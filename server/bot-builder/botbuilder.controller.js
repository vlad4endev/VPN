/**
 * Контроллер CRUD для сценариев бота (bot-builder).
 * Проверка admin выполняется в роутах.
 */

import * as botbuilderService from './botbuilder.service.js'

/**
 * POST /api/bot-builder/scenario — создать сценарий.
 * Body: { trigger_type, trigger_value, response_type, response_text, keyboard_json? }
 */
export async function createScenario(req, res) {
  const db = req.db ?? null
  const appId = req.APP_ID ?? process.env.APP_ID ?? 'skyputh'
  if (!db) {
    return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  }
  try {
    const body = req.body || {}
    const scenario = await botbuilderService.createScenario(db, appId, body)
    res.status(201).json({ success: true, scenario })
  } catch (err) {
    console.error('Bot-builder createScenario:', err.message)
    res.status(400).json({ success: false, error: err.message })
  }
}

/**
 * GET /api/bot-builder/scenarios — список сценариев.
 */
export async function listScenarios(req, res) {
  const db = req.db ?? null
  const appId = req.APP_ID ?? process.env.APP_ID ?? 'skyputh'
  if (!db) {
    return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  }
  try {
    const scenarios = await botbuilderService.listScenarios(db, appId)
    res.json({ success: true, scenarios })
  } catch (err) {
    console.error('Bot-builder listScenarios:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}

/**
 * PUT /api/bot-builder/scenario/:id — обновить сценарий.
 */
export async function updateScenario(req, res) {
  const db = req.db ?? null
  const appId = req.APP_ID ?? process.env.APP_ID ?? 'skyputh'
  const id = req.params?.id
  if (!db || !id) {
    return res.status(400).json({ success: false, error: 'Не указан id' })
  }
  try {
    const body = req.body || {}
    const scenario = await botbuilderService.updateScenario(db, appId, id, body)
    res.json({ success: true, scenario })
  } catch (err) {
    if (err.message === 'Сценарий не найден') {
      return res.status(404).json({ success: false, error: err.message })
    }
    console.error('Bot-builder updateScenario:', err.message)
    res.status(400).json({ success: false, error: err.message })
  }
}

/**
 * DELETE /api/bot-builder/scenario/:id — удалить сценарий.
 */
export async function deleteScenario(req, res) {
  const db = req.db ?? null
  const appId = req.APP_ID ?? process.env.APP_ID ?? 'skyputh'
  const id = req.params?.id
  if (!db || !id) {
    return res.status(400).json({ success: false, error: 'Не указан id' })
  }
  try {
    await botbuilderService.deleteScenario(db, appId, id)
    res.json({ success: true })
  } catch (err) {
    if (err.message === 'Сценарий не найден') {
      return res.status(404).json({ success: false, error: err.message })
    }
    console.error('Bot-builder deleteScenario:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
