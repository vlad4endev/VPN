import { Send, Unlink, Loader2, Copy, ExternalLink, CheckCircle, RefreshCw } from 'lucide-react'
import { useTelegram } from '../hooks/useTelegram.js'
import { useCallback, useState } from 'react'
import logger from '../../../shared/utils/logger.js'

/**
 * Блок привязки Telegram в профиле: статус, кнопка «Привязать», ссылка, отвязка.
 * @param {Object} currentUser - текущий пользователь
 * @param {() => void} [onBoundChange] - после привязки/отвязки (обновить пользователя)
 * @param {(text: string) => void} [onCopy] - копирование в буфер (опционально)
 */
export default function TelegramBindCard({ currentUser, onBoundChange, onCopy }) {
  const [refreshing, setRefreshing] = useState(false)
  const {
    isBound,
    bindLink,
    loading,
    error,
    getLink,
    unbind,
    clearLink,
  } = useTelegram(currentUser, onBoundChange)

  const handleRefreshStatus = useCallback(async () => {
    if (typeof onBoundChange !== 'function') return
    setRefreshing(true)
    try {
      await onBoundChange()
    } finally {
      setRefreshing(false)
    }
  }, [onBoundChange])

  const handleCopyLink = useCallback(() => {
    if (bindLink && typeof onCopy === 'function') {
      onCopy(bindLink)
      logger.info('Telegram', 'Ссылка скопирована')
    } else if (bindLink && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(bindLink)
        .then(() => {
          logger.info('Telegram', 'Ссылка скопирована')
        })
        .catch((err) => {
          logger.warn('Telegram', 'Не удалось скопировать ссылку', { message: err?.message })
        })
    }
  }, [bindLink, onCopy])

  return (
    <div className="rounded-lg sm:rounded-xl border border-slate-800 bg-slate-800/50 p-4 sm:p-5">
      <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] font-semibold text-slate-200 mb-2 flex items-center gap-2">
        <Send className="w-5 h-5 text-blue-400" aria-hidden />
        Telegram
      </h3>
      <p className="text-slate-400 text-sm mb-4">
        Привяжите Telegram, чтобы получать уведомления об оплате и напоминания о продлении подписки.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/20 border border-red-800 text-red-300 text-sm">
          {error}
        </div>
      )}

      {isBound ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-green-400 text-sm font-medium">
            <CheckCircle className="w-4 h-4" aria-hidden />
            Привязан
          </span>
          <button
            type="button"
            onClick={unbind}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Unlink className="w-4 h-4" aria-hidden />}
            Отвязать
          </button>
        </div>
      ) : bindLink ? (
        <div className="space-y-3">
          <p className="text-slate-300 text-sm">Откройте ссылку в Telegram и нажмите «Start» (или «Запустить»). Ссылка действительна 15 минут.</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={bindLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <ExternalLink className="w-4 h-4" aria-hidden />
              Открыть бота
            </a>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors"
            >
              <Copy className="w-4 h-4" aria-hidden />
              Копировать ссылку
            </button>
            <button
              type="button"
              onClick={handleRefreshStatus}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors disabled:opacity-50"
              title="Обновить статус после нажатия Start в боте"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
              Обновить статус
            </button>
            <button
              type="button"
              onClick={clearLink}
              className="inline-flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-slate-300 text-sm"
            >
              Отмена
            </button>
          </div>
          <p className="text-slate-500 text-xs mt-2">
            Нажали Start в боте, но статус не изменился? Нажмите «Обновить статус» или обновите страницу (F5). Убедитесь, что webhook настроен (Админка → Telegram → Установить webhook) и сервер доступен из интернета.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={getLink}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
          Привязать Telegram
        </button>
      )}
    </div>
  )
}
