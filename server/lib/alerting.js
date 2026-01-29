/**
 * Базовые алерты через pino/console: 5xx > 5% за минуту, latency avg > 2s.
 * Webhook-пути исключены. JSON-лог: requestId, route, status, msg.
 */
const WINDOW_MS = 60_000
const MAX_SAMPLES = 5000
const ALERT_5XX_RATE = 0.05
const ALERT_LATENCY_MS = 2000

/** @type {{ ts: number, route: string, statusCode: number, latencyMs: number, isWebhook: boolean }[]} */
const samples = []

let lastAlert5xx = 0
let lastAlertLatency = 0
const ALERT_COOLDOWN_MS = 30_000

export function addSample(route, statusCode, latencyMs, isWebhook) {
  samples.push({ ts: Date.now(), route, statusCode, latencyMs, isWebhook })
  if (samples.length > MAX_SAMPLES) samples.shift()
}

function getLastMinuteNonWebhook() {
  const cutoff = Date.now() - WINDOW_MS
  return samples.filter((s) => !s.isWebhook && s.ts >= cutoff)
}

export function checkAndAlert(logger) {
  if (!logger || !logger.error) return
  const now = Date.now()
  const recent = getLastMinuteNonWebhook()

  const byRoute = {}
  for (const s of recent) {
    if (!byRoute[s.route]) byRoute[s.route] = { total: 0, errors: 0, sumLatency: 0 }
    byRoute[s.route].total += 1
    if (s.statusCode >= 500) byRoute[s.route].errors += 1
    byRoute[s.route].sumLatency += s.latencyMs
  }

  for (const [route, data] of Object.entries(byRoute)) {
    if (data.total < 5) continue
    const rate = data.errors / data.total
    if (rate > ALERT_5XX_RATE && now - lastAlert5xx > ALERT_COOLDOWN_MS) {
      lastAlert5xx = now
      logger.error('ALERT: 5xx rate exceeds 5% over last minute', {
        route,
        status: '5xx_high',
        total: data.total,
        errors: data.errors,
        ratePercent: Math.round(rate * 100),
      })
    }
    const avgLatency = data.sumLatency / data.total
    if (avgLatency > ALERT_LATENCY_MS && now - lastAlertLatency > ALERT_COOLDOWN_MS) {
      lastAlertLatency = now
      logger.error('ALERT: latency avg exceeds 2s over last minute', {
        route,
        status: 'latency_high',
        avgLatencyMs: Math.round(avgLatency),
        thresholdMs: ALERT_LATENCY_MS,
      })
    }
  }
}
