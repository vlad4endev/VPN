/**
 * Панель логов Mini App для экранов /t: просмотр и копирование для анализа проблем.
 */

import { useState, useCallback } from 'react'
import { Bug, Copy, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { getTmaLogs, getTmaLogsAsText, clearTmaLogs } from '../utils/tmaLogger.js'

const LEVEL_COLORS = {
  debug: 'text-slate-500',
  info: 'text-sky-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
}

export default function TmaLogPanel() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [entries, setEntries] = useState([])

  const refresh = useCallback(() => {
    setEntries(getTmaLogs(80))
  }, [])

  const handleCopy = useCallback(async () => {
    const text = getTmaLogsAsText(80)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (_) {}
  }, [])

  const handleClear = useCallback(() => {
    clearTmaLogs()
    setEntries([])
  }, [])

  const toggle = useCallback(() => {
    if (!open) refresh()
    setOpen((v) => !v)
  }, [open, refresh])

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-300 text-sm font-medium shadow-lg"
        title="Логи Mini App"
      >
        <Bug className="w-4 h-4" />
        Логи TMA
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>
      {open && (
        <div
          className="w-[min(90vw,360px)] max-h-[280px] flex flex-col rounded-lg bg-slate-900 border border-slate-700 shadow-xl overflow-hidden"
          style={{ fontFamily: 'ui-monospace, monospace' }}
        >
          <div className="flex items-center justify-between px-2 py-1.5 bg-slate-800 border-b border-slate-700">
            <span className="text-xs text-slate-400">Последние события Mini App</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={refresh}
                className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 text-xs"
                title="Обновить"
              >
                Обновить
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700"
                title="Очистить"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 text-xs"
                title="Копировать логи"
              >
                <Copy className="w-3.5 h-3.5" />
                {copied ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 text-xs space-y-1 min-h-[120px]">
            {(entries.length ? entries : getTmaLogs(80)).map((e, i) => (
              <div
                key={`${e.ts}-${i}`}
                className={`${LEVEL_COLORS[e.level] || 'text-slate-400'} break-all`}
              >
                <span className="text-slate-500 shrink-0">{e.ts.slice(11, 23)}</span>
                {' '}
                <span className="font-medium">[{e.event}]</span>
                {' '}
                {e.message}
                {e.data && Object.keys(e.data).length > 0 && (
                  <div className="mt-0.5 pl-4 text-slate-500">{JSON.stringify(e.data)}</div>
                )}
              </div>
            ))}
            {!entries.length && !getTmaLogs(1).length && (
              <div className="text-slate-500 text-xs space-y-2">
                <p className="italic">Событий пока нет.</p>
                <p>Если экран пустой или «Загрузка…» не исчезает — откройте ссылку из меню бота в Telegram (не в браузере). Логи появятся после загрузки скриптов.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
