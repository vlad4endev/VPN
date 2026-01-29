import pino from 'pino'

/**
 * Структурированный логгер (JSON). Не логирует body, query, headers, секреты.
 * @param {string} service - Имя сервиса (xui-proxy, n8n-webhook-proxy)
 */
export function createLogger(service) {
  const base = { service }
  const log = pino({
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      level: (label) => ({ level: label }),
    },
    base: null,
  })

  return {
    info(msg, ctx = {}) {
      log.info({ ...base, ...sanitize(ctx) }, msg)
    },
    warn(msg, ctx = {}) {
      log.warn({ ...base, ...sanitize(ctx) }, msg)
    },
    error(msg, ctx = {}) {
      log.error({ ...base, ...sanitize(ctx) }, msg)
    },
    child(bindings) {
      return log.child({ ...base, ...sanitize(bindings) })
    },
    request(req, res, extra = {}) {
      const ctx = {
        requestId: req.id,
        route: req.path,
        method: req.method,
        statusCode: res.statusCode,
        ...sanitize(extra),
      }
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
      log[level]({ ...base, ...ctx }, `${req.method} ${req.path} ${res.statusCode}`)
    },
  }
}

function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return {}
  const out = {}
  const forbidden = ['password', 'token', 'secret', 'authorization', 'cookie', 'body', 'query', 'headers']
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase()
    if (forbidden.some(f => lower.includes(f))) continue
    if (v !== undefined && v !== null) out[k] = v
  }
  return out
}
