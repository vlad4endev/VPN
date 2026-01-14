import { Globe, X, CheckCircle2, XCircle, AlertCircle, Copy, Download, Smartphone, Monitor, Tablet, ExternalLink } from 'lucide-react'
import { getUserStatus } from '../../../shared/utils/userStatus.js'

const KeyModal = ({ user, onClose, clientStats = null, settings, onCopy, formatDate }) => {
  // Проверяем наличие user и subId (subId обязателен для формирования ссылки)
  if (!user || !user.subId) return null

  // Используем ссылку на подписку из профиля пользователя
  // Формат: https://subs.skypath.fun:3458/vk198/{SUBID}
  // ВАЖНО: Всегда формируем ссылку из user.subId, игнорируя сохраненные subscriptionLink/vpnLink
  // так как они могут содержать неправильные значения (UUID вместо subId)
  const getSubId = () => {
    // Используем subId (с заглавной) - это основное поле для ссылки подписки
    if (user?.subId && String(user.subId).trim() !== '') {
      return String(user.subId).trim()
    }
    return null
  }
  
  const subId = getSubId()
  // ВАЖНО: Всегда формируем ссылку из subId, не используем сохраненные subscriptionLink/vpnLink
  // так как они могут содержать неправильные значения
  const subscriptionLink = subId ? `https://subs.skypath.fun:3458/vk198/${subId}` : null
  
  if (!subscriptionLink) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6">
          <p className="text-red-400">Ссылка на подписку недоступна. Обратитесь к администратору.</p>
        </div>
      </div>
    )
  }
  
  const userStatus = getUserStatus(user, clientStats)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-md" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-800 w-full max-w-[90vw] sm:max-w-md rounded-2xl sm:rounded-[2.5rem] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-6 md:p-8 border-b border-slate-800 flex justify-between items-center gap-3">
          <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.25rem)] sm:text-xl font-bold text-white flex items-center gap-2 sm:gap-3">
            <Globe size={18} className="sm:w-5 sm:h-5 sm:w-[22px] sm:h-[22px] text-blue-500 flex-shrink-0" /> 
            <span>Нидерланды</span>
          </h3>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-slate-800 rounded-full transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
            aria-label="Закрыть"
          >
            <X size={20} className="sm:w-6 sm:h-6 text-slate-400" />
          </button>
        </div>
        <div className="p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-5 md:space-y-6">
          <div className="space-y-2">
            <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400 font-medium">Статус:</p>
            <div className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full font-bold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] ${
              userStatus.status === 'active' ? 'bg-green-900/30 text-green-400' :
              userStatus.status === 'expired' ? 'bg-red-900/30 text-red-400' :
              'bg-slate-800 text-slate-400'
            }`}>
              {userStatus.status === 'active' && <CheckCircle2 className="w-4 h-4 animate-pulse flex-shrink-0" />}
              {userStatus.status === 'expired' && <XCircle className="w-4 h-4 flex-shrink-0" />}
              {userStatus.status === 'no-key' && <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              <span>{userStatus.label}</span>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400 font-medium">Ваша ссылка на подписку:</p>
            <div className="bg-black/40 border border-slate-800 p-3 sm:p-4 md:p-5 rounded-2xl sm:rounded-3xl break-all font-mono text-[clamp(0.65rem,0.6rem+0.25vw,0.75rem)] sm:text-xs text-blue-400 leading-relaxed ring-1 ring-blue-500/10 word-break break-words whitespace-pre-wrap">
              {subscriptionLink}
            </div>
          </div>
          <button
            onClick={() => onCopy(subscriptionLink)}
            className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-500 active:bg-blue-700 py-3 sm:py-4 md:py-5 rounded-2xl sm:rounded-3xl font-bold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] flex items-center justify-center gap-2 sm:gap-3 transition-all text-white shadow-xl shadow-blue-600/20 active:scale-95 touch-manipulation"
            aria-label="Копировать ссылку на подписку"
          >
            <Copy size={18} className="sm:w-5 sm:h-5 flex-shrink-0" /> 
            <span>Копировать ссылку</span>
          </button>
          
          {/* Кнопки скачивания и переноса подписки в happ proxy */}
          <div className="space-y-2 sm:space-y-3 pt-2 border-t border-slate-800">
            <h4 className="text-slate-300 font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base flex items-center gap-2">
              <Download size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
              <span>Добавить подписку в клиент</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {/* Windows */}
              <a
                href={`happ://add/${subscriptionLink}`}
                className="btn-icon-only-mobile flex flex-col items-center justify-center gap-1 sm:gap-2 p-3 sm:p-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg sm:rounded-xl transition-all group min-h-[44px] touch-manipulation"
                aria-label="Добавить подписку в приложение для Windows"
                title="Добавить подписку в приложение для Windows"
              >
                <Monitor className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400 group-hover:scale-110 transition-transform flex-shrink-0" />
                <span className="btn-text text-white font-medium text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Windows</span>
                <ExternalLink size={12} className="sm:w-3.5 sm:h-3.5 text-slate-400 flex-shrink-0" />
              </a>

              {/* Android */}
              <a
                href={`happ://add/${subscriptionLink}`}
                className="btn-icon-only-mobile flex flex-col items-center justify-center gap-1 sm:gap-2 p-3 sm:p-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg sm:rounded-xl transition-all group min-h-[44px] touch-manipulation"
                aria-label="Добавить подписку в приложение для Android"
                title="Добавить подписку в приложение для Android"
              >
                <Smartphone className="w-6 h-6 sm:w-8 sm:h-8 text-green-400 group-hover:scale-110 transition-transform flex-shrink-0" />
                <span className="btn-text text-white font-medium text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Android</span>
                <ExternalLink size={12} className="sm:w-3.5 sm:h-3.5 text-slate-400 flex-shrink-0" />
              </a>

              {/* iOS */}
              <a
                href={`happ://add/${subscriptionLink}`}
                className="btn-icon-only-mobile flex flex-col items-center justify-center gap-1 sm:gap-2 p-3 sm:p-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg sm:rounded-xl transition-all group min-h-[44px] touch-manipulation"
                aria-label="Добавить подписку в приложение для iOS"
                title="Добавить подписку в приложение для iOS"
              >
                <Tablet className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 group-hover:scale-110 transition-transform flex-shrink-0" />
                <span className="btn-text text-white font-medium text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">iOS</span>
                <ExternalLink size={12} className="sm:w-3.5 sm:h-3.5 text-slate-400 flex-shrink-0" />
              </a>

              {/* macOS */}
              <a
                href={`happ://add/${subscriptionLink}`}
                className="btn-icon-only-mobile flex flex-col items-center justify-center gap-1 sm:gap-2 p-3 sm:p-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg sm:rounded-xl transition-all group min-h-[44px] touch-manipulation"
                aria-label="Добавить подписку в приложение для macOS"
                title="Добавить подписку в приложение для macOS"
              >
                <Monitor className="w-6 h-6 sm:w-8 sm:h-8 text-gray-300 group-hover:scale-110 transition-transform flex-shrink-0" />
                <span className="btn-text text-white font-medium text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">macOS</span>
                <ExternalLink size={12} className="sm:w-3.5 sm:h-3.5 text-slate-400 flex-shrink-0" />
              </a>
            </div>
          </div>
          <div className="pt-3 sm:pt-4 border-t border-slate-800 space-y-2">
            <p className="text-slate-400 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">
              <strong className="text-slate-300">План:</strong> {user.plan === 'premium' ? 'Премиум' : 'Бесплатный'}
            </p>
            {(clientStats?.expiryTime || user.expiresAt) && (
              <p className="text-slate-400 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">
                <strong className="text-slate-300">Истекает:</strong>{' '}
                {clientStats?.expiryTime && clientStats.expiryTime > 0
                  ? formatDate(clientStats.expiryTime)
                  : user.expiresAt
                  ? formatDate(user.expiresAt)
                  : 'Не ограничен'}
                {clientStats?.expiryTime && (
                  <span className="text-slate-500 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] sm:text-xs ml-1">(из 3x-ui)</span>
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default KeyModal

