#!/usr/bin/env node
/**
 * Регистрация Telegram webhook: POST .../setWebhook → https://<ваш-домен>/api/telegram/webhook
 *
 * Использование:
 *   cd server && npm run telegram:set-webhook
 *
 * Переменные окружения (server/.env):
 *   TELEGRAM_BOT_TOKEN или TELEGRAM_TOKEN — обязательно
 *   TELEGRAM_WEBHOOK_BASE_URL или PUBLIC_URL или FRONTEND_URL — HTTPS без слэша в конце
 *   TELEGRAM_WEBHOOK_SECRET — опционально (secret_token в Telegram)
 *
 * Базовый URL можно передать аргументом:
 *   node scripts/set-telegram-webhook.mjs https://example.com
 *
 * Только посмотреть текущий webhook:
 *   node scripts/set-telegram-webhook.mjs --status
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { setTelegramWebhook, getTelegramWebhookInfo } from '../lib/telegram.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverRoot = path.join(__dirname, '..')
const envPath = path.join(serverRoot, '.env')

dotenv.config()
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false })
}

function trimBase (u) {
  return (u || '').toString().trim().replace(/\/+$/, '')
}

const args = process.argv.slice(2).filter((a) => a !== '--dry-run')
const dryRun = process.argv.includes('--dry-run')
const statusOnly = args.includes('--status')
const baseArg = args.find((a) => !a.startsWith('--'))

async function main () {
  const token =
    (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim()) ||
    (process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_TOKEN.trim()) ||
    ''

  if (!token) {
    console.error('❌ Задайте TELEGRAM_BOT_TOKEN или TELEGRAM_TOKEN в server/.env')
    process.exit(1)
  }

  if (statusOnly) {
    const info = await getTelegramWebhookInfo(token)
    if (!info.ok) {
      console.error('❌ getWebhookInfo:', info.error)
      process.exit(1)
    }
    console.log(JSON.stringify(info.result, null, 2))
    process.exit(0)
  }

  const baseUrl = trimBase(
    baseArg ||
      process.env.TELEGRAM_WEBHOOK_BASE_URL ||
      process.env.PUBLIC_URL ||
      process.env.FRONTEND_URL ||
      ''
  )

  if (!baseUrl) {
    console.error(
      '❌ Укажите публичный HTTPS URL: в .env (TELEGRAM_WEBHOOK_BASE_URL или PUBLIC_URL) или аргументом:\n' +
        '   npm run telegram:set-webhook -- https://ваш-домен'
    )
    process.exit(1)
  }

  if (!/^https:\/\//i.test(baseUrl)) {
    console.error('❌ URL должен начинаться с https:// (требование Telegram для webhook)')
    process.exit(1)
  }

  const webhookUrl = `${baseUrl}/api/telegram/webhook`
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim() || undefined

  console.log('Webhook URL:', webhookUrl)
  if (secret) console.log('secret_token: задан (TELEGRAM_WEBHOOK_SECRET)')
  if (dryRun) {
    console.log('(--dry-run: запрос к Telegram не отправлялся)')
    process.exit(0)
  }

  console.log('Node:', process.version, '| запрос к https://api.telegram.org …')

  const result = await setTelegramWebhook(token, webhookUrl, {
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
  })

  if (!result.ok) {
    console.error('❌ setWebhook:', result.error)
    console.error(
      '\nПодсказки: проверьте исходящий HTTPS с сервера (curl https://api.telegram.org), DNS, файрвол.\n' +
        'Опционально: TELEGRAM_HTTP_TIMEOUT_MS=60000 в .env\n'
    )
    process.exit(1)
  }

  console.log('✅ Webhook установлен.')

  const info = await getTelegramWebhookInfo(token)
  if (info.ok && info.result) {
    console.log('Текущий URL:', info.result.url || '(пусто)')
    if (info.result.last_error_message) {
      console.warn('Последняя ошибка доставки:', info.result.last_error_message)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
