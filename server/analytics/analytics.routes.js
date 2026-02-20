/**
 * Роуты AI-воронки аналитики. Все маршруты требуют роль admin.
 * Подключение: app.use('/api/analytics', createAnalyticsRouter(deps))
 *
 * @param {Object} deps — ensureAdmin, getDb, APP_ID, redisGet, redisSet, getTelegramToken?, sendTelegramMessage?, getBaseUrlForTelegram?, getActiveAiConfig?, unifiedChat?
 */

import express from 'express'
import * as controller from './analytics.controller.js'

export function createAnalyticsRouter(deps) {
  const {
    ensureAdmin,
    getDb,
    APP_ID,
    redisGet,
    redisSet,
    getTelegramToken,
    sendTelegramMessage,
    getBaseUrlForTelegram,
    getActiveAiConfig,
    unifiedChat,
  } = deps
  const router = express.Router()

  router.use(express.json())

  const withContext = (req, res, next) => {
    req.db = getDb ? getDb() : null
    req.APP_ID = APP_ID || process.env.APP_ID || 'skyputh'
    req.redisGet = redisGet || (() => Promise.resolve(null))
    req.redisSet = redisSet || (() => Promise.resolve())
    req.getTelegramToken = getTelegramToken || null
    req.sendTelegramMessage = sendTelegramMessage || null
    req.getBaseUrlForTelegram = getBaseUrlForTelegram || null
    req.getActiveAiConfig = getActiveAiConfig || null
    req.unifiedChat = unifiedChat || null
    next()
  }

  const requireAdmin = async (req, res, next) => {
    const result = await ensureAdmin(req, res)
    if (!result?.ok) return
    next()
  }

  router.get('/funnel', withContext, requireAdmin, controller.getFunnel)
  router.get('/user/:id', withContext, requireAdmin, controller.getUser)
  router.post('/refresh-metrics', withContext, requireAdmin, controller.refreshMetrics)
  router.post('/send-churn-offer/:id', withContext, requireAdmin, controller.sendChurnOffer)
  router.post('/ai-strategy', withContext, requireAdmin, controller.aiStrategy)
  router.post('/ai-funnel-analysis', withContext, requireAdmin, controller.aiFunnelAnalysis)

  return router
}
