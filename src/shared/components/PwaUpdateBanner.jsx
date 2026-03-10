import React, { useState, useEffect } from 'react'
import { applyUpdate } from '../services/pwaService.js'
import { RefreshCw } from 'lucide-react'

/**
 * Показывает баннер «Доступно обновление» при появлении нового SW.
 * Фиксирован внизу экрана, не мешает контенту на мобильных.
 */
export default function PwaUpdateBanner() {
  const [reg, setReg] = useState(null)

  useEffect(() => {
    const handler = (e) => setReg(e.detail || null)
    window.addEventListener('pwa-update-available', handler)
    return () => window.removeEventListener('pwa-update-available', handler)
  }, [])

  if (!reg) return null

  const handleUpdate = () => {
    applyUpdate(reg).then(() => window.location.reload())
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] safe-area-pb flex flex-col items-center p-3 sm:p-4 bg-slate-900/95 backdrop-blur border-t border-slate-700 shadow-lg"
      role="alert"
    >
      <div className="w-full max-w-md flex items-center gap-3">
        <RefreshCw className="w-5 h-5 text-blue-400 flex-shrink-0" />
        <p className="flex-1 text-slate-200 text-sm">Доступна новая версия приложения</p>
        <button
          type="button"
          onClick={handleUpdate}
          className="flex-shrink-0 min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors touch-manipulation"
        >
          Обновить
        </button>
      </div>
    </div>
  )
}
