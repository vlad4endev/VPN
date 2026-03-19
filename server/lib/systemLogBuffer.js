/**
 * In-memory ring buffer for "system logs".
 * Used by the admin UI to show server-side logs.
 *
 * Shape returned by getSystemLogs() matches the frontend LoggerPanel expectations:
 * { id, timestamp, level, category, message, data?, error?, stack? }
 */

const DEFAULT_MAX = 5000
const MAX = Math.min(
  Math.max(1, Number(process.env.SYSTEM_LOG_BUFFER_MAX) || DEFAULT_MAX),
  20000,
)

const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'passwordhash',
  'token',
  'secret',
  'apiKey',
  'apikey',
  'authorization',
  'cookie',
  'cookies',
  'body',
  'query',
  'headers',
  'privatekey',
  'private_key',
]

let seq = 0
const buffer = []

function nowIso() {
  return new Date().toISOString()
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && (v.constructor === Object || Object.getPrototypeOf(v) === null)
}

function redactValue(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) return value
  if (depth > 6) return '[MaxDepth]'

  const t = typeof value
  if (t === 'string') {
    // Cap huge strings to avoid UI freezing + huge payloads.
    if (value.length > 5000) return value.slice(0, 5000) + '...[truncated]'
    return value
  }
  if (t === 'number' || t === 'boolean') return value
  if (t === 'bigint') return String(value)

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: value.code,
      // Do not include full stack here; we store stack separately.
    }
  }

  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, depth + 1, seen))
  }

  if (!isPlainObject(value)) {
    try {
      return String(value)
    } catch {
      return '[Unserializable]'
    }
  }

  const out = {}
  for (const [k, v] of Object.entries(value)) {
    const lower = String(k).toLowerCase()
    if (SENSITIVE_KEY_FRAGMENTS.some((frag) => lower.includes(String(frag).toLowerCase()))) {
      out[k] = '***REDACTED***'
      continue
    }
    out[k] = redactValue(v, depth + 1, seen)
  }
  return out
}

function normalizeEntry(entry) {
  const level = String(entry?.level || 'info').toLowerCase()
  const category = String(entry?.category || 'system').slice(0, 64)
  const message = String(entry?.message || '').slice(0, 3000)
  const timestamp = entry?.timestamp ? String(entry.timestamp) : nowIso()
  const id = String(entry?.id || `${Date.now()}-${seq++}`)
  const data = entry?.data !== undefined ? redactValue(entry.data) : undefined
  const error = entry?.error !== undefined ? redactValue(entry.error) : undefined
  const stack = entry?.stack ? String(entry.stack).slice(0, 12000) : undefined

  return { id, timestamp, level, category, message, data, error, stack }
}

export function pushSystemLog(entry) {
  const normalized = normalizeEntry(entry)
  buffer.push(normalized)
  if (buffer.length > MAX) buffer.shift()
}

export function clearSystemLogs() {
  buffer.length = 0
}

/**
 * @param {{
 *  limit?: number,
 *  since?: string|number,
 *  level?: string,
 *  category?: string,
 *  search?: string
 * }} opts
 */
export function getSystemLogs(opts = {}) {
  const limit = Math.min(Math.max(0, Number(opts.limit) || 200), MAX)

  const sinceRaw = opts.since
  let sinceTs = null
  if (sinceRaw !== undefined && sinceRaw !== null && String(sinceRaw).trim()) {
    const s = String(sinceRaw).trim()
    const asNum = Number(s)
    if (!Number.isNaN(asNum)) {
      // Малое число — окно «мс назад» (например 3600000 = последний час); большое — абсолютный timestamp.
      if (asNum > 0 && asNum < 1e12) sinceTs = Date.now() - asNum
      else sinceTs = asNum
    } else {
      const d = new Date(s)
      if (!Number.isNaN(d.getTime())) sinceTs = d.getTime()
    }
  }

  const level = opts.level ? String(opts.level).toLowerCase() : null
  const category = opts.category ? String(opts.category) : null
  const search = opts.search ? String(opts.search).toLowerCase() : null

  const slice = sinceTs
    ? buffer.filter((e) => new Date(e.timestamp).getTime() > sinceTs)
    : buffer

  let filtered = slice

  if (level) filtered = filtered.filter((e) => e.level === level)
  if (category) filtered = filtered.filter((e) => e.category === category)
  if (search) {
    filtered = filtered.filter((e) => {
      const hay = [
        e.message,
        e.category,
        e.level,
        e.stack || '',
        e.data ? JSON.stringify(e.data) : '',
        e.error ? JSON.stringify(e.error) : '',
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(search)
    })
  }

  // Return oldest->newest so the UI ingestion can just unshift in reverse order.
  const last = filtered.slice(-limit)
  return last
}

export function getSystemLogMax() {
  return MAX
}

