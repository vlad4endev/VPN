import { pushSystemLog } from './systemLogBuffer.js'

function safeToString(v) {
  if (typeof v === 'string') return v
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  if (v instanceof Error) return `${v.name}: ${v.message}`
  try {
    return JSON.stringify(v)
  } catch {
    try {
      return String(v)
    } catch {
      return '[Unstringifiable]'
    }
  }
}

function buildConsoleEntry(args, level) {
  const parts = args.map((a) => safeToString(a))
  const message = parts.join(' ').slice(0, 3000)

  // If one of args is an Error, preserve stack.
  const err = args.find((a) => a instanceof Error)
  const stack = err?.stack

  // Try to capture structured object from second arg (best-effort).
  const dataArg = args.length >= 2 ? args[1] : undefined
  const data = dataArg && typeof dataArg === 'object' && !(dataArg instanceof Error) ? dataArg : undefined

  return {
    level,
    category: 'console',
    message,
    data,
    error: err ? { name: err.name, message: err.message, code: err.code } : undefined,
    stack,
  }
}

/**
 * Captures console logs into the system ring buffer.
 * Keeps original console output to not break local debugging.
 */
export function installConsoleCapture({ enabled = true } = {}) {
  if (!enabled) return () => {}

  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  }

  const wrap = (method, level) => {
    console[method] = (...args) => {
      try {
        pushSystemLog(buildConsoleEntry(args, level))
      } catch {
        // Never break app because of logging.
      }
      return original[method].apply(console, args)
    }
  }

  wrap('log', 'info')
  wrap('info', 'info')
  wrap('warn', 'warn')
  wrap('error', 'error')
  wrap('debug', 'debug')

  return () => {
    console.log = original.log
    console.info = original.info
    console.warn = original.warn
    console.error = original.error
    console.debug = original.debug
  }
}

