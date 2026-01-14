import { useState, useEffect, useMemo } from 'react'
import { X, Copy, Check, Download, Globe, Smartphone, Monitor, Laptop, Apple, ExternalLink, Clock } from 'lucide-react'
import { getFirestore, doc, getDoc } from 'firebase/firestore'
import { APP_ID } from '../../../shared/constants/app.js'
import logger from '../../../shared/utils/logger.js'
import { detectPlatform, getPlatformInfo } from '../../../shared/utils/detectPlatform.js'

const SubscriptionSuccessModal = ({ 
  vpnLink, 
  onClose, 
  onCopy,
  tariffName = '',
  devices = 1,
  periodMonths = 1,
  expiresAt = null,
  paymentStatus = 'paid',
  testPeriod = false,
  paymentUrl = null,
  orderId = null,
  amount = null,
  requiresPayment = false,
  message = null,
  user = null // Добавляем user для формирования правильной ссылки
}) => {
  const [copied, setCopied] = useState(false)
  const [subscriptionLink, setSubscriptionLink] = useState(vpnLink || null)

  // Загружаем правильную ссылку на подписку с учетом тарифа
  useEffect(() => {
    const loadSubscriptionLink = async () => {
      if (!user) {
        // Если user не передан, используем vpnLink из пропсов
        setSubscriptionLink(vpnLink || null)
        return
      }

      const getSubId = () => {
        if (user?.subId && String(user.subId).trim() !== '') {
          return String(user.subId).trim()
        }
        return null
      }

      const subId = getSubId()
      if (!subId) {
        setSubscriptionLink(vpnLink || null)
        return
      }

      // ВАЖНО: Приоритет - сначала ссылка из тарифа, затем сохраненная, затем vpnLink, затем дефолтная
      if (user.tariffId) {
        try {
          const db = getFirestore()
          const tariffDoc = doc(db, `artifacts/${APP_ID}/public/data/tariffs`, user.tariffId)
          const tariffSnapshot = await getDoc(tariffDoc)
          if (tariffSnapshot.exists()) {
            const tariff = tariffSnapshot.data()
            if (tariff.subscriptionLink && tariff.subscriptionLink.trim()) {
              // Убираем завершающий слэш, если есть, и добавляем subId
              const baseLink = tariff.subscriptionLink.trim().replace(/\/$/, '')
              const linkFromTariff = `${baseLink}/${subId}`
              setSubscriptionLink(linkFromTariff)
              logger.info('SubscriptionSuccessModal', 'Использована ссылка из тарифа', {
                tariffId: user.tariffId,
                tariffName: tariff.name,
                finalLink: linkFromTariff
              })
              return
            }
          }
        } catch (err) {
          logger.warn('SubscriptionSuccessModal', 'Ошибка загрузки тарифа', {
            tariffId: user.tariffId
          }, err)
        }
      }

      // Если ссылки из тарифа нет, проверяем сохраненную ссылку
      if (user.subscriptionLink && String(user.subscriptionLink).trim() !== '') {
        const savedLink = String(user.subscriptionLink).trim()
        if (savedLink.includes('subs.skypath.fun') || savedLink.startsWith('https://')) {
          setSubscriptionLink(savedLink)
          return
        }
      }

      // Используем vpnLink из пропсов, если он есть
      if (vpnLink && String(vpnLink).trim() !== '') {
        setSubscriptionLink(String(vpnLink).trim())
        return
      }

      // Дефолтная ссылка
      const defaultLink = `https://subs.skypath.fun:3458/vk198/${subId}`
      setSubscriptionLink(defaultLink)
    }

    loadSubscriptionLink()
  }, [user?.tariffId, user?.subId, user?.subscriptionLink, vpnLink, user])

  const handleCopy = () => {
    if (onCopy && subscriptionLink) {
      onCopy(subscriptionLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handlePaymentClick = () => {
    if (paymentUrl) {
      window.open(paymentUrl, '_blank', 'noopener,noreferrer')
    }
  }

  // Загружаем настройки для получения ссылок на приложения
  const [appLinks, setAppLinks] = useState(null)
  
  useEffect(() => {
    const loadAppLinks = async () => {
      try {
        const db = getFirestore()
        const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
        const settingsSnapshot = await getDoc(settingsDoc)
        if (settingsSnapshot.exists()) {
          const settingsData = settingsSnapshot.data()
          setAppLinks(settingsData.appLinks || null)
        }
      } catch (err) {
        logger.warn('SubscriptionSuccessModal', 'Ошибка загрузки настроек приложений', null, err)
      }
    }
    loadAppLinks()
  }, [])

  // Определяем платформу пользователя
  const userPlatform = useMemo(() => detectPlatform(), [])
  const platformInfo = useMemo(() => getPlatformInfo(userPlatform), [userPlatform])

  // Функция для получения ссылки на приложение для конкретной платформы
  const getAppLink = (platform) => {
    if (!subscriptionLink) return '#'
    
    // Если есть ссылка на приложение для платформы, используем её
    const appLink = appLinks?.[platform]
    if (appLink && appLink.trim() !== '') {
      // Если ссылка содержит {subscriptionLink}, заменяем на реальную ссылку подписки
      return appLink.replace('{subscriptionLink}', subscriptionLink)
    }
    
    // Fallback: используем happ:// схему
    return `happ://add/${subscriptionLink}`
  }

  // Получаем ссылку для текущей платформы
  const currentPlatformLink = useMemo(() => getAppLink(userPlatform), [userPlatform, subscriptionLink, appLinks])
  
  // Получаем иконку для текущей платформы
  const PlatformIcon = useMemo(() => {
    const icons = {
      Smartphone: Smartphone,
      Apple: Apple,
      Laptop: Laptop,
      Monitor: Monitor,
      Download: Download,
    }
    return icons[platformInfo.icon] || Download
  }, [platformInfo.icon])

  // Получаем цвет для иконки (используем статические классы)
  const getIconColorClass = () => {
    const colorMap = {
      'green-400': 'text-green-400',
      'gray-300': 'text-gray-300',
      'blue-400': 'text-blue-400',
      'slate-400': 'text-slate-400',
    }
    return colorMap[platformInfo.color] || 'text-slate-400'
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-0 sm:p-2 md:p-4 bg-black/60 backdrop-blur-md overflow-y-auto" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-800 w-full sm:max-w-[90vw] md:max-w-2xl rounded-none sm:rounded-xl md:rounded-2xl shadow-2xl min-h-full sm:min-h-0 sm:my-4 sm:max-h-[90vh] sm:overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 sm:p-4 md:p-6 border-b border-slate-800 flex justify-between items-start sm:items-center gap-3">
          <div className="flex items-start sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <div className={`p-1.5 sm:p-2 rounded-lg flex-shrink-0 ${requiresPayment ? 'bg-yellow-500/20' : 'bg-green-500/20'}`}>
              {requiresPayment ? (
                <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400" />
              ) : (
                <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.25rem)] sm:text-xl font-bold text-white">
                {requiresPayment ? 'Требуется оплата' : 'Подписка успешно оформлена!'}
              </h3>
              <p className="text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm text-slate-400 mt-0.5 sm:mt-1">
                {message || (
                  <>
                    Тариф: <span className="text-white font-semibold">{tariffName}</span>
                    {devices > 1 && ` • ${devices} устройств`}
                    {periodMonths > 0 && ` • ${periodMonths} ${periodMonths === 1 ? 'месяц' : periodMonths < 5 ? 'месяца' : 'месяцев'}`}
                  </>
                )}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
            aria-label="Закрыть"
          >
            <X size={20} className="text-slate-400 sm:w-6 sm:h-6" />
          </button>
        </div>

        <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-5 md:space-y-6 overflow-y-auto">
          {/* Информация об оплате - если требуется оплата */}
          {requiresPayment && paymentUrl && (
            <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg sm:rounded-xl p-3 sm:p-4 space-y-3">
              <div className="flex items-center gap-2 text-yellow-400 mb-2">
                <Clock size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
                <span className="font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Оплата подписки</span>
              </div>
              
              <div className="space-y-2 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">
                {orderId && (
                  <div>
                    <p className="text-slate-400">Номер заказа:</p>
                    <p className="text-white font-mono">{orderId}</p>
                  </div>
                )}
                {amount && (
                  <div>
                    <p className="text-slate-400">Сумма к оплате:</p>
                    <p className="text-white font-semibold text-lg">{amount} ₽</p>
                  </div>
                )}
              </div>
              
              <button
                onClick={handlePaymentClick}
                className="w-full min-h-[44px] px-4 sm:px-5 py-2.5 sm:py-3 bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800 text-white rounded-lg sm:rounded-xl font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center gap-2 touch-manipulation"
              >
                <ExternalLink size={18} className="sm:w-5 sm:h-5" />
                <span>Перейти к оплате</span>
              </button>
              
              <p className="text-slate-400 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] sm:text-xs mt-2">
                После успешной оплаты подписка будет активирована автоматически
              </p>
            </div>
          )}

          {/* Информация о подписке - Mobile First */}
          {!requiresPayment && (
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg sm:rounded-xl p-3 sm:p-4 space-y-3">
            <div className="flex items-center gap-2 text-blue-400 mb-2">
              <Globe size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
              <span className="font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Ваша подписка</span>
            </div>
            
            {/* Детали подписки - адаптивная сетка */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">
              <div>
                <p className="text-slate-400 mb-0.5 sm:mb-1">Тариф</p>
                <p className="text-white font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] break-words">{tariffName || 'Не указан'}</p>
              </div>
              <div>
                <p className="text-slate-400 mb-0.5 sm:mb-1">Устройств</p>
                <p className="text-white font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">{devices}</p>
              </div>
              {periodMonths > 0 && (
                <div>
                  <p className="text-slate-400 mb-0.5 sm:mb-1">Период</p>
                  <p className="text-white font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">
                    {periodMonths} {periodMonths === 1 ? 'месяц' : periodMonths < 5 ? 'месяца' : 'месяцев'}
                  </p>
                </div>
              )}
              {expiresAt && (
                <div>
                  <p className="text-slate-400 mb-0.5 sm:mb-1">Действует до</p>
                  <p className="text-white font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] break-words">
                    {new Date(expiresAt).toLocaleDateString('ru-RU', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              )}
            </div>
            
            {testPeriod && (
              <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-blue-800">
                <div className="flex items-center gap-2 text-yellow-400">
                  <Clock size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] sm:text-xs font-semibold">Тестовый период: 24 часа</span>
                </div>
                {expiresAt && (
                  <p className="text-slate-400 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] sm:text-xs mt-1">
                    Окончание: {new Date(expiresAt).toLocaleString('ru-RU')}
                  </p>
                )}
                <p className="text-slate-400 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] sm:text-xs mt-1">
                  После окончания тестового периода подписка будет приостановлена до оплаты
                </p>
              </div>
            )}
          </div>
          )}

          {/* Ссылка на подписку - Mobile First с вертикальным стеком на мобильных */}
          {!requiresPayment && subscriptionLink && (
            <div className="space-y-2">
            <label className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-medium">
              Ваша ссылка на подписку (скопируйте ссылку):
            </label>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="flex-1 min-w-0 bg-slate-950 border border-slate-800 p-3 sm:p-4 rounded-lg sm:rounded-xl overflow-x-auto">
                <code className="text-blue-400 text-[clamp(0.65rem,0.6rem+0.25vw,0.75rem)] sm:text-xs font-mono break-all select-all whitespace-pre-wrap word-break break-words">
                  {subscriptionLink || 'Загрузка ссылки на подписку...'}
                </code>
              </div>
              <button
                onClick={handleCopy}
                className="btn-icon-only-mobile min-h-[44px] w-full sm:w-auto sm:min-w-[120px] px-3 sm:px-4 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg sm:rounded-xl font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center gap-2 touch-manipulation"
                title="Копировать ссылку"
                aria-label="Копировать ссылку"
              >
                {copied ? (
                  <>
                    <Check size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
                    <span className="btn-text whitespace-nowrap">Скопировано</span>
                  </>
                ) : (
                  <>
                    <Copy size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
                    <span className="btn-text whitespace-nowrap">Копировать</span>
                  </>
                )}
              </button>
            </div>
          </div>
          )}

          {/* Кнопка скачивания приложения для текущей ОС */}
          {!requiresPayment && userPlatform !== 'unknown' && (
            <div className="space-y-2 sm:space-y-3">
              <h4 className="text-slate-300 font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base flex items-center gap-2">
                <Download size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
                <span>Скачайте приложение на свое устройство</span>
              </h4>
              <a
                href={currentPlatformLink}
                className="w-full flex items-center justify-center gap-2 sm:gap-3 p-4 sm:p-5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg sm:rounded-xl transition-all group min-h-[44px] touch-manipulation"
                aria-label={`Добавить подписку в приложение для ${platformInfo.label}`}
                title={`Добавить подписку в приложение для ${platformInfo.label}`}
              >
                <PlatformIcon className={`w-6 h-6 sm:w-8 sm:h-8 ${getIconColorClass()} group-hover:scale-110 transition-transform flex-shrink-0`} />
                <span className="text-white font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">
                  Скачать для {platformInfo.label}
                </span>
                <ExternalLink size={18} className="sm:w-5 sm:h-5 text-slate-400 flex-shrink-0" />
              </a>
              
              {/* Кнопка для загрузки подписки в уже установленное приложение */}
              {subscriptionLink && (
                <a
                  href={`happ://add/${subscriptionLink}`}
                  className="w-full flex items-center justify-center gap-2 sm:gap-3 p-3 sm:p-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg sm:rounded-xl transition-all min-h-[44px] touch-manipulation"
                  aria-label="Добавить подписку в установленное приложение HAPP Proxy"
                  title="Добавить подписку в установленное приложение HAPP Proxy"
                >
                  <Globe size={18} className="sm:w-5 sm:h-5 text-white flex-shrink-0" />
                  <span className="text-white font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">
                    Добавить подписку в приложение
                  </span>
                </a>
              )}
            </div>
          )}
          
          {/* Если ОС не определена, показываем все кнопки */}
          {!requiresPayment && userPlatform === 'unknown' && (
            <div className="space-y-2 sm:space-y-3">
              <h4 className="text-slate-300 font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base flex items-center gap-2">
                <Download size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
                <span>Скачайте приложение на свое устройство</span>
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                {/* Windows */}
                <a
                  href={getAppLink('windows')}
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
                  href={getAppLink('android')}
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
                  href={getAppLink('ios')}
                  className="btn-icon-only-mobile flex flex-col items-center justify-center gap-1 sm:gap-2 p-3 sm:p-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg sm:rounded-xl transition-all group min-h-[44px] touch-manipulation"
                  aria-label="Добавить подписку в приложение для iOS"
                  title="Добавить подписку в приложение для iOS"
                >
                  <Apple className="w-6 h-6 sm:w-8 sm:h-8 text-gray-300 group-hover:scale-110 transition-transform flex-shrink-0" />
                  <span className="btn-text text-white font-medium text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">iOS</span>
                  <ExternalLink size={12} className="sm:w-3.5 sm:h-3.5 text-slate-400 flex-shrink-0" />
                </a>

                {/* macOS */}
                <a
                  href={getAppLink('macos')}
                  className="btn-icon-only-mobile flex flex-col items-center justify-center gap-1 sm:gap-2 p-3 sm:p-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg sm:rounded-xl transition-all group min-h-[44px] touch-manipulation"
                  aria-label="Добавить подписку в приложение для macOS"
                  title="Добавить подписку в приложение для macOS"
                >
                  <Laptop className="w-6 h-6 sm:w-8 sm:h-8 text-gray-300 group-hover:scale-110 transition-transform flex-shrink-0" />
                  <span className="btn-text text-white font-medium text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">macOS</span>
                  <ExternalLink size={12} className="sm:w-3.5 sm:h-3.5 text-slate-400 flex-shrink-0" />
                </a>
              </div>
              
              {/* Кнопка для загрузки подписки в уже установленное приложение */}
              {subscriptionLink && (
                <a
                  href={`happ://add/${subscriptionLink}`}
                  className="w-full flex items-center justify-center gap-2 sm:gap-3 p-3 sm:p-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg sm:rounded-xl transition-all min-h-[44px] touch-manipulation mt-3"
                  aria-label="Добавить подписку в установленное приложение HAPP Proxy"
                  title="Добавить подписку в установленное приложение HAPP Proxy"
                >
                  <Globe size={18} className="sm:w-5 sm:h-5 text-white flex-shrink-0" />
                  <span className="text-white font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">
                    Добавить подписку в приложение
                  </span>
                </a>
              )}
            </div>
          )}

          {/* Инструкция - Mobile First */}
          {!requiresPayment && (
            <div className="bg-slate-800 rounded-lg sm:rounded-xl p-3 sm:p-4">
            <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] mb-2 sm:mb-3">
              <strong className="text-white">Инструкция:</strong>
            </p>
            <ol className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm space-y-1.5 sm:space-y-2 list-decimal list-inside">
              <li>Скачайте и установите приложение для вашей платформы</li>
              <li>Откройте приложение и нажмите "Добавить подписку" или "Subscribe"</li>
              <li>Вставьте скопированную ссылку на подписку</li>
              <li>Приложение автоматически загрузит конфигурацию и подключится к VPN серверу</li>
            </ol>
          </div>
          )}

          {/* Кнопка закрытия - Mobile First */}
          <button
            onClick={onClose}
            className={`w-full min-h-[44px] px-4 sm:px-5 py-2.5 sm:py-3 rounded-lg sm:rounded-xl font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all touch-manipulation ${
              requiresPayment 
                ? 'bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white' 
                : 'bg-green-600 hover:bg-green-700 active:bg-green-800 text-white'
            }`}
            aria-label={requiresPayment ? 'Закрыть' : 'Готово, начать использование'}
          >
            {requiresPayment ? 'Закрыть' : 'Готово, начать использование'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SubscriptionSuccessModal
