/**
 * Глобальный timeout для HTTP-запроса. При превышении — 504, один лог, метрика timeoutsCount.
 * Не логирует body/query/headers. Aborted запросы не учитываются в avgResponseTimeMs.
 */
import { recordRequest, recordTimeout } from './metrics.js'

const DEFAULT_MS = 30_000

/**
 * @param {number} [ms] - таймаут в мс (по умолчанию 30s)
 * @param {{ warn: (msg: string, ctx?: object) => void }} [logger] - опционально: один warning с requestId
 */
export function requestTimeoutMiddleware(ms = DEFAULT_MS, logger) {
  return (req, res, next) => {
    let fired = false
    const timer = setTimeout(() => {
      if (fired) return
      fired = true
      req._timeoutFired = true
      recordTimeout()
      recordRequest(504, 0, { route: req.path, skipAvg: true, isWebhook: false })
      if (logger) logger.warn('Request timeout', { requestId: req.id })
      if (!res.headersSent) {
        res.status(504).json({
          error: {
            code: 'UPSTREAM_TIMEOUT',
            message: 'Service temporarily unavailable',
          },
        })
      }
    }, ms)

    const onFinish = () => {
      if (!fired) {
        clearTimeout(timer)
      }
    }
    res.once('finish', onFinish)
    res.once('close', onFinish)
    next()
  }
}
