/**
 * Конфигурация модуля Telegram Bot (environment variables).
 * Production-ready: все чувствительные и изменяемые параметры вынесены в env.
 */

const env = typeof process !== 'undefined' ? process.env : {}

const config = {
  // Обязательные
  botToken: (env.TELEGRAM_BOT_TOKEN || env.BOT_TOKEN || '').trim(),
  webhookSecret: (env.TELEGRAM_WEBHOOK_SECRET || env.WEBHOOK_SECRET || '').trim(),

  // Webhook URL (для setWebhook): должен быть HTTPS в production
  publicUrl: (env.PUBLIC_URL || env.FRONTEND_URL || env.DOMAIN || '').trim().replace(/\/+$/, ''),

  // Rate limiting
  rateLimitWindowMs: Math.max(0, parseInt(env.TELEGRAM_RATE_LIMIT_WINDOW_MS || '60000', 10)) || 60000,
  rateLimitMaxPerWindow: Math.max(1, parseInt(env.TELEGRAM_RATE_LIMIT_MAX || '30', 10)) || 30,

  // Telegram API
  apiTimeoutMs: Math.max(1000, parseInt(env.TELEGRAM_API_TIMEOUT_MS || '10000', 10)) || 10000,
  sendRetryAttempts: Math.max(1, Math.min(5, parseInt(env.TELEGRAM_SEND_RETRY_ATTEMPTS || '3', 10))) || 3,
  sendRetryDelayMs: Math.max(100, parseInt(env.TELEGRAM_SEND_RETRY_DELAY_MS || '500', 10)) || 500,

  // State store: 'memory' | 'redis' | 'postgres'
  stateStore: (env.TELEGRAM_STATE_STORE || 'memory').toLowerCase(),

  // Redis (если stateStore === 'redis')
  redisUrl: (env.REDIS_URL || env.TELEGRAM_REDIS_URL || 'redis://localhost:6379').trim(),
  redisKeyPrefix: (env.TELEGRAM_REDIS_PREFIX || 'tg_bot:').trim(),
  stateTtlSeconds: Math.max(60, parseInt(env.TELEGRAM_STATE_TTL_SECONDS || '3600', 10)) || 3600,

  // PostgreSQL (если stateStore === 'postgres')
  pgConnectionString: (env.DATABASE_URL || env.TELEGRAM_PG_URL || '').trim(),

  // Логирование действий пользователей в БД (опционально, отдельно от state)
  userLogEnabled: (env.TELEGRAM_USER_LOG_ENABLED || 'false').toLowerCase() === 'true',
  userLogTable: (env.TELEGRAM_USER_LOG_TABLE || 'telegram_user_events').trim(),
}

export default config
