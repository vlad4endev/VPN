/**
 * Роуты конструктора сценариев бота. Все маршруты требуют роль admin.
 * Подключение: app.use('/api/bot-builder', createBotBuilderRouter(deps))
 *
 * @param {Object} deps — ensureAdmin(req, res) => Promise<{ok, uid}>, getDb(), APP_ID
 */

import express from 'express'
import * as controller from './botbuilder.controller.js'

export function createBotBuilderRouter(deps) {
  const { ensureAdmin, getDb, APP_ID } = deps
  const router = express.Router()

  router.use(express.json())

  const withContext = (req, res, next) => {
    req.db = getDb ? getDb() : null
    req.APP_ID = APP_ID || process.env.APP_ID || 'skyputh'
    next()
  }

  const requireAdmin = async (req, res, next) => {
    const result = await ensureAdmin(req, res)
    if (!result?.ok) return
    next()
  }

  router.post('/scenario', withContext, requireAdmin, controller.createScenario)
  router.get('/scenarios', withContext, requireAdmin, controller.listScenarios)
  router.put('/scenario/:id', withContext, requireAdmin, controller.updateScenario)
  router.delete('/scenario/:id', withContext, requireAdmin, controller.deleteScenario)

  return router
}
