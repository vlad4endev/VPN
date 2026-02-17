/**
 * Production-ready модуль Telegram Bot (Webhook).
 * Интеграция: подключаете роутер к Express и при необходимости — setWebhook.
 *
 * Пример:
 *   import telegramBot from './telegram-bot/index.js'
 *   const { webhookRouter, setWebhook, getWebhookInfo } = telegramBot(configOverrides)
 *   app.use(express.json())
 *   app.post('/api/telegram/webhook', webhookRouter)
 *   // Установка webhook (один раз или по кнопке админки):
 *   await setWebhook()
 */

import express from 'express'
import config from './config.js'
import {
  createSecretTokenMiddleware,
  createRateLimitMiddleware,
  createRequestLoggerMiddleware,
  createValidateUpdateMiddleware,
} from './middleware/index.js'
import { createStateStore } from './services/stateStore.js'
import { createUserLogger } from './services/userLogger.js'
import { createWebhookRouter } from './router.js'

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

/**
 * Создать и установить webhook в Telegram (setWebhook с secret_token и allowed_updates).
 * @param {object} [overrides] - переопределение config (например publicUrl, webhookSecret)
 * @returns {Promise<{ ok: boolean, url?: string, error?: string }>}
 */
export async function setWebhook(overrides = {}) {
  const cfg = { ...config, ...overrides }
  const token = cfg.botToken
  const url = cfg.publicUrl
  if (!token || !url) {
    return { ok: false, error: 'botToken и publicUrl обязательны' }
  }
  const webhookUrl = `${url.replace(/\/+$/, '')}/api/telegram/webhook`
  const body = {
    url: webhookUrl,
    allowed_updates: ['message', 'edited_message', 'callback_query'],
  }
  if (cfg.webhookSecret) body.secret_token = cfg.webhookSecret
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!data.ok) return { ok: false, error: data.description || res.statusText }
    return { ok: true, url: webhookUrl }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * Получить информацию о текущем webhook (getWebhookInfo).
 */
export async function getWebhookInfo(overrides = {}) {
  const cfg = { ...config, ...overrides }
  const token = cfg.botToken
  if (!token) return { ok: false, error: 'botToken обязателен' }
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}${token}/getWebhookInfo`)
    const data = await res.json().catch(() => ({}))
    if (!data.ok) return { ok: false, error: data.description }
    return { ok: true, result: data.result }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * Фабрика: создаёт webhook router и возвращает объект для интеграции.
 * @param {object} [configOverrides] - переопределение config
 * @param {object} [handlers] - { onMessage, onStateMessage } — кастомные обработчики
 * @returns { { webhookRouter, setWebhook: function, getWebhookInfo: function, config, stateStore, userLogger } }
 */
export default function createTelegramBot(configOverrides = {}, handlers = {}) {
  const cfg = { ...config, ...configOverrides }
  const stateStore = createStateStore(cfg)
  const userLogger = createUserLogger({ enabled: true, persist: null })

  const middleware = {
    secretToken: createSecretTokenMiddleware(cfg.webhookSecret),
    rateLimit: createRateLimitMiddleware(cfg.rateLimitWindowMs, cfg.rateLimitMaxPerWindow),
    requestLogger: createRequestLoggerMiddleware(),
    validateUpdate: createValidateUpdateMiddleware(),
  }

  const webhookRouter = createWebhookRouter({
    config: cfg,
    stateStore,
    userLogger,
    middleware,
    onMessage: handlers.onMessage ?? null,
    onStateMessage: handlers.onStateMessage ?? null,
  })

  return {
    webhookRouter,
    setWebhook: () => setWebhook(cfg),
    getWebhookInfo: () => getWebhookInfo(cfg),
    config: cfg,
    stateStore,
    userLogger,
  }
}
