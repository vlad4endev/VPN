import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  Save, 
  Copy, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  CreditCard,
  RefreshCw,
  Eye,
  EyeOff,
  Trash2
} from 'lucide-react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'
import { stripUndefinedForFirestore } from '../../../shared/utils/firestoreSafe.js'
import logger from '../../../shared/utils/logger.js'
import { useAdminContext } from '../context/AdminContext.jsx'
import { adminService } from '../services/adminService.js'

/**
 * Панель управления настройками YooMoney
 */
const YooMoneyPanel = ({ onSaveSettings }) => {
  const { settings } = useAdminContext()
  const [wallet, setWallet] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [showSecretKey, setShowSecretKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [copied, setCopied] = useState(false)
  const [clearingPayments, setClearingPayments] = useState(false)
  const justSavedRef = useRef(false)

  // Загрузка настроек YooMoney при монтировании
  useEffect(() => {
    const loadYooMoneySettings = async () => {
      if (justSavedRef.current) {
        logger.debug('Admin', 'Пропуск загрузки настроек YooMoney - только что сохранены')
        setLoading(false)
        return
      }

      if (!db) {
        setError('База данных недоступна')
        setLoading(false)
        return
      }

      try {
        logger.info('Admin', 'Загрузка настроек YooMoney из Firestore')
        const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
        const settingsSnapshot = await getDoc(settingsDoc)
        
        if (settingsSnapshot.exists()) {
          const data = settingsSnapshot.data()
          const yoomoneyWallet = data.yoomoneyWallet || data.yooMoneyWallet || ''
          const yoomoneySecretKey = data.yoomoneySecretKey || data.yooMoneySecretKey || ''
          
          logger.info('Admin', 'Настройки YooMoney загружены из Firestore', { 
            hasWallet: !!yoomoneyWallet,
            hasSecretKey: !!yoomoneySecretKey,
            loadedWallet: yoomoneyWallet,
            loadedSecretKey: yoomoneySecretKey ? '***' : ''
          })
          
          setWallet(yoomoneyWallet)
          setSecretKey(yoomoneySecretKey)
        } else {
          logger.debug('Admin', 'Документ настроек не существует в Firestore')
          setWallet('')
          setSecretKey('')
        }
      } catch (err) {
        logger.error('Admin', 'Ошибка загрузки настроек YooMoney', null, err)
        setError('Ошибка загрузки настроек')
      } finally {
        setLoading(false)
      }
    }

    loadYooMoneySettings()
  }, []) // Загружаем только при монтировании

  // Обновление из контекста settings (если они изменились)
  useEffect(() => {
    if (justSavedRef.current || !settings) {
      return
    }

    const yoomoneyWallet = settings.yoomoneyWallet || settings.yooMoneyWallet || ''
    const yoomoneySecretKey = settings.yoomoneySecretKey || settings.yooMoneySecretKey || ''
    
    // Обновляем только если значения отличаются и не пустые
    if (yoomoneyWallet && yoomoneyWallet !== wallet) {
      logger.info('Admin', 'Обновление wallet из контекста settings', { 
        newWallet: yoomoneyWallet,
        currentWallet: wallet
      })
      setWallet(yoomoneyWallet)
    }
    if (yoomoneySecretKey && yoomoneySecretKey !== secretKey) {
      logger.info('Admin', 'Обновление secretKey из контекста settings')
      setSecretKey(yoomoneySecretKey)
    }
  }, [settings, wallet, secretKey])

  // Сохранение настроек YooMoney
  const handleSave = useCallback(async () => {
    if (!db) {
      setError('База данных недоступна')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      // Валидация
      if (wallet.trim() && !/^\d+$/.test(wallet.trim())) {
        setError('Номер кошелька должен содержать только цифры')
        setSaving(false)
        return
      }

      if (wallet.trim() && wallet.trim().length < 10) {
        setError('Номер кошелька слишком короткий')
        setSaving(false)
        return
      }

      if (secretKey.trim() && secretKey.trim().length < 10) {
        setError('Секретный ключ слишком короткий')
        setSaving(false)
        return
      }

      // Сохраняем в Firestore
      const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
      const currentSettings = await getDoc(settingsDoc)
      const currentData = currentSettings.exists() ? currentSettings.data() : {}

      const updatedSettings = {
        ...currentData,
        yoomoneyWallet: wallet.trim() || '',
        yoomoneySecretKey: secretKey.trim() || '',
        // Для обратной совместимости
        yooMoneyWallet: wallet.trim() || '',
        yooMoneySecretKey: secretKey.trim() || '',
        updatedAt: new Date().toISOString(),
      }

      await setDoc(settingsDoc, stripUndefinedForFirestore(updatedSettings), { merge: true })

      logger.info('Admin', 'Настройки YooMoney сохранены в Firestore', { 
        hasWallet: !!wallet.trim(),
        hasSecretKey: !!secretKey.trim()
      })

      // ВАЖНО: Сохраняем значения до вызова callback, чтобы они не потерялись
      const savedWallet = wallet.trim()
      const savedSecretKey = secretKey.trim()
      
      // Устанавливаем флаг, чтобы предотвратить перезагрузку из settings
      justSavedRef.current = true
      
      // ВАЖНО: Явно обновляем локальное состояние СРАЗУ после сохранения, чтобы данные отображались в полях
      setWallet(savedWallet)
      setSecretKey(savedSecretKey)
      
      // Вызываем callback для обновления локального состояния в родительском компоненте
      if (onSaveSettings) {
        try {
          logger.info('Admin', 'Вызов onSaveSettings callback для обновления настроек')
          await onSaveSettings()
          logger.info('Admin', 'onSaveSettings callback успешно выполнен')
        } catch (callbackErr) {
          logger.warn('Admin', 'Ошибка вызова onSaveSettings callback', null, callbackErr)
        }
      }
      
      setSuccess('Настройки YooMoney успешно сохранены')
      setTimeout(() => setSuccess(null), 3000)
      
      // Сбрасываем флаг через небольшую задержку, чтобы settings успели обновиться
      setTimeout(() => {
        justSavedRef.current = false
        logger.debug('Admin', 'Флаг justSaved сброшен, загрузка из settings разрешена')
      }, 1000)
      
      logger.info('Admin', 'Настройки YooMoney сохранены и локальное состояние обновлено', { 
        savedWallet,
        savedSecretKey,
        currentWalletState: savedWallet,
        currentSecretKeyState: savedSecretKey
      })
    } catch (err) {
      logger.error('Admin', 'Ошибка сохранения настроек YooMoney', null, err)
      setError('Ошибка сохранения: ' + (err.message || 'Неизвестная ошибка'))
    } finally {
      setSaving(false)
    }
  }, [wallet, secretKey, onSaveSettings])

  // Копирование в буфер обмена
  const handleCopy = useCallback(async (text, type) => {
    if (!text.trim()) return

    try {
      await navigator.clipboard.writeText(text.trim())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      logger.error('Admin', 'Ошибка копирования', null, err)
      setError('Не удалось скопировать ' + type)
    }
  }, [])

  // Очистка всех платежей со статусом 'pending' и 'test' (тестовые)
  const handleClearAllPendingPayments = useCallback(async () => {
    if (!window.confirm('Удалить все незавершённые и тестовые платежи (статусы pending и test) для всех пользователей? Действие нельзя отменить.')) {
      return
    }

    setClearingPayments(true)
    setError(null)
    setSuccess(null)

    try {
      logger.info('Admin', 'Начало очистки платежей со статусом pending и test')
      const result = await adminService.clearAllPendingPayments()
      
      logger.info('Admin', 'Очистка платежей pending и test завершена', result)
      setSuccess(result.message || `Удалено ${result.deleted} платежей (pending и тестовые)`)
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      logger.error('Admin', 'Ошибка очистки платежей pending и test', null, err)
      setError('Ошибка при удалении платежей: ' + (err.message || 'Неизвестная ошибка'))
    } finally {
      setClearingPayments(false)
    }
  }, [])

  if (loading) {
    return (
      <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-slate-800">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-200 flex items-center gap-2 sm:gap-3">
          <CreditCard className="w-5 h-5 sm:w-6 sm:h-6" />
          YooMoney
        </h2>
        <p className="text-slate-400 text-sm sm:text-base mt-1">
          Настройки для интеграции с платежной системой YooMoney
        </p>
      </div>

      <form 
        onSubmit={(e) => {
          e.preventDefault()
          handleSave()
        }}
        className="p-4 sm:p-6 space-y-4 sm:space-y-6"
      >
        {error && (
          <div className="p-3 sm:p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm sm:text-base">
            {error}
          </div>
        )}

        {success && (
          <div className="p-3 sm:p-4 bg-green-900/30 border border-green-800 rounded-lg text-green-300 text-sm sm:text-base">
            {success}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-slate-300 text-sm sm:text-base font-medium mb-2">
              Номер кошелька YooMoney *
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={wallet}
                onChange={(e) => setWallet(e.target.value.replace(/\D/g, ''))}
                placeholder="410017383938322"
                className="flex-1 px-4 py-2 sm:py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm sm:text-base"
              />
              {wallet.trim() && (
                <button
                  onClick={() => handleCopy(wallet, 'номер кошелька')}
                  className="px-4 py-2 sm:py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2 min-h-[44px] touch-manipulation"
                  title="Копировать номер кошелька"
                >
                  <Copy className="w-4 h-4 sm:w-5 sm:h-5" />
                  {copied ? 'Скопировано!' : 'Копировать'}
                </button>
              )}
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-2">
              Номер кошелька YooMoney для приема платежей (только цифры)
            </p>
          </div>

          <div>
            <label className="block text-slate-300 text-sm sm:text-base font-medium mb-2">
              Секретный ключ YooMoney *
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <input
                  type={showSecretKey ? 'text' : 'password'}
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="VK+sJ7uqS1HoYf8AY1ZBJnDQ"
                  className="w-full px-4 py-2 sm:py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm sm:text-base pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-200 transition-colors"
                  title={showSecretKey ? 'Скрыть ключ' : 'Показать ключ'}
                >
                  {showSecretKey ? (
                    <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" />
                  ) : (
                    <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                  )}
                </button>
              </div>
              {secretKey.trim() && (
                <button
                  onClick={() => handleCopy(secretKey, 'секретный ключ')}
                  className="px-4 py-2 sm:py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2 min-h-[44px] touch-manipulation"
                  title="Копировать секретный ключ"
                >
                  <Copy className="w-4 h-4 sm:w-5 sm:h-5" />
                  {copied ? 'Скопировано!' : 'Копировать'}
                </button>
              )}
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-2">
              Секретный ключ для проверки подлинности уведомлений от YooMoney
            </p>
          </div>

          <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm sm:text-base text-blue-300">
                <p className="font-semibold mb-1">Важно:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-200/90">
                  <li>Секретный ключ используется для проверки подлинности платежей</li>
                  <li>Храните ключ в безопасности и не передавайте третьим лицам</li>
                  <li>Настройки применяются ко всем платежам через YooMoney</li>
                  <li>Убедитесь, что webhook URL настроен в n8n для обработки платежей</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={handleClearAllPendingPayments}
            disabled={clearingPayments}
            className="px-4 sm:px-6 py-2 sm:py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2 min-h-[44px] touch-manipulation"
            title="Удалить все незавершённые и тестовые платежи (pending и test) для всех пользователей"
            >
            {clearingPayments ? (
              <>
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                Очистка...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                Очистить pending и тестовые платежи
              </>
            )}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 sm:py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2 min-h-[44px] touch-manipulation"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                Сохранение...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 sm:w-5 sm:h-5" />
                Сохранить настройки
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default YooMoneyPanel
