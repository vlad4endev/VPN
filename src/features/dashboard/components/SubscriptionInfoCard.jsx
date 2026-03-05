import React from 'react'
import { useTranslation } from 'react-i18next'
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Smartphone, 
  Calendar, 
  Zap, 
  CreditCard 
} from 'lucide-react'
import { formatTimeRemaining, formatDate } from '../../../shared/utils/formatDate.js'
import logger from '../../../shared/utils/logger.js'

const SubscriptionInfoCard = ({
  currentUser,
  currentTariff,
  userStatus,
  timeRemaining,
  hasSubscription,
  creatingSubscription,
  showPaymentProcessing,
  onHandleAddDevices,
  onHandleRenewSubscription,
  setShowAddDevicesModal,
  setAdditionalDevices,
  setPaymentProcessingMessage,
  setShowPaymentProcessing,
  setSubscriptionSuccess,
  setShowSuccessModal,
  setPaymentWindowRef,
  setPaymentOrderId,
  paymentProcessingMessageTimerRef
}) => {
  const { t } = useTranslation()

  if (!hasSubscription) return null

  return (
    <div className="bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 rounded-lg sm:rounded-xl p-4 sm:p-5 border border-slate-700">
      {/* Заголовок с тарифом и статусом - компактная версия */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <h3 className="text-[clamp(1.25rem,1.15rem+0.5vw,1.5rem)] font-bold text-white">
            {currentUser.tariffName || t('dashboard.notSpecified')}
          </h3>
          {currentUser.tariffName?.toLowerCase() === 'super' && (
            <span className="px-2 py-0.5 bg-blue-600 text-white text-[clamp(0.65rem,0.6rem+0.25vw,0.75rem)] font-bold rounded-full">
              PREMIUM
            </span>
          )}
          <div className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg ${userStatus.color} font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)]`}>
            {userStatus.status === 'active' && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
            {(userStatus.status === 'expiring_soon' || userStatus.status === 'grace') && <Clock className="w-3.5 h-3.5 flex-shrink-0" />}
            {userStatus.status === 'expired' && <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
            {userStatus.status === 'unpaid' && <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
            {userStatus.status === 'test_period' && <Clock className="w-3.5 h-3.5 flex-shrink-0" />}
            {userStatus.status === 'no-key' && <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
            <span>{userStatus.label}</span>
          </div>
        </div>
      </div>

      {/* Компактная сетка метрик */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-4">
        {/* Устройств */}
        <div className="bg-slate-900/60 rounded-lg p-2.5 sm:p-3 border border-slate-700/50 text-center relative">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Smartphone className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <p className="text-slate-400 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] font-medium">{t('dashboard.devices')}</p>
          </div>
          <p className="text-white font-bold text-[clamp(1rem,0.95rem+0.25vw,1.25rem)]">
            {currentUser.devices || currentTariff?.devices || 1}
          </p>
          {(() => {
            const isSuper = currentUser?.tariffName?.toLowerCase() === 'super' ||
              (currentTariff && (currentTariff.plan?.toLowerCase() === 'super' || currentTariff.name?.toLowerCase() === 'super'))
            const canAdd = (userStatus.status === 'active' || userStatus.status === 'expiring_soon' || userStatus.status === 'test_period') && onHandleAddDevices
            return isSuper && canAdd
          })() && (
            <button
              type="button"
              onClick={() => { setAdditionalDevices(1); setShowAddDevicesModal(true) }}
              disabled={creatingSubscription}
              className="mt-2 w-full min-h-[28px] px-2 py-1 bg-blue-600/90 hover:bg-blue-600 text-white text-[clamp(0.65rem,0.6rem+0.2vw,0.75rem)] font-semibold rounded-md transition-all flex items-center justify-center gap-1 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={t('dashboard.addDevicesAria', 'Добавить устройства')}
            >
              <span className="inline-flex items-center gap-0.5">+ {t('dashboard.addDevices', 'Добавить устройства')}</span>
            </button>
          )}
        </div>

        {/* Период или Трафик */}
        {currentUser.periodMonths ? (
          <div className="bg-slate-900/60 rounded-lg p-2.5 sm:p-3 border border-slate-700/50 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Calendar className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-slate-400 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] font-medium">{t('dashboard.period')}</p>
            </div>
            <p className="text-white font-bold text-[clamp(1rem,0.95rem+0.25vw,1.25rem)]">
              {currentUser.periodMonths} {currentUser.periodMonths === 1 ? t('dashboard.month') : t('dashboard.months')}
            </p>
          </div>
        ) : (
          (currentTariff || currentUser?.paymentStatus) && (
            <div className="bg-slate-900/60 rounded-lg p-2.5 sm:p-3 border border-slate-700/50 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Zap className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                <p className="text-slate-400 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] font-medium">{t('dashboard.traffic')}</p>
              </div>
              <p className="text-white font-bold text-[clamp(1rem,0.95rem+0.25vw,1.25rem)]">
                {currentUser?.paymentStatus === 'test_period' ? '3 GB' :
                 currentTariff?.trafficGB > 0 ? `${currentTariff.trafficGB} GB` : '∞'}
              </p>
            </div>
          )
        )}

        {/* Трафик или пустой */}
        {(currentTariff || currentUser?.paymentStatus) && currentUser.periodMonths && (
          <div className="bg-slate-900/60 rounded-lg p-2.5 sm:p-3 border border-slate-700/50 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Zap className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <p className="text-slate-400 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] font-medium">{t('dashboard.traffic')}</p>
            </div>
            <p className="text-white font-bold text-[clamp(1rem,0.95rem+0.25vw,1.25rem)]">
              {currentUser?.paymentStatus === 'test_period' ? '3 GB' :
               currentTariff?.trafficGB > 0 ? `${currentTariff.trafficGB} GB` : '∞'}
            </p>
          </div>
        )}
      </div>

      {/* Компактная строка с датой и статусом оплаты */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-2.5 sm:p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 mb-3">
        {currentUser.expiresAt && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Calendar className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-slate-400 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] mb-0.5">{t('dashboard.validityPeriod')}</p>
              {timeRemaining && !timeRemaining.isExpired ? (
                <div>
                  <p className={`font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] ${
                    timeRemaining.days <= 3 && timeRemaining.months === 0 
                      ? 'text-yellow-400' 
                      : timeRemaining.days <= 7 && timeRemaining.months === 0
                      ? 'text-orange-400'
                      : 'text-white'
                  }`}>
                    {formatTimeRemaining(currentUser.expiresAt, t)}
                  </p>
                  <p className="text-slate-500 text-[clamp(0.65rem,0.6rem+0.25vw,0.7rem)] mt-0.5">
                    До {formatDate(currentUser.expiresAt)}
                  </p>
                </div>
              ) : (
                <p className="text-red-400 font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)]">
                  {t('dashboard.expired')}
                </p>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <CreditCard className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-slate-400 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] mb-0.5">{t('dashboard.payment')}</p>
            <p className={`font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] ${
              currentUser.paymentStatus === 'paid' ? 'text-green-400' :
              currentUser.paymentStatus === 'test_period' ? 'text-yellow-400' :
              currentUser.paymentStatus === 'unpaid' ? 'text-red-400' :
              'text-slate-300'
            }`}>
              {currentUser.paymentStatus === 'paid' ? t('dashboard.paid') : 
               currentUser.paymentStatus === 'test_period' ? t('dashboard.test') :
               currentUser.paymentStatus === 'unpaid' ? t('dashboard.unpaid') : 
               t('dashboard.dash')}
            </p>
          </div>
        </div>
      </div>

      {/* Компактные предупреждения */}
      <div className="space-y-2 sm:space-y-2.5">
        {/* Подписка истекает через X дней — показываем блок и кнопку «Продлить» */}
        {userStatus.status === 'expiring_soon' && currentUser?.expiresAt && (
          <div className="p-2.5 sm:p-3 bg-yellow-900/20 border border-yellow-800/50 rounded-lg">
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-yellow-400 font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)]">
                    {t('dashboard.expiringIn')} {timeRemaining?.days != null ? (timeRemaining.days === 0 ? t('dashboard.lessThanDay') : `${timeRemaining.days} ${timeRemaining.days === 1 ? t('dashboard.day_one') : timeRemaining.days < 5 ? t('dashboard.day_few') : t('dashboard.day_many')}`) : t('dashboard.daysDefault')}
                  </p>
                  <p className="text-yellow-300/80 text-[clamp(0.65rem,0.6rem+0.25vw,0.75rem)] mt-0.5">
                    {t('dashboard.renewHint', { date: formatDate(currentUser.expiresAt) })}
                  </p>
                </div>
                {onHandleRenewSubscription && (
                  <button
                    onClick={async () => {
                      if (paymentProcessingMessageTimerRef.current) clearTimeout(paymentProcessingMessageTimerRef.current)
                      setPaymentProcessingMessage(t('paymentProcessing.accountant'))
                      setShowPaymentProcessing(true)
                      paymentProcessingMessageTimerRef.current = setTimeout(() => {
                        setPaymentProcessingMessage(t('paymentProcessing.accountantLong'))
                        paymentProcessingMessageTimerRef.current = null
                      }, 3000)
                      try {
                        const result = await onHandleRenewSubscription()
                        if (paymentProcessingMessageTimerRef.current) { clearTimeout(paymentProcessingMessageTimerRef.current); paymentProcessingMessageTimerRef.current = null }
                        setShowPaymentProcessing(false)
                        if (result && result.paymentUrl && result.requiresPayment) {
                          const windowFeatures = ['width=400', 'height=700', 'left=' + (window.screen.width / 2 - 200), 'top=' + (window.screen.height / 2 - 350), 'resizable=yes', 'scrollbars=yes', 'status=no', 'toolbar=no', 'menubar=no', 'location=no'].join(',')
                          const paymentWindow = window.open(result.paymentUrl, 'payment_miniapp', windowFeatures)
                          if (paymentWindow) paymentWindow.focus()
                          setSubscriptionSuccess({ vpnLink: null, paymentUrl: result.paymentUrl, orderId: result.orderId, amount: result.amount, requiresPayment: true, message: t('dashboard.paymentWindowOpen'), tariffId: result.tariffId || currentUser.tariffId || null, tariffName: result.tariffName || currentUser.tariffName || t('dashboard.notSpecified'), devices: result.devices || currentUser.devices || 1, periodMonths: result.periodMonths || currentUser.periodMonths || 1, discount: result.discount || 0 })
                          setShowSuccessModal(true)
                        }
                      } catch (error) {
                        if (paymentProcessingMessageTimerRef.current) { clearTimeout(paymentProcessingMessageTimerRef.current); paymentProcessingMessageTimerRef.current = null }
                        setShowPaymentProcessing(false)
                      }
                    }}
                    disabled={creatingSubscription || showPaymentProcessing}
                    className="min-h-[36px] px-3 py-1.5 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] transition-all flex items-center justify-center gap-1.5 touch-manipulation whitespace-nowrap"
                    aria-label={t('dashboard.renewAria')}
                  >
                    <CreditCard className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{creatingSubscription || showPaymentProcessing ? t('dashboard.processing') : t('dashboard.renew')}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Просрочено до 5 дней — показываем блок и кнопку «Продлить», подписка не исчезает */}
        {userStatus.status === 'grace' && (
          <div className="p-2.5 sm:p-3 bg-orange-900/20 border border-orange-800/50 rounded-lg">
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-orange-400 font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)]">
                    {userStatus.label}
                  </p>
                  <p className="text-orange-300/80 text-[clamp(0.65rem,0.6rem+0.25vw,0.75rem)] mt-0.5">
                    {t('dashboard.payWithin5Days')}
                  </p>
                </div>
                {onHandleRenewSubscription && (
                  <button
                    onClick={async () => {
                      if (paymentProcessingMessageTimerRef.current) clearTimeout(paymentProcessingMessageTimerRef.current)
                      setPaymentProcessingMessage(t('paymentProcessing.accountant'))
                      setShowPaymentProcessing(true)
                      paymentProcessingMessageTimerRef.current = setTimeout(() => {
                        setPaymentProcessingMessage(t('paymentProcessing.accountantLong'))
                        paymentProcessingMessageTimerRef.current = null
                      }, 3000)
                      try {
                        const result = await onHandleRenewSubscription()
                        if (paymentProcessingMessageTimerRef.current) { clearTimeout(paymentProcessingMessageTimerRef.current); paymentProcessingMessageTimerRef.current = null }
                        setShowPaymentProcessing(false)
                        if (result && result.paymentUrl && result.requiresPayment) {
                          const windowFeatures = ['width=400', 'height=700', 'left=' + (window.screen.width / 2 - 200), 'top=' + (window.screen.height / 2 - 350), 'resizable=yes', 'scrollbars=yes', 'status=no', 'toolbar=no', 'menubar=no', 'location=no'].join(',')
                          const paymentWindow = window.open(result.paymentUrl, 'payment_miniapp', windowFeatures)
                          if (paymentWindow) {
                            paymentWindow.focus()
                            setPaymentWindowRef(paymentWindow)
                            setPaymentOrderId(result.orderId)
                          }
                          setSubscriptionSuccess({ vpnLink: null, paymentUrl: result.paymentUrl, orderId: result.orderId, amount: result.amount, requiresPayment: true, message: t('dashboard.paymentWindowOpen'), tariffId: result.tariffId || currentUser.tariffId || null, tariffName: result.tariffName || currentUser.tariffName || t('dashboard.notSpecified'), devices: result.devices || currentUser.devices || 1, periodMonths: result.periodMonths || currentUser.periodMonths || 1, discount: result.discount || 0 })
                          setShowSuccessModal(true)
                        }
                      } catch (error) {
                        if (paymentProcessingMessageTimerRef.current) { clearTimeout(paymentProcessingMessageTimerRef.current); paymentProcessingMessageTimerRef.current = null }
                        setShowPaymentProcessing(false)
                      }
                    }}
                    disabled={creatingSubscription || showPaymentProcessing}
                    className="min-h-[36px] px-3 py-1.5 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] transition-all flex items-center justify-center gap-1.5 touch-manipulation whitespace-nowrap"
                    aria-label={t('dashboard.renewAria')}
                  >
                    <CreditCard className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{creatingSubscription || showPaymentProcessing ? t('dashboard.processing') : t('dashboard.renew')}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {currentUser?.paymentStatus === 'test_period' && currentUser?.testPeriodEndDate && (
          <div className="p-2.5 sm:p-3 bg-yellow-900/20 border border-yellow-800/50 rounded-lg">
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-yellow-400 font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)]">
                    Тест до {formatDate(currentUser.testPeriodEndDate)}
                  </p>
                  <p className="text-yellow-300/80 text-[clamp(0.65rem,0.6rem+0.25vw,0.75rem)] mt-0.5">{t('dashboard.afterExpiryNote')}</p>
                </div>
                {onHandleRenewSubscription && (
                  <button
                    onClick={async () => {
                      if (paymentProcessingMessageTimerRef.current) clearTimeout(paymentProcessingMessageTimerRef.current)
                      setPaymentProcessingMessage(t('paymentProcessing.accountant'))
                      setShowPaymentProcessing(true)
                      paymentProcessingMessageTimerRef.current = setTimeout(() => {
                        setPaymentProcessingMessage(t('paymentProcessing.accountantLong'))
                        paymentProcessingMessageTimerRef.current = null
                      }, 3000)
                      try {
                        const result = await onHandleRenewSubscription()
                        if (paymentProcessingMessageTimerRef.current) { clearTimeout(paymentProcessingMessageTimerRef.current); paymentProcessingMessageTimerRef.current = null }
                        setShowPaymentProcessing(false)
                        if (result && result.paymentUrl && result.requiresPayment) {
                          const windowFeatures = ['width=400', 'height=700', 'left=' + (window.screen.width / 2 - 200), 'top=' + (window.screen.height / 2 - 350), 'resizable=yes', 'scrollbars=yes', 'status=no', 'toolbar=no', 'menubar=no', 'location=no'].join(',')
                          const paymentWindow = window.open(result.paymentUrl, 'payment_miniapp', windowFeatures)
                          if (paymentWindow) paymentWindow.focus()
                          setSubscriptionSuccess({ vpnLink: null, paymentUrl: result.paymentUrl, orderId: result.orderId, amount: result.amount, requiresPayment: true, message: t('dashboard.paymentWindowOpen'), tariffId: result.tariffId || currentUser.tariffId || null, tariffName: result.tariffName || currentUser.tariffName || t('dashboard.notSpecified'), devices: result.devices || currentUser.devices || 1, periodMonths: result.periodMonths || currentUser.periodMonths || 1, discount: result.discount || 0 })
                          setShowSuccessModal(true)
                        }
                      } catch (error) {
                        if (paymentProcessingMessageTimerRef.current) { clearTimeout(paymentProcessingMessageTimerRef.current); paymentProcessingMessageTimerRef.current = null }
                        setShowPaymentProcessing(false)
                      }
                    }}
                    disabled={creatingSubscription || showPaymentProcessing}
                    className="min-h-[36px] px-3 py-1.5 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] transition-all flex items-center justify-center gap-1.5 touch-manipulation whitespace-nowrap"
                    aria-label="Оплатить подписку"
                  >
                    <CreditCard className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{creatingSubscription || showPaymentProcessing ? 'Обработка...' : 'Оплатить'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {currentUser?.paymentStatus === 'unpaid' && (() => {
          const unpaidStartDate = currentUser.unpaidStartDate || currentUser.testPeriodEndDate
          const daysUnpaid = unpaidStartDate 
            ? Math.floor((Date.now() - new Date(unpaidStartDate).getTime()) / (24 * 60 * 60 * 1000))
            : 0
          const daysLeft = 5 - daysUnpaid
          const isExpiringSoon = daysLeft <= 2 && daysLeft > 0
          const isExpired = daysLeft <= 0

          return (
            <div className={`p-2.5 sm:p-3 border rounded-lg ${isExpired || isExpiringSoon ? 'bg-red-900/30 border-red-800/70' : 'bg-red-900/20 border-red-800/50'}`}>
              <div className="flex items-start gap-2">
                <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isExpired || isExpiringSoon ? 'text-red-400 animate-pulse' : 'text-red-400'}`} />
                <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-red-400 font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)]">
                      {isExpired ? t('dashboard.subscriptionWillBeRemoved') : t('dashboard.paymentRequiredDays', { days: daysLeft, dayWord: daysLeft === 1 ? t('dashboard.day_one') : daysLeft < 5 ? t('dashboard.day_few') : t('dashboard.day_many') })}
                    </p>
                    {!isExpired && (
                      <p className="text-red-300/80 text-[clamp(0.65rem,0.6rem+0.25vw,0.75rem)] mt-0.5">
                        Необходимо произвести оплату для продолжения
                      </p>
                    )}
                  </div>
                  {!isExpired && (
                    <button
                      onClick={async () => {
                        if (paymentProcessingMessageTimerRef.current) clearTimeout(paymentProcessingMessageTimerRef.current)
                        setPaymentProcessingMessage(t('paymentProcessing.accountant'))
                        setShowPaymentProcessing(true)
                        paymentProcessingMessageTimerRef.current = setTimeout(() => {
                          setPaymentProcessingMessage(t('paymentProcessing.accountantLong'))
                          paymentProcessingMessageTimerRef.current = null
                        }, 3000)
                        try {
                          const result = await onHandleRenewSubscription()
                          if (paymentProcessingMessageTimerRef.current) { clearTimeout(paymentProcessingMessageTimerRef.current); paymentProcessingMessageTimerRef.current = null }
                          setShowPaymentProcessing(false)
                          if (result && result.paymentUrl && result.requiresPayment) {
                            const windowFeatures = ['width=400', 'height=700', 'left=' + (window.screen.width / 2 - 200), 'top=' + (window.screen.height / 2 - 350), 'resizable=yes', 'scrollbars=yes', 'status=no', 'toolbar=no', 'menubar=no', 'location=no'].join(',')
                            const paymentWindow = window.open(result.paymentUrl, 'payment_miniapp', windowFeatures)
                            if (paymentWindow) {
                              paymentWindow.focus()
                              setPaymentWindowRef(paymentWindow)
                              setPaymentOrderId(result.orderId)
                              logger.info('Dashboard', 'Окно оплаты открыто (unpaid), начинаем отслеживание', { orderId: result.orderId, paymentUrl: result.paymentUrl })
                            }
                            setSubscriptionSuccess({ vpnLink: null, paymentUrl: result.paymentUrl, orderId: result.orderId, amount: result.amount, requiresPayment: true, message: t('dashboard.paymentWindowOpen'), tariffId: result.tariffId || currentUser.tariffId || null, tariffName: result.tariffName || currentUser.tariffName || t('dashboard.notSpecified'), devices: result.devices || currentUser.devices || 1, periodMonths: result.periodMonths || currentUser.periodMonths || 1, discount: result.discount || 0 })
                            setShowSuccessModal(true)
                          }
                        } catch (error) {
                          if (paymentProcessingMessageTimerRef.current) { clearTimeout(paymentProcessingMessageTimerRef.current); paymentProcessingMessageTimerRef.current = null }
                          setShowPaymentProcessing(false)
                        }
                      }}
                      disabled={creatingSubscription || showPaymentProcessing}
                      className="min-h-[36px] px-3 py-1.5 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] transition-all flex items-center justify-center gap-1.5 touch-manipulation whitespace-nowrap"
                      aria-label="Оплатить подписку"
                    >
                      <CreditCard className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{creatingSubscription || showPaymentProcessing ? 'Обработка...' : 'Оплатить'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

export default SubscriptionInfoCard
