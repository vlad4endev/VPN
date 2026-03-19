/**
 * Подготовка данных для ИИ-отчёта мониторинга и эвристический отчёт без LLM.
 */

const MAX_LOG_LINES = 120
const MAX_LOG_MSG = 480
const MAX_HISTORY_POINTS = 45
const MAX_JSON_CHARS = 52000

/**
 * @param {Array<{ timestamp?: string, level?: string, category?: string, message?: string }>} logs
 */
export function compactLogsForAi(logs) {
  const slice = Array.isArray(logs) ? logs.slice(-MAX_LOG_LINES) : []
  return slice.map((e) => ({
    t: e.timestamp,
    level: e.level,
    cat: e.category,
    msg: String(e.message || '').slice(0, MAX_LOG_MSG),
  }))
}

/**
 * @param {Array<{ time?: string, latency?: number, timestamp?: number }>} history
 */
export function compactLatencyHistory(history) {
  const slice = Array.isArray(history) ? history.slice(-MAX_HISTORY_POINTS) : []
  return slice.map((p) => ({ time: p.time, ms: p.latency, ts: p.timestamp }))
}

/**
 * @param {{
 *   status?: object|null,
 *   logs?: Array,
 *   responseTimeHistory?: Array,
 *   clientStatus?: object|null,
 *   serverNote?: string
 * }} payload
 */
export function buildMonitoringAiUserContent(payload) {
  const body = {
    instruction:
      'Проанализируй состояние системы: здоровье сервисов, нагрузку CPU/RAM, метрики API (задержки, 4xx/5xx, таймауты), тренд latency по точкам графика, логи (ошибки, предупреждения, повторяющиеся сбои). Оцени актуальность данных (timestamp) и риски. Дай практические рекомендации.',
    serverNote: payload.serverNote || undefined,
    status: payload.status ?? null,
    clientStatus: payload.clientStatus ?? null,
    latencySeries: compactLatencyHistory(payload.responseTimeHistory),
    logs: compactLogsForAi(payload.logs || []),
  }
  let json = JSON.stringify(body, null, 0)
  if (json.length > MAX_JSON_CHARS) {
    body.logs = (body.logs || []).slice(-60)
    json = JSON.stringify(body, null, 0)
  }
  if (json.length > MAX_JSON_CHARS) {
    json = json.slice(0, MAX_JSON_CHARS) + '\n...[truncated]'
  }
  return json
}

/**
 * @param {{
 *   status?: object|null,
 *   logs?: Array,
 *   responseTimeHistory?: Array,
 *   clientStatus?: object|null,
 * }} payload
 * @returns {string}
 */
export function buildHeuristicMonitoringReport(payload) {
  const lines = []
  lines.push('## Краткий отчёт (эвристика, ИИ недоступен)')
  lines.push('')

  const status = payload.status
  if (!status) {
    lines.push('- **Сервер:** снимок метрик с API не получен (проверьте доступность `/api/system/status` и `VITE_ENABLE_MONITORING`).')
  } else {
    lines.push(`- **Время снимка:** ${status.timestamp || 'не указано'}`)
    const cpu = status.cpu?.usage
    const ram = status.ram?.usage
    if (Number.isFinite(Number(cpu))) {
      lines.push(`- **CPU:** ${Number(cpu).toFixed(1)}% ${Number(cpu) > 85 ? '— высокая нагрузка' : Number(cpu) > 60 ? '— повышенная' : ''}`)
    }
    if (Number.isFinite(Number(ram))) {
      lines.push(`- **RAM:** ${Number(ram).toFixed(1)}% ${Number(ram) > 90 ? '— критично' : Number(ram) > 75 ? '— стоит наблюдать' : ''}`)
    }
    if (status.firebase) {
      lines.push(`- **Firebase:** ${status.firebase.connected ? 'OK' : 'ошибка'}${status.firebase.error ? ` (${status.firebase.error})` : ''}`)
    }
    if (status.n8n) {
      lines.push(`- **n8n:** ${status.n8n.available ? 'OK' : 'недоступен'}${status.n8n.error ? ` (${status.n8n.error})` : ''}`)
    }
    if (status.xui?.configured) {
      lines.push(`- **3x-ui:** ${status.xui.connected ? 'OK' : 'проблема'}${status.xui.error ? ` (${status.xui.error})` : ''}`)
    }
    const api = status.api
    if (api) {
      const parts = []
      if (api.avgResponseTimeMs != null) parts.push(`средняя задержка ${api.avgResponseTimeMs} мс`)
      if (api.status5xx > 0) parts.push(`5xx: ${api.status5xx}`)
      if (api.timeoutsCount > 0) parts.push(`таймауты: ${api.timeoutsCount}`)
      if (parts.length) lines.push(`- **API:** ${parts.join('; ')}`)
    }
  }

  const logs = Array.isArray(payload.logs) ? payload.logs : []
  const err = logs.filter((l) => String(l.level).toLowerCase() === 'error').length
  const warn = logs.filter((l) => String(l.level).toLowerCase() === 'warn').length
  lines.push(`- **Логи (в выборке):** ошибок: ${err}, предупреждений: ${warn}, всего строк: ${logs.length}`)

  const hist = Array.isArray(payload.responseTimeHistory) ? payload.responseTimeHistory : []
  if (hist.length >= 3) {
    const ms = hist.map((h) => Number(h.latency)).filter((n) => Number.isFinite(n))
    if (ms.length >= 3) {
      const first = ms[0]
      const last = ms[ms.length - 1]
      const avg = ms.reduce((a, b) => a + b, 0) / ms.length
      lines.push(`- **Тренд latency (график):** первая точка ~${first} мс, последняя ~${last} мс, среднее ~${avg.toFixed(0)} мс`)
      if (last > first * 1.4 && last > 500) lines.push('  - Задержки растут — проверьте нагрузку, сеть и зависимости (n8n, Firebase, 3x-ui).')
    }
  }

  const cs = payload.clientStatus
  if (cs) {
    lines.push(`- **Клиент:** ${cs.onLine ? 'онлайн' : 'офлайн'}${cs.connection?.effectiveType ? `, сеть ${cs.connection.effectiveType}` : ''}`)
  }

  lines.push('')
  lines.push('Настройте провайдера ИИ в админке (раздел ИИ) или переменные окружения API-ключа, чтобы получить развёрнутый интеллектуальный отчёт.')
  return lines.join('\n')
}
