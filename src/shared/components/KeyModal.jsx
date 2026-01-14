import React from 'react'
import { X, Copy, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { getUserStatus } from '../utils/userStatus.js'

/**
 * Модальное окно для отображения ссылки на подписку пользователя
 */
const KeyModal = ({ user, onClose, clientStats = null, settings, onCopy, formatDate }) => {
  // Используем ссылку на подписку из профиля пользователя
  // Формат: https://subs.skypath.fun:3458/vk198/{SUBID}
  // Используем первый непустой элемент из массива subid
  const getFirstSubid = () => {
    // Проверяем массив subid (с маленькой буквы)
    if (Array.isArray(user?.subid) && user.subid.length > 0) {
      const firstSubid = user.subid.find(s => s && String(s).trim() !== '')
      if (firstSubid) return String(firstSubid).trim()
    }
    // Fallback: проверяем subId (с заглавной) для обратной совместимости
    if (user?.subId && String(user.subId).trim() !== '') {
      return String(user.subId).trim()
    }
    return null
  }
  
  const firstSubid = getFirstSubid()
  const subscriptionLink = user?.subscriptionLink || user?.vpnLink || (firstSubid ? `https://subs.skypath.fun:3458/vk198/${firstSubid}` : null)
  
  if (!user || !subscriptionLink) return null

  const userStatus = getUserStatus(user, clientStats)

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-800 p-8 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
          <X size={24} />
        </button>

        <h2 className="text-2xl font-black text-white mb-6">Ваша ссылка на подписку</h2>

        {/* Статус пользователя */}
        <div className="mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            {userStatus.isActive ? (
              <CheckCircle2 className="text-green-500" size={20} />
            ) : (
              <XCircle className="text-red-500" size={20} />
            )}
            <span className="font-bold text-white">{userStatus.statusText}</span>
          </div>
          {userStatus.expiresAt && (
            <p className="text-sm text-slate-400 ml-8">
              {userStatus.expiresAt === 'Бессрочно' ? 'Бессрочная подписка' : `Истекает: ${userStatus.expiresAt}`}
            </p>
          )}
        </div>

        {/* Ссылка на подписку */}
        <div className="mb-6">
          <label className="block text-sm font-bold text-slate-300 mb-2">Ссылка на подписку:</label>
          <div className="relative">
            <textarea
              readOnly
              value={subscriptionLink}
              className="w-full h-32 bg-slate-800 text-slate-200 p-4 rounded-lg font-mono text-sm border border-slate-700 resize-none"
            />
            <button
              onClick={() => onCopy(subscriptionLink)}
              className="absolute top-2 right-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Copy size={16} />
              Копировать
            </button>
          </div>
        </div>

        {/* Информация о подключении */}
        <div className="space-y-2 text-sm text-slate-400">
          {firstSubid && (
            <p><strong className="text-slate-300">SubID:</strong> {firstSubid}</p>
          )}
          {Array.isArray(user?.subid) && user.subid.length > 1 && (
            <p className="text-xs text-slate-500">
              Всего SubID: {user.subid.length} (используется первый: {firstSubid})
            </p>
          )}
          {userStatus.trafficUsed && (
            <p><strong className="text-slate-300">Использовано трафика:</strong> {userStatus.trafficUsed}</p>
          )}
        </div>

        {/* Предупреждение */}
        <div className="mt-6 p-4 bg-yellow-900/20 border border-yellow-800/50 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-yellow-500 flex-shrink-0 mt-0.5" size={20} />
            <div className="text-sm text-yellow-200">
              <p className="font-bold mb-1">Важно:</p>
              <p>Не передавайте эту ссылку третьим лицам. Храните её в безопасности.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default KeyModal

