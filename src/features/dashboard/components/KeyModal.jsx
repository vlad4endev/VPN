import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, X, CheckCircle2, XCircle, AlertCircle, Copy, Download, Smartphone, Monitor, Laptop, Apple, ExternalLink, Clock } from 'lucide-react'
import { getUserStatus } from '../../../shared/utils/userStatus.js'
import { getFirestore, doc, getDoc } from 'firebase/firestore'
import { APP_ID } from '../../../shared/constants/app.js'
import logger from '../../../shared/utils/logger.js'
import { detectPlatform, getPlatformInfo } from '../../../shared/utils/detectPlatform.js'

const KeyModal = ({ user, onClose, clientStats = null, settings, onCopy, formatDate }) => {
  const { t } = useTranslation()
  const [subscriptionLink, setSubscriptionLink] = useState(null)
  const [subscriptionLinksList, setSubscriptionLinksList] = useState(null)
  const [subscriptionLinksWithPlan, setSubscriptionLinksWithPlan] = useState(null)
  const [loadingLink, setLoadingLink] = useState(true)

  // Проверяем наличие user
  if (!user) return null

  // Получаем subId для формирования ссылки
  const getSubId = () => {
    // Используем subId (с заглавной) - это основное поле для ссылки подписки
    if (user?.subId && String(user.subId).trim() !== '') {
      return String(user.subId).trim()
    }
    return null
  }
  
  const subId = getSubId()

  // Определяем платформу для выбора ссылки: телефон — Super, десктоп/ТВ — MULTI
  const userPlatformForLink = useMemo(() => detectPlatform(), [])
  const isMobileDevice = userPlatformForLink === 'android' || userPlatformForLink === 'ios'

  // Загружаем ссылку подписки: subscriptionLinksWithPlan (Super/MULTI по устройству), затем несколько ссылок, тариф, дефолт
  useEffect(() => {
    const loadSubscriptionLink = async () => {
      if (!user || !subId) {
        setLoadingLink(false)
        return
      }

      // Объединённый тариф со ссылками с планом: выбираем по устройству (телефон — Super, десктоп/ТВ — MULTI)
      const withPlan = user.subscriptionLinksWithPlan && Array.isArray(user.subscriptionLinksWithPlan) && user.subscriptionLinksWithPlan.length > 0
      if (withPlan) {
        const tariffKey = String(user?.tariffName || '').toLowerCase()
        const isMegaMixTariff = /megamix|mega\s*mix/.test(tariffKey)
        const isSuperTariff = !isMegaMixTariff && tariffKey.includes('super')
        const isMultiTariff = !isMegaMixTariff && tariffKey.includes('multi')

        const superEntry = user.subscriptionLinksWithPlan.find(p => (p.plan || '').toLowerCase().includes('super'))
        const multiEntry = user.subscriptionLinksWithPlan.find(p => (p.plan || '').toLowerCase().includes('multi'))

        // MegaMix показываем обе ссылки, обычные Super/MULTI — только одну
        const selectedWithPlan = isMegaMixTariff
          ? user.subscriptionLinksWithPlan
          : isSuperTariff
            ? (superEntry ? [superEntry] : [user.subscriptionLinksWithPlan[0]])
            : isMultiTariff
              ? (multiEntry ? [multiEntry] : [user.subscriptionLinksWithPlan[0]])
              : user.subscriptionLinksWithPlan

        const primary = isMegaMixTariff
          ? (isMobileDevice
            ? (superEntry?.link || selectedWithPlan[0]?.link)
            : (multiEntry?.link || selectedWithPlan[0]?.link))
          : (selectedWithPlan[0]?.link || null)

        setSubscriptionLinksWithPlan(selectedWithPlan)
        setSubscriptionLinksList(selectedWithPlan.map(p => p.link))
        setSubscriptionLink(primary || selectedWithPlan[0]?.link || null)
        setLoadingLink(false)
        return
      }
      setSubscriptionLinksWithPlan(null)

      // Объединённый тариф: несколько ссылок на подписку (2+ серверов) без плана
      if (user.subscriptionLinks && Array.isArray(user.subscriptionLinks) && user.subscriptionLinks.length > 0) {
        setSubscriptionLinksWithPlan(null)
        setSubscriptionLinksList(user.subscriptionLinks)
        setSubscriptionLink(user.subscriptionLinks[0])
        setLoadingLink(false)
        return
      }

      // ВАЖНО: Приоритет - сначала ссылка из тарифа (актуальная), затем сохраненная, затем дефолтная
      // Загружаем тариф и используем ссылку из него (если есть tariffId)
      if (user.tariffId) {
        try {
          const db = getFirestore()
          const tariffDoc = doc(db, `artifacts/${APP_ID}/public/data/tariffs`, user.tariffId)
          const tariffSnapshot = await getDoc(tariffDoc)
          if (tariffSnapshot.exists()) {
            const tariff = tariffSnapshot.data()
            if (tariff.subscriptionLink && tariff.subscriptionLink.trim()) {
              const baseLink = tariff.subscriptionLink.trim().replace(/\/$/, '')
              const linkFromTariff = `${baseLink}/${subId}`
              setSubscriptionLinksWithPlan(null)
              setSubscriptionLinksList(null)
              setSubscriptionLink(linkFromTariff)
              setLoadingLink(false)
              logger.info('KeyModal', 'Использована ссылка из тарифа', {
                tariffId: user.tariffId,
                tariffName: tariff.name,
                baseLink: tariff.subscriptionLink,
                finalLink: linkFromTariff
              })
              return
            }
          }
        } catch (err) {
          logger.warn('KeyModal', 'Ошибка загрузки тарифа', {
            tariffId: user.tariffId
          }, err)
        }
      }
      
      // Если ссылки из тарифа нет, проверяем сохраненную ссылку (fallback)
      if (user.subscriptionLink && String(user.subscriptionLink).trim() !== '') {
        const savedLink = String(user.subscriptionLink).trim()
        // Проверяем, что ссылка содержит правильный формат
        if (savedLink.includes('subs.skypath.fun') || savedLink.startsWith('https://')) {
          setSubscriptionLinksWithPlan(null)
          setSubscriptionLinksList(null)
          setSubscriptionLink(savedLink)
          setLoadingLink(false)
          logger.info('KeyModal', 'Использована сохраненная ссылка (fallback)', {
            hasTariffId: !!user.tariffId
          })
          return
        }
      }
      
      // Если ссылка из тарифа и сохраненная не получены, используем дефолтную
      const defaultLink = `https://subs.skypath.fun:3458/vk198/${subId}`
      setSubscriptionLinksWithPlan(null)
      setSubscriptionLinksList(null)
      setSubscriptionLink(defaultLink)
      setLoadingLink(false)
      logger.info('KeyModal', 'Использована дефолтная ссылка', {
        hasTariffId: !!user.tariffId
      })
    }
    
    loadSubscriptionLink()
  }, [user?.tariffId, user?.tariffName, user?.subId, user?.subscriptionLink, user?.subscriptionLinks, user?.subscriptionLinksWithPlan, subId, isMobileDevice])

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
        logger.warn('KeyModal', 'Ошибка загрузки настроек приложений', null, err)
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
  
  if (loadingLink) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6">
          <p className="text-slate-400">{t('keyModal.loadingLink')}</p>
        </div>
      </div>
    )
  }

  if (!subscriptionLink) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6">
          <p className="text-red-400">{t('keyModal.linkUnavailable')}</p>
        </div>
      </div>
    )
  }
  
  const userStatus = getUserStatus(user, clientStats)

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-2 md:p-4 bg-black/60 backdrop-blur-md overflow-y-auto" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-800 w-full sm:max-w-[90vw] md:max-w-md rounded-none sm:rounded-2xl md:rounded-[2.5rem] shadow-2xl min-h-full sm:min-h-0 sm:my-4 sm:max-h-[90vh] sm:overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-6 md:p-8 border-b border-slate-800 flex justify-between items-center gap-3">
          <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.25rem)] sm:text-xl font-bold text-white flex items-center gap-2 sm:gap-3">
            <Globe size={18} className="sm:w-5 sm:h-5 sm:w-[22px] sm:h-[22px] text-blue-500 flex-shrink-0" /> 
            <span>{t('keyModal.title')}</span>
          </h3>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-slate-800 rounded-full transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
            aria-label={t('common.close')}
          >
            <X size={20} className="sm:w-6 sm:h-6 text-slate-400" />
          </button>
        </div>
        <div className="p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-5 md:space-y-6 overflow-y-auto">
          <div className="space-y-2">
            <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400 font-medium">{t('app.status')}</p>
            <div className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full font-bold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] ${
              userStatus.status === 'active' ? 'bg-green-900/30 text-green-400' :
              userStatus.status === 'expiring_soon' ? 'bg-yellow-900/30 text-yellow-400' :
              userStatus.status === 'grace' ? 'bg-orange-900/30 text-orange-400' :
              userStatus.status === 'expired' ? 'bg-red-900/30 text-red-400' :
              'bg-slate-800 text-slate-400'
            }`}>
              {userStatus.status === 'active' && <CheckCircle2 className="w-4 h-4 animate-pulse flex-shrink-0" />}
              {(userStatus.status === 'expiring_soon' || userStatus.status === 'grace') && <Clock className="w-4 h-4 flex-shrink-0" />}
              {userStatus.status === 'expired' && <XCircle className="w-4 h-4 flex-shrink-0" />}
              {userStatus.status === 'no-key' && <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              <span>{userStatus.label}</span>
            </div>
          </div>
          {/* Счётчик устройств */}
          {(user?.devices != null || user?.devices === 0) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)]">
              <span><strong className="text-slate-300">{t('keyModal.deviceLimit', 'Лимит устройств')}:</strong> {Number(user.devices) || 1}</span>
              <span><strong className="text-slate-300">{t('keyModal.connectedDevices', 'Подключено')}:</strong> —</span>
            </div>
          )}
          <div className="space-y-2">
            <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400 font-medium">{t('app.subscriptionLinkLabel')}</p>
            {(() => {
              const hasSuper = subscriptionLinksWithPlan?.some(p => (p.plan || '').toLowerCase().includes('super'))
              const hasMulti = subscriptionLinksWithPlan?.some(p => (p.plan || '').toLowerCase().includes('multi'))
              const isMegamix = hasSuper && hasMulti
              return isMegamix ? (
              <div className="space-y-3">
                <p className="text-slate-500 text-xs">{isMobileDevice ? t('keyModal.linkForPhone', 'Ссылка для телефона (Super) — ниже обе') : t('keyModal.linkForDesktop', 'Ссылка для десктопа и ТВ (MULTI) — ниже обе')}</p>
                {subscriptionLinksWithPlan.map((item, idx) => {
                  const label = (item.plan || '').toLowerCase().includes('super') ? 'Super (телефон)' : (item.plan || '').toLowerCase().includes('multi') ? 'MULTI (десктоп, ТВ)' : t('keyModal.serverLink', { n: idx + 1 })
                  const link = item.link || item
                  return (
                    <div key={idx} className="space-y-1.5">
                      <span className="text-slate-500 text-xs font-medium">{label}</span>
                      <div className="bg-black/40 border border-slate-800 p-3 sm:p-4 rounded-xl break-all font-mono text-[clamp(0.65rem,0.6rem+0.25vw,0.75rem)] sm:text-xs text-blue-400 word-break break-words">
                        {link}
                      </div>
                      <button
                        type="button"
                        onClick={() => onCopy(link)}
                        className="w-full min-h-[40px] py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium text-sm flex items-center justify-center gap-2 text-white"
                        aria-label={t('dashboard.copyLinkAria')}
                      >
                        <Copy size={16} className="flex-shrink-0" /> {t('app.copyLink')}
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : subscriptionLinksList && subscriptionLinksList.length > 1 ? (
              <div className="space-y-3">
                <p className="text-slate-500 text-xs">{t('keyModal.multipleLinksHint', 'Ссылки на подписку для каждого сервера:')}</p>
                {subscriptionLinksList.map((link, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <span className="text-slate-500 text-xs font-medium">{t('keyModal.serverLink', { n: idx + 1 })}</span>
                    <div className="bg-black/40 border border-slate-800 p-3 sm:p-4 rounded-xl break-all font-mono text-[clamp(0.65rem,0.6rem+0.25vw,0.75rem)] sm:text-xs text-blue-400 word-break break-words">
                      {link}
                    </div>
                    <button
                      type="button"
                      onClick={() => onCopy(link)}
                      className="w-full min-h-[40px] py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium text-sm flex items-center justify-center gap-2 text-white"
                      aria-label={t('dashboard.copyLinkAria')}
                    >
                      <Copy size={16} className="flex-shrink-0" /> {t('app.copyLink')}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="bg-black/40 border border-slate-800 p-3 sm:p-4 md:p-5 rounded-2xl sm:rounded-3xl break-all font-mono text-[clamp(0.65rem,0.6rem+0.25vw,0.75rem)] sm:text-xs text-blue-400 leading-relaxed ring-1 ring-blue-500/10 word-break break-words whitespace-pre-wrap">
                  {subscriptionLink}
                </div>
                <button
                  onClick={() => onCopy(subscriptionLink)}
                  className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-500 active:bg-blue-700 py-3 sm:py-4 md:py-5 rounded-2xl sm:rounded-3xl font-bold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] flex items-center justify-center gap-2 sm:gap-3 transition-all text-white shadow-xl shadow-blue-600/20 active:scale-95 touch-manipulation"
                  aria-label={t('dashboard.copyLinkAria')}
                >
                  <Copy size={18} className="sm:w-5 sm:h-5 flex-shrink-0" /> 
                  <span>{t('app.copyLink')}</span>
                </button>
              </>
            )
          })()}
          </div>
          
          {/* Кнопка скачивания приложения для текущей ОС */}
          {userPlatform !== 'unknown' && (
            <div className="space-y-2 sm:space-y-3 pt-2 border-t border-slate-800">
              <h4 className="text-slate-300 font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base flex items-center gap-2">
                <Download size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
                <span>{t('keyModal.downloadApp')}</span>
              </h4>
              <a
                href={currentPlatformLink}
                className="w-full flex items-center justify-center gap-2 sm:gap-3 p-4 sm:p-5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg sm:rounded-xl transition-all group min-h-[44px] touch-manipulation"
                aria-label={t('keyModal.downloadFor', { platform: platformInfo.label })}
                title={t('keyModal.downloadFor', { platform: platformInfo.label })}
              >
                <PlatformIcon className={`w-6 h-6 sm:w-8 sm:h-8 ${getIconColorClass()} group-hover:scale-110 transition-transform flex-shrink-0`} />
                <span className="text-white font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">
                  {t('keyModal.downloadFor', { platform: platformInfo.label })}
                </span>
                <ExternalLink size={18} className="sm:w-5 sm:h-5 text-slate-400 flex-shrink-0" />
              </a>
              
              {/* Кнопка для загрузки подписки в уже установленное приложение */}
              {subscriptionLink && (
                <a
                  href={`happ://add/${subscriptionLink}`}
                  className="w-full flex items-center justify-center gap-2 sm:gap-3 p-3 sm:p-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg sm:rounded-xl transition-all min-h-[44px] touch-manipulation"
                  aria-label={t('keyModal.addSubscription')}
                  title={t('keyModal.addSubscription')}
                >
                  <Globe size={18} className="sm:w-5 sm:h-5 text-white flex-shrink-0" />
                  <span className="text-white font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">
                    {t('keyModal.addSubscription')}
                  </span>
                </a>
              )}
            </div>
          )}
          
          {/* Если ОС не определена, показываем все кнопки */}
          {userPlatform === 'unknown' && (
            <div className="space-y-2 sm:space-y-3 pt-2 border-t border-slate-800">
              <h4 className="text-slate-300 font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base flex items-center gap-2">
                <Download size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
                <span>{t('keyModal.downloadApp')}</span>
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                {/* Windows */}
                <a
                  href={getAppLink('windows')}
                  className="btn-icon-only-mobile flex flex-col items-center justify-center gap-1 sm:gap-2 p-3 sm:p-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg sm:rounded-xl transition-all group min-h-[44px] touch-manipulation"
                  aria-label={t('keyModal.downloadFor', { platform: 'Windows' })}
                  title={t('keyModal.downloadFor', { platform: 'Windows' })}
                >
                  <Monitor className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400 group-hover:scale-110 transition-transform flex-shrink-0" />
                  <span className="btn-text text-white font-medium text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Windows</span>
                  <ExternalLink size={12} className="sm:w-3.5 sm:h-3.5 text-slate-400 flex-shrink-0" />
                </a>

                {/* Android */}
                <a
                  href={getAppLink('android')}
                  className="btn-icon-only-mobile flex flex-col items-center justify-center gap-1 sm:gap-2 p-3 sm:p-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg sm:rounded-xl transition-all group min-h-[44px] touch-manipulation"
                  aria-label={t('keyModal.downloadFor', { platform: 'Android' })}
                  title={t('keyModal.downloadFor', { platform: 'Android' })}
                >
                  <Smartphone className="w-6 h-6 sm:w-8 sm:h-8 text-green-400 group-hover:scale-110 transition-transform flex-shrink-0" />
                  <span className="btn-text text-white font-medium text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Android</span>
                  <ExternalLink size={12} className="sm:w-3.5 sm:h-3.5 text-slate-400 flex-shrink-0" />
                </a>

                {/* iOS */}
                <a
                  href={getAppLink('ios')}
                  className="btn-icon-only-mobile flex flex-col items-center justify-center gap-1 sm:gap-2 p-3 sm:p-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg sm:rounded-xl transition-all group min-h-[44px] touch-manipulation"
                  aria-label={t('keyModal.downloadFor', { platform: 'iOS' })}
                  title={t('keyModal.downloadFor', { platform: 'iOS' })}
                >
                  <Apple className="w-6 h-6 sm:w-8 sm:h-8 text-gray-300 group-hover:scale-110 transition-transform flex-shrink-0" />
                  <span className="btn-text text-white font-medium text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">iOS</span>
                  <ExternalLink size={12} className="sm:w-3.5 sm:h-3.5 text-slate-400 flex-shrink-0" />
                </a>

                {/* macOS */}
                <a
                  href={getAppLink('macos')}
                  className="btn-icon-only-mobile flex flex-col items-center justify-center gap-1 sm:gap-2 p-3 sm:p-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg sm:rounded-xl transition-all group min-h-[44px] touch-manipulation"
                  aria-label={t('keyModal.downloadFor', { platform: 'macOS' })}
                  title={t('keyModal.downloadFor', { platform: 'macOS' })}
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
                  aria-label={t('keyModal.addSubscription')}
                  title={t('keyModal.addSubscription')}
                >
                  <Globe size={18} className="sm:w-5 sm:h-5 text-white flex-shrink-0" />
                  <span className="text-white font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">
                    {t('keyModal.addSubscription')}
                  </span>
                </a>
              )}
            </div>
          )}
          <div className="pt-3 sm:pt-4 border-t border-slate-800 space-y-2">
            <p className="text-slate-400 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">
              <strong className="text-slate-300">{t('app.plan')}</strong> {user.plan === 'premium' ? t('app.premium') : t('app.free')}
            </p>
            {(clientStats?.expiryTime || user.expiresAt) && (
              <p className="text-slate-400 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">
                <strong className="text-slate-300">{t('app.expires')}</strong>{' '}
                {clientStats?.expiryTime && clientStats.expiryTime > 0
                  ? formatDate(clientStats.expiryTime)
                  : user.expiresAt
                  ? formatDate(user.expiresAt)
                  : t('app.unlimited')}
                {clientStats?.expiryTime && (
                  <span className="text-slate-500 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] sm:text-xs ml-1">{t('app.from3xui')}</span>
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

