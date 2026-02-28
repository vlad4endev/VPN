import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Save,
  Copy,
  CreditCard,
  RefreshCw,
  Eye,
  EyeOff,
  Trash2
} from 'lucide-react'
import logger from '../../../shared/utils/logger.js'
import { adminService } from '../services/adminService.js'
import { getPlategaSettings, savePlategaSettings } from '../services/plategaAdminService.js'

/**
 * Панель настроек платёжной системы Platega.
 * Данные сохраняются в локальный файл на сервере (server/data/platega-settings.json) и никуда не передаются.
 */
const PlategaPanel = ({ onSaveSettings }) => {
  const [merchantId, setMerchantId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [copied, setCopied] = useState(false)
  const [clearingPayments, setClearingPayments] = useState(false)
  const justSavedRef = useRef(false)

  useEffect(() => {
    const loadSettings = async () => {
      if (justSavedRef.current) {
        setLoading(false)
        return
      }
      try {
        const data = await getPlategaSettings()
        setMerchantId(data.plategaMerchantId || '')
        setApiKey(data.plategaSecretKey || '')
      } catch (err) {
        logger.error('Admin', 'Ошибка загрузки настроек Platega', null, err)
        setError(err.message || 'Ошибка загрузки настроек. Проверьте, что backend запущен и вы авторизованы как админ.')
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      if (merchantId.trim() && merchantId.trim().length < 10) {
        setError('ID мерчанта слишком короткий')
        setSaving(false)
        return
      }
      if (apiKey.trim() && apiKey.trim().length < 10) {
        setError('API ключ слишком короткий')
        setSaving(false)
        return
      }

      await savePlategaSettings({
        plategaMerchantId: merchantId.trim(),
        plategaSecretKey: apiKey.trim(),
      })

      logger.info('Admin', 'Настройки Platega сохранены в локальный файл на сервере', {
        hasMerchantId: !!merchantId.trim(),
        hasApiKey: !!apiKey.trim(),
      })

      justSavedRef.current = true
      setMerchantId(merchantId.trim())
      setApiKey(apiKey.trim())

      if (onSaveSettings) {
        try {
          await onSaveSettings()
        } catch (e) {
          logger.warn('Admin', 'Ошибка onSaveSettings', null, e)
        }
      }

      setSuccess('Настройки Platega сохранены (локальный файл на сервере)')
      setTimeout(() => setSuccess(null), 3000)
      setTimeout(() => { justSavedRef.current = false }, 1000)
    } catch (err) {
      logger.error('Admin', 'Ошибка сохранения настроек Platega', null, err)
      setError(err.message || 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }, [merchantId, apiKey, onSaveSettings])

  const handleCopy = useCallback(async (text, type) => {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text.trim())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      setError('Не удалось скопировать ' + type)
    }
  }, [])

  const handleClearAllPendingPayments = useCallback(async () => {
    if (!window.confirm('Удалить все незавершённые и тестовые платежи (статусы pending и test) для всех пользователей? Действие нельзя отменить.')) {
      return
    }
    setClearingPayments(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await adminService.clearAllPendingPayments()
      setSuccess(result.message || `Удалено ${result.deleted} платежей`)
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      setError('Ошибка при удалении платежей: ' + (err.message || ''))
    } finally {
      setClearingPayments(false)
    }
  }, [])

  if (loading) {
    return (
      <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-blue-600 rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-slate-800">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-200 flex items-center gap-2 sm:gap-3">
          <CreditCard className="w-5 h-5 sm:w-6 sm:h-6" />
          Platega
        </h2>
        <p className="text-slate-400 text-sm sm:text-base mt-1">
          Настройки для генерации ссылки на оплату. ID мерчанта и API ключ используются в коде при создании платежа.
        </p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); handleSave() }}
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
              ID мерчанта Platega
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                placeholder="6935052a-2f55-4986-b991-5e4c896e080d"
                className="flex-1 px-4 py-2 sm:py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm sm:text-base"
              />
              {merchantId.trim() && (
                <button
                  type="button"
                  onClick={() => handleCopy(merchantId, 'ID мерчанта')}
                  className="px-4 py-2 sm:py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2 min-h-[44px] touch-manipulation"
                >
                  <Copy className="w-4 h-4 sm:w-5 sm:h-5" />
                  {copied ? 'Скопировано!' : 'Копировать'}
                </button>
              )}
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-2">
              Идентификатор мерчанта из личного кабинета Platega (используется в заголовке X-MerchantId при генерации ссылки)
            </p>
          </div>

          <div>
            <label className="block text-slate-300 text-sm sm:text-base font-medium mb-2">
              API ключ Platega
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Секретный ключ из личного кабинета Platega"
                  className="w-full px-4 py-2 sm:py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm sm:text-base pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-200"
                  title={showApiKey ? 'Скрыть ключ' : 'Показать ключ'}
                >
                  {showApiKey ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
              </div>
              {apiKey.trim() && (
                <button
                  type="button"
                  onClick={() => handleCopy(apiKey, 'API ключ')}
                  className="px-4 py-2 sm:py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2 min-h-[44px] touch-manipulation"
                >
                  <Copy className="w-4 h-4 sm:w-5 sm:h-5" />
                  {copied ? 'Скопировано!' : 'Копировать'}
                </button>
              )}
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-2">
              Секретный ключ для подписи запросов (заголовок X-Secret). Без него ссылка на оплату не создаётся — только заказ в базе.
            </p>
          </div>

          <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CreditCard className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm sm:text-base text-blue-300">
                <p className="font-semibold mb-1">Важно</p>
                <ul className="list-disc list-inside space-y-1 text-blue-200/90">
                  <li>Значения сохраняются только на сервере в файле server/data/platega-settings.json и никуда не передаются</li>
                  <li>При генерации ссылки на оплату сервер берёт ключи из этого файла (приоритет: локальный файл → env → Firestore)</li>
                  <li>Можно также задать PLATEGA_MERCHANT_ID и PLATEGA_SECRET_KEY в server/.env</li>
                  <li>API ключ храните в безопасности и не передавайте третьим лицам</li>
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

export default PlategaPanel
