/**
 * In-memory метрики: запросы, 4xx/5xx, latency per route (avg, p95), activeRequests,
 * error5xxPerRoute, metricsWebhook. Aborted/таймаут не в avgResponseTimeMs.
 */
import { addSample, checkAndAlert } from './alerting.js'

const MAX_LATENCIES_PER_ROUTE = 500
const METRICS = {
  requests: 0,
  status4xx: 0,
  status5xx: 0,
  responseTimeSumMs: 0,
  responseTimeCount: 0,
  timeoutsCount: 0,
  retriesCount: 0,
  circuitOpenCount: 0,
  activeRequests: 0,
  /** @type {Record<string, { latencies: number[], sum: number, count: number, error5xx: number }>} */
  perRoute: {},
  webhookRequestCount: 0,
  webhookErrorCount: 0,
}

function p95(arr) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil(sorted.length * 0.95) - 1
  return Math.round(sorted[Math.max(0, idx)])
}

/**
 * @param {(path: string) => boolean} [isWebhookPath] - для n8n: true для webhook-путей
 */
export function getMetrics(opts = {}) {
  const isWebhookPath = opts.isWebhookPath || (() => false)
  const avgResponseTimeMs =
    METRICS.responseTimeCount > 0
      ? Math.round(METRICS.responseTimeSumMs / METRICS.responseTimeCount)
      : 0

  const latencyAvgPerRoute = {}
  const latencyP95PerRoute = {}
  const error5xxCountPerRoute = {}

  for (const [route, data] of Object.entries(METRICS.perRoute)) {
    if (isWebhookPath(route)) continue
    if (data.count > 0) {
      latencyAvgPerRoute[route] = Math.round(data.sum / data.count)
      latencyP95PerRoute[route] = p95(data.latencies)
    }
    if (data.error5xx > 0) {
      error5xxCountPerRoute[route] = data.error5xx
    }
  }

  const result = {
    requests: METRICS.requests,
    status4xx: METRICS.status4xx,
    status5xx: METRICS.status5xx,
    avgResponseTimeMs,
    timeoutsCount: METRICS.timeoutsCount,
    retriesCount: METRICS.retriesCount,
    circuitOpenCount: METRICS.circuitOpenCount,
    activeRequestsCount: METRICS.activeRequests,
    latencyAvgPerRoute,
    latencyP95PerRoute,
    error5xxCountPerRoute,
    metricsWebhook: {
      requestCount: METRICS.webhookRequestCount,
      errorCount: METRICS.webhookErrorCount,
    },
    uptimeSeconds: Math.floor(process.uptime()),
  }
  return result
}

/**
 * @param {number} statusCode
 * @param {number} durationMs
 * @param {{ route?: string, skipAvg?: boolean, isWebhook?: boolean }} [opts]
 */
export function recordRequest(statusCode, durationMs, opts = {}) {
  const route = opts.route || '-'
  const isWebhook = opts.isWebhook === true

  METRICS.requests += 1
  if (statusCode >= 500) METRICS.status5xx += 1
  else if (statusCode >= 400) METRICS.status4xx += 1

  if (isWebhook) {
    METRICS.webhookRequestCount += 1
    if (statusCode >= 500) METRICS.webhookErrorCount += 1
  } else {
    if (!METRICS.perRoute[route]) {
      METRICS.perRoute[route] = { latencies: [], sum: 0, count: 0, error5xx: 0 }
    }
    const r = METRICS.perRoute[route]
    if (statusCode >= 500) r.error5xx += 1
    if (!opts.skipAvg) {
      r.sum += durationMs
      r.count += 1
      r.latencies.push(durationMs)
      if (r.latencies.length > MAX_LATENCIES_PER_ROUTE) r.latencies.shift()
    }
  }

  if (!opts.skipAvg) {
    METRICS.responseTimeSumMs += durationMs
    METRICS.responseTimeCount += 1
  }
}

export function recordTimeout() {
  METRICS.timeoutsCount += 1
}

export function recordRetry() {
  METRICS.retriesCount += 1
}

export function recordCircuitOpen() {
  METRICS.circuitOpenCount += 1
}

export function recordRequestStart() {
  METRICS.activeRequests += 1
}

export function recordRequestEnd() {
  METRICS.activeRequests = Math.max(0, METRICS.activeRequests - 1)
}

/**
 * @param {{ logger?: { error: (msg: string, ctx?: object) => void }, isWebhookPath?: (path: string) => boolean }} [middlewareOpts]
 */
export function metricsMiddleware(middlewareOpts = {}) {
  const { logger, isWebhookPath } = middlewareOpts
  return (req, res, next) => {
    const start = Date.now()
    req._startTime = start
    recordRequestStart()

    res.on('finish', () => {
      const code = res.statusCode
      const duration = Date.now() - start
      const isWebhook = isWebhookPath ? isWebhookPath(req.path) : false
      if (!req._timeoutFired) {
        recordRequest(code, duration, { route: req.path, skipAvg: false, isWebhook })
      }
      recordRequestEnd()
      addSample(req.path, code, duration, isWebhook)
      if (logger) checkAndAlert(logger)
    })
    res.on('close', () => {
      if (!res.writableFinished) recordRequestEnd()
    })
    next()
  }
}
