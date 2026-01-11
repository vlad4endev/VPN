import { useEffect, useState, useRef } from 'react'
import { CheckCircle2, XCircle, AlertCircle, CreditCard, User, History, Shield, Globe, Copy, Check, Clock, Calendar, Smartphone, Zap, Trash2, Loader2 } from 'lucide-react'
import Sidebar from '../../../shared/components/Sidebar.jsx'
import KeyModal from './KeyModal.jsx'
import LoggerPanel from '../../../shared/components/LoggerPanel.jsx'
import TariffSelectionModal from './TariffSelectionModal.jsx'
import SubscriptionSuccessModal from './SubscriptionSuccessModal.jsx'
import PaymentProcessingModal from './PaymentProcessingModal.jsx'
import { getUserStatus } from '../../../shared/utils/userStatus.js'
import logger from '../../../shared/utils/logger.js'

const Dashboard = ({
  currentUser,
  view,
  onSetView,
  onLogout,
  tariffs,
  loadTariffs,
  dashboardTab,
  onSetDashboardTab,
  editingProfile,
  onSetEditingProfile,
  profileData,
  onSetProfileData,
  creatingSubscription,
  onHandleCreateSubscription,
  onHandleRenewSubscription,
  onHandleDeleteSubscription,
  onHandleUpdateProfile,
  onHandleDeleteAccount,
  onProfileNameChange,
  onProfilePhoneChange,
  payments,
  paymentsLoading,
  loadPayments,
  formatDate,
  formatTraffic,
  settings,
  onCopy,
  showKeyModal,
  onSetShowKeyModal,
  showLogger,
  onSetShowLogger,
  onGetKey,
}) => {
  // Состояние для модальных окон выбора тарифа и успеха
  const [selectedTariff, setSelectedTariff] = useState(null)
  const [showTariffModal, setShowTariffModal] = useState(false)
  const [subscriptionSuccess, setSubscriptionSuccess] = useState(null)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingSubscription, setDeletingSubscription] = useState(false)
  const [showPaymentProcessing, setShowPaymentProcessing] = useState(false)
  const [paymentProcessingMessage, setPaymentProcessingMessage] = useState('Вызываем главного бухгалтера...')
  const [paymentWindowRef, setPaymentWindowRef] = useState(null)
  const [paymentOrderId, setPaymentOrderId] = useState(null)
  const paymentPollingIntervalRef = useRef(null)

  // Проверяем наличие активной подписки
  // Показываем подписку если:
  // 1. Есть UUID и tariffId И (подписка активна ИЛИ тестовый период ИЛИ неоплаченная но не прошло 5 дней)
  const hasSubscription = currentUser?.uuid && currentUser?.tariffId && (
    (currentUser?.expiresAt && new Date(currentUser.expiresAt).getTime() > Date.now()) ||
    (currentUser?.paymentStatus === 'test_period' && currentUser?.testPeriodEndDate && new Date(currentUser.testPeriodEndDate).getTime() > Date.now()) ||
    (currentUser?.paymentStatus === 'unpaid' && (() => {
      if (!currentUser.unpaidStartDate) return true // Если нет даты начала неоплаты, показываем
      const daysUnpaid = (Date.now() - new Date(currentUser.unpaidStartDate).getTime()) / (24 * 60 * 60 * 1000)
      return daysUnpaid < 5 // Показываем если не прошло 5 дней
    })())
  )
  const userStatus = getUserStatus(currentUser)
  const currentTariff = tariffs.find(t => t.id === currentUser?.tariffId)

  // Polling статуса платежа после открытия окна оплаты
  useEffect(() => {
    if (!paymentOrderId) {
      // Останавливаем polling если нет активного заказа
      if (paymentPollingIntervalRef.current) {
        clearInterval(paymentPollingIntervalRef.current)
        paymentPollingIntervalRef.current = null
      }
      return
    }

    logger.debug('Dashboard', 'Запуск polling статуса платежа', { orderId: paymentOrderId })

    const checkPaymentStatus = async () => {
      try {
        const { dashboardService } = await import('../services/dashboardService.js')
        const payment = await dashboardService.checkPaymentStatus(paymentOrderId)

        if (!payment) {
          logger.warn('Dashboard', 'Платеж не найден', { orderId: paymentOrderId })
          return
        }

        logger.debug('Dashboard', 'Статус платежа проверен', {
          orderId: paymentOrderId,
          status: payment.status
        })

        // Если платеж завершен, обновляем данные и останавливаем polling
        if (payment.status === 'completed') {
          logger.info('Dashboard', 'Платеж завершен успешно', {
            orderId: paymentOrderId,
            amount: payment.amount,
            tariffName: payment.tariffName
          })

          // Останавливаем polling
          if (paymentPollingIntervalRef.current) {
            clearInterval(paymentPollingIntervalRef.current)
            paymentPollingIntervalRef.current = null
          }

          // Очищаем состояние
          setPaymentOrderId(null)
          setPaymentWindowRef(null)

          // Закрываем модальное окно успеха (если открыто)
          setShowSuccessModal(false)
          setSubscriptionSuccess(null)

          // Показываем уведомление об успешной оплате перед перезагрузкой
          // Используем небольшой таймаут для лучшего UX
          setTimeout(() => {
            // Обновляем страницу, чтобы загрузить обновленные данные пользователя
            // После webhook платеж будет обработан и подписка активирована
            window.location.reload()
          }, 500) // Небольшая задержка для показа успешного статуса
        }
      } catch (error) {
        logger.error('Dashboard', 'Ошибка проверки статуса платежа', {
          orderId: paymentOrderId
        }, error)
      }
    }

    // Проверяем статус сразу
    checkPaymentStatus()

    // Проверяем статус каждые 3 секунды
    paymentPollingIntervalRef.current = setInterval(checkPaymentStatus, 3000)

    // Cleanup: останавливаем polling при размонтировании или изменении orderId
    return () => {
      if (paymentPollingIntervalRef.current) {
        clearInterval(paymentPollingIntervalRef.current)
        paymentPollingIntervalRef.current = null
      }
    }
  }, [paymentOrderId])

  // Отслеживание закрытия окна оплаты
  useEffect(() => {
    if (!paymentWindowRef) return

    logger.debug('Dashboard', 'Отслеживание закрытия окна оплаты')

    const checkWindowClosed = setInterval(() => {
      try {
        // Проверяем, закрыто ли окно
        if (paymentWindowRef.closed) {
          logger.debug('Dashboard', 'Окно оплаты закрыто')

          // Очищаем интервал проверки окна
          clearInterval(checkWindowClosed)

          // Если polling еще не запущен (не должно быть), запускаем его
          // Но обычно polling уже запущен, так что это просто безопасность
          if (paymentOrderId && !paymentPollingIntervalRef.current) {
            logger.debug('Dashboard', 'Окно закрыто, запускаем polling (fallback)')
          }
        }
      } catch (error) {
        // Ошибка может возникнуть при попытке доступа к закрытому окну из другого домена
        // Это нормально, просто очищаем интервал
        clearInterval(checkWindowClosed)
      }
    }, 1000) // Проверяем каждую секунду

    return () => {
      clearInterval(checkWindowClosed)
    }
  }, [paymentWindowRef, paymentOrderId])

  // Синхронизация данных с n8n при загрузке компонента
  useEffect(() => {
    const syncUserDataOnLoad = async () => {
      if (!currentUser || !currentUser.id) return
      
      try {
        const { dashboardService } = await import('../services/dashboardService.js')
        
        // Проверяем тестовый период
        if (currentUser?.paymentStatus === 'test_period') {
          const updatedUser = await dashboardService.checkAndUpdateTestPeriod(currentUser)
          
          if (updatedUser && updatedUser.paymentStatus === 'unpaid') {
            // Обновляем страницу, чтобы загрузить обновленные данные пользователя
            window.location.reload()
            return
          }
        }

        // Проверяем неоплаченную подписку (5 дней для удаления)
        if (currentUser?.paymentStatus === 'unpaid') {
          const deletedUser = await dashboardService.checkAndDeleteUnpaidSubscription(currentUser)
          
          if (deletedUser === null) {
            // Подписка была удалена, обновляем страницу
            window.location.reload()
            return
          }
        }
        
        // Опционально: автоматическая синхронизация с n8n (можно включить при необходимости)
        // Раскомментируйте для автоматической синхронизации при каждой загрузке:
        /*
        const syncResult = await dashboardService.sync_with_n8n(currentUser)
        if (syncResult.updated && syncResult.updatedFields.length > 0) {
          logger.info('Dashboard', 'Данные пользователя синхронизированы с n8n', { updatedFields: syncResult.updatedFields })
          // Можно обновить currentUser через callback или перезагрузить страницу
          window.location.reload()
        }
        */
      } catch (error) {
        logger.warn('Dashboard', 'Ошибка при синхронизации данных с n8n', null, error)
        // Не блокируем работу приложения, если синхронизация не удалась
      }
    }
    
    syncUserDataOnLoad()
  }, [currentUser?.id]) // Проверяем только при изменении ID пользователя

  // Загружаем тарифы при монтировании
  useEffect(() => {
    if (tariffs.length === 0) {
      loadTariffs()
    }
  }, [tariffs.length, loadTariffs])

  // Отслеживание тестового периода и неоплаченной подписки - проверяем каждую минуту
  useEffect(() => {
    if (!currentUser) {
      return
    }

    const checkSubscriptionStatus = async () => {
      try {
        const { dashboardService } = await import('../services/dashboardService.js')
        
        // Проверяем тестовый период
        if (currentUser.paymentStatus === 'test_period') {
          const now = Date.now()
          if (currentUser.testPeriodEndDate && currentUser.testPeriodEndDate < now) {
            const updatedUser = await dashboardService.checkAndUpdateTestPeriod(currentUser)
            if (updatedUser && updatedUser.paymentStatus === 'unpaid') {
              window.location.reload()
              return
            }
          }
        }

        // Проверяем неоплаченную подписку (5 дней для удаления)
        if (currentUser.paymentStatus === 'unpaid') {
          const deletedUser = await dashboardService.checkAndDeleteUnpaidSubscription(currentUser)
          if (deletedUser === null) {
            window.location.reload()
            return
          }
        }
      } catch (error) {
        logger.error('Dashboard', 'Ошибка при проверке статуса подписки', null, error)
      }
    }

    // Проверяем сразу при монтировании
    checkSubscriptionStatus()

    // Проверяем каждую минуту
    const interval = setInterval(checkSubscriptionStatus, 60 * 1000)

    return () => clearInterval(interval)
  }, [currentUser?.paymentStatus, currentUser?.testPeriodEndDate, currentUser?.unpaidStartDate, currentUser?.id])

  // Обработчик выбора тарифа - открываем модальное окно
  const handleTariffSelect = (tariff) => {
    setSelectedTariff(tariff)
    setShowTariffModal(true)
  }

  // Обработчик подтверждения выбора тарифа
  const handleTariffConfirm = async (subscriptionData) => {
    logger.debug('Dashboard', 'handleTariffConfirm вызван', {
      tariffName: subscriptionData?.tariff?.name,
      tariffId: subscriptionData?.tariff?.id,
      devices: subscriptionData?.devices,
      periodMonths: subscriptionData?.periodMonths,
      paymentMode: subscriptionData?.paymentMode,
      testPeriod: subscriptionData?.testPeriod
    })

    if (!subscriptionData) {
      logger.error('Dashboard', 'subscriptionData не передан в handleTariffConfirm')
      alert('Ошибка: данные подписки не получены')
      return
    }

    if (!subscriptionData.tariff) {
      logger.error('Dashboard', 'subscriptionData.tariff отсутствует', { subscriptionData })
      alert('Ошибка: тариф не выбран')
      return
    }

    if (!onHandleCreateSubscription) {
      logger.error('Dashboard', 'onHandleCreateSubscription не передан через props')
      alert('Ошибка: функция создания подписки не настроена. Обратитесь к администратору.')
      return
    }

    if (typeof onHandleCreateSubscription !== 'function') {
      logger.error('Dashboard', 'onHandleCreateSubscription не является функцией', { type: typeof onHandleCreateSubscription })
      alert('Ошибка: функция создания подписки имеет неправильный тип. Обратитесь к администратору.')
      return
    }

    try {
      logger.debug('Dashboard', 'Закрываем модальное окно выбора тарифа')
      setShowTariffModal(false)
      
      // Показываем модальное окно обработки платежа
      setPaymentProcessingMessage('Вызываем главного бухгалтера...')
      setShowPaymentProcessing(true)
      
      logger.debug('Dashboard', 'Вызов onHandleCreateSubscription', {
        tariff: {
          id: subscriptionData.tariff.id,
          name: subscriptionData.tariff.name,
        },
        devices: subscriptionData.devices,
        natrockPort: subscriptionData.natrockPort,
        periodMonths: subscriptionData.periodMonths || 1,
        testPeriod: subscriptionData.testPeriod || false,
        paymentMode: subscriptionData.paymentMode || 'pay_now',
        discount: subscriptionData.discount || 0
      })

      const result = await onHandleCreateSubscription(
        subscriptionData.tariff,
        subscriptionData.devices,
        subscriptionData.natrockPort,
        subscriptionData.periodMonths || 1,
        subscriptionData.testPeriod || false,
        subscriptionData.paymentMode || 'pay_now',
        subscriptionData.discount || 0
      )
      
      logger.debug('Dashboard', 'onHandleCreateSubscription вернул результат', { hasResult: !!result })
      
      // Закрываем модальное окно обработки платежа
      setShowPaymentProcessing(false)
      
      // Если результат содержит ссылку на оплату, открываем её в miniapp
      if (result && result.paymentUrl && result.requiresPayment) {
        logger.info('Dashboard', 'Открываем ссылку на оплату', {
          orderId: result.orderId,
          amount: result.amount
        })
        
        // Открываем ссылку на оплату в новом окне как miniapp
        // Используем параметры для создания окна, похожего на miniapp
        const windowFeatures = [
          'width=400',
          'height=700',
          'left=' + (window.screen.width / 2 - 200),
          'top=' + (window.screen.height / 2 - 350),
          'resizable=yes',
          'scrollbars=yes',
          'status=no',
          'toolbar=no',
          'menubar=no',
          'location=no'
        ].join(',')
        
        const paymentWindow = window.open(
          result.paymentUrl, 
          'payment_miniapp',
          windowFeatures
        )
        
        // Фокусируемся на новом окне
        if (paymentWindow) {
          paymentWindow.focus()
          
          // Сохраняем ссылку на окно и orderId для отслеживания
          setPaymentWindowRef(paymentWindow)
          setPaymentOrderId(result.orderId)
          
          logger.info('Dashboard', 'Окно оплаты открыто, начинаем отслеживание', { orderId: result.orderId })
        }
        
        // Показываем уведомление пользователю
        setSubscriptionSuccess({
          vpnLink: null,
          paymentUrl: result.paymentUrl,
          orderId: result.orderId,
          amount: result.amount,
          requiresPayment: true,
          message: 'Окно оплаты открыто. Завершите оплату для активации подписки. После оплаты страница обновится автоматически.',
          tariffName: subscriptionData.tariff.name,
          devices: subscriptionData.devices || 1,
          periodMonths: subscriptionData.periodMonths || 1
        })
        setShowSuccessModal(true)
        return
      }
      
      // Если результат содержит данные подписки, показываем модальное окно успеха
      if (result) {
        logger.info('Dashboard', 'Показываем модальное окно успеха', {
          hasVpnLink: !!result.vpnLink,
          tariffName: result.tariffName,
          devices: result.devices,
          periodMonths: result.periodMonths
        })
        
        setSubscriptionSuccess({
          vpnLink: result.vpnLink || null,
          tariffName: result.tariffName || subscriptionData.tariff.name,
          devices: result.devices || subscriptionData.devices || 1,
          periodMonths: result.periodMonths || subscriptionData.periodMonths || 1,
          expiresAt: result.expiresAt || null,
          paymentStatus: result.paymentStatus || (subscriptionData.testPeriod ? 'test_period' : 'paid'),
          testPeriod: result.testPeriod !== undefined ? result.testPeriod : (subscriptionData.testPeriod || false),
        })
        setShowSuccessModal(true)
      } else {
        logger.warn('Dashboard', 'onHandleCreateSubscription вернул пустой/undefined результат')
        // Не показываем модальное окно, но и не показываем ошибку, так как возможно данные сохранились
      }
    } catch (error) {
      logger.error('Dashboard', 'КРИТИЧЕСКАЯ ОШИБКА при создании подписки', {
        errorType: error.constructor.name,
        errorStatus: error.response?.status
      }, error)
      
      // Закрываем модальное окно обработки платежа при ошибке
      setShowPaymentProcessing(false)
      
      // Модальное окно уже закрыто, но ошибка будет показана через setError в App.jsx
      // Здесь просто логируем для диагностики
    }
  }

  // Обработчик подтверждения удаления подписки
  const handleConfirmDelete = async () => {
    if (!onHandleDeleteSubscription) {
      logger.error('Dashboard', 'onHandleDeleteSubscription не передан')
      setShowDeleteConfirm(false)
      return
    }

    try {
      setDeletingSubscription(true)
      await onHandleDeleteSubscription()
      setShowDeleteConfirm(false)
      // Обновление состояния произойдет через обновление currentUser в App.jsx
    } catch (error) {
      logger.error('Dashboard', 'Ошибка при удалении подписки', null, error)
      // Ошибка уже обработана в onHandleDeleteSubscription
    } finally {
      setDeletingSubscription(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden">
      <Sidebar currentUser={currentUser} view={view} onSetView={onSetView} onLogout={onLogout} />
      <div className="flex-1 w-full min-w-0 p-3 sm:p-4 md:p-6 lg:p-8 pt-14 sm:pt-16 lg:pt-6 lg:pt-8 lg:overflow-y-auto">
        <div className="mb-4 sm:mb-5 md:mb-6">
          <h1 className="text-[clamp(1.25rem,1.1rem+0.75vw,1.875rem)] font-bold text-white mb-1.5 sm:mb-2">Личный кабинет</h1>
          <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400">Управление подпиской, профилем и платежами</p>
        </div>

        {/* Общая статистика - Mobile First */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-5 md:mb-6">
          <div className="bg-slate-900 rounded-lg sm:rounded-xl p-4 sm:p-5 border border-slate-800">
            <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400 mb-1.5 sm:mb-2">Статус</p>
            <div className={`inline-flex items-center gap-2 ${userStatus.color} font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]`}>
              {userStatus.status === 'active' && <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />}
              {userStatus.status === 'expired' && <XCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />}
              {userStatus.status === 'no-key' && <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />}
              <span>{userStatus.label}</span>
            </div>
          </div>
          <div className="bg-slate-900 rounded-lg sm:rounded-xl p-4 sm:p-5 border border-slate-800">
            <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400 mb-1.5 sm:mb-2">Тариф</p>
            <p className="text-white font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">{currentUser.tariffName || 'Не выбран'}</p>
          </div>
          <div className="bg-slate-900 rounded-lg sm:rounded-xl p-4 sm:p-5 border border-slate-800">
            <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400 mb-1.5 sm:mb-2">Ключ</p>
            <p className="text-white font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">
              {currentUser.uuid ? 'Активен' : 'Не получен'}
            </p>
          </div>
        </div>
        
        {/* Вкладки - Mobile First с горизонтальной прокруткой */}
        <div className="flex gap-2 sm:gap-4 mb-4 sm:mb-5 md:mb-6 border-b border-slate-800 overflow-x-auto scrollbar-hide -mx-1 sm:mx-0">
          <button
            onClick={() => onSetDashboardTab('subscription')}
            className={`min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-3 sm:py-3.5 md:py-4 font-semibold transition-all whitespace-nowrap flex-shrink-0 min-w-fit touch-manipulation ${
              dashboardTab === 'subscription'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-slate-300 active:text-slate-200'
            }`}
            aria-label="Подписка"
            aria-selected={dashboardTab === 'subscription'}
          >
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            <span className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Подписка</span>
          </button>
          <button
            onClick={() => onSetDashboardTab('profile')}
            className={`min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-3 sm:py-3.5 md:py-4 font-semibold transition-all whitespace-nowrap flex-shrink-0 min-w-fit touch-manipulation ${
              dashboardTab === 'profile'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-slate-300 active:text-slate-200'
            }`}
            aria-label="Профиль"
            aria-selected={dashboardTab === 'profile'}
          >
            <User className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            <span className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Профиль</span>
          </button>
          <button
            onClick={() => onSetDashboardTab('payments')}
            className={`min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-3 sm:py-3.5 md:py-4 font-semibold transition-all whitespace-nowrap flex-shrink-0 min-w-fit touch-manipulation ${
              dashboardTab === 'payments'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-slate-300 active:text-slate-200'
            }`}
            aria-label="История платежей"
            aria-selected={dashboardTab === 'payments'}
          >
            <History className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            <span className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">История платежей</span>
          </button>
        </div>

        {/* Контент вкладок */}
        {dashboardTab === 'subscription' && (
          <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 p-4 sm:p-5 md:p-6">
            {hasSubscription ? (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-5 md:mb-6">
                  <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-white">Текущая подписка</h2>
                  {currentUser?.uuid && onHandleDeleteSubscription && (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={deletingSubscription || creatingSubscription}
                      className="btn-icon-only-mobile min-h-[44px] w-full sm:w-auto px-4 sm:px-5 py-2.5 sm:py-3 bg-red-600/90 hover:bg-red-700 active:bg-red-800 disabled:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg sm:rounded-xl font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center gap-2 touch-manipulation"
                      aria-label="Отменить подписку"
                    >
                      <Trash2 className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                      <span className="btn-text">{deletingSubscription ? 'Отмена...' : 'Отменить подписку'}</span>
                    </button>
                  )}
                </div>
                <div className="space-y-4 sm:space-y-5">
                  {/* Основная карточка подписки - улучшенный дизайн */}
                  <div className="bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 rounded-xl sm:rounded-2xl p-5 sm:p-6 md:p-8 border border-slate-700 shadow-lg">
                    {/* Заголовок с тарифом и статусом */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-[clamp(1.5rem,1.3rem+1vw,2rem)] font-bold text-white">{currentUser.tariffName || 'Не указан'}</h3>
                          {currentUser.tariffName?.toLowerCase() === 'super' && (
                            <span className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-blue-600 text-white text-xs sm:text-sm font-bold rounded-full">PREMIUM</span>
                          )}
                        </div>
                        <div className={`inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg ${userStatus.color} font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]`}>
                          {userStatus.status === 'active' && <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />}
                          {userStatus.status === 'expired' && <XCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />}
                          {userStatus.status === 'unpaid' && <XCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />}
                          {userStatus.status === 'test_period' && <Clock className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />}
                          {userStatus.status === 'no-key' && <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />}
                          <span>{userStatus.label}</span>
                        </div>
                      </div>
                    </div>

                    {/* Информационные блоки в сетке */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mb-6">
                      {/* Количество устройств */}
                      <div className="bg-slate-900/50 rounded-xl p-4 sm:p-5 border border-slate-700">
                        <div className="flex items-center gap-2 mb-2">
                          <Smartphone className="w-5 h-5 text-blue-400 flex-shrink-0" />
                          <p className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] font-medium">Устройств</p>
                        </div>
                        <p className="text-white font-bold text-[clamp(1.25rem,1.1rem+0.75vw,1.75rem)]">
                          {currentUser.devices || currentTariff?.devices || 1}
                        </p>
                      </div>

                      {/* Период */}
                      {currentUser.periodMonths && (
                        <div className="bg-slate-900/50 rounded-xl p-4 sm:p-5 border border-slate-700">
                          <div className="flex items-center gap-2 mb-2">
                            <Calendar className="w-5 h-5 text-green-400 flex-shrink-0" />
                            <p className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] font-medium">Период</p>
                          </div>
                          <p className="text-white font-bold text-[clamp(1.125rem,1rem+0.625vw,1.5rem)]">
                            {currentUser.periodMonths} {currentUser.periodMonths === 1 ? 'месяц' : currentUser.periodMonths < 5 ? 'месяца' : 'месяцев'}
                          </p>
                        </div>
                      )}

                      {/* Трафик */}
                      {(currentTariff || currentUser?.paymentStatus) && (
                        <div className="bg-slate-900/50 rounded-xl p-4 sm:p-5 border border-slate-700">
                          <div className="flex items-center gap-2 mb-2">
                            <Zap className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                            <p className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] font-medium">Трафик</p>
                          </div>
                          <p className="text-white font-bold text-[clamp(1.125rem,1rem+0.625vw,1.5rem)]">
                            {(() => {
                              // Для тестового периода всегда показываем 3 GB
                              if (currentUser?.paymentStatus === 'test_period') {
                                return '3 GB'
                              }
                              
                              // Для оплаченного периода берем значение из тарифа
                              // Проверяем, что тариф найден и имеет trafficGB
                              if (currentTariff) {
                                // Если trafficGB указан и больше 0, показываем его
                                if (currentTariff.trafficGB && currentTariff.trafficGB > 0) {
                                  return `${currentTariff.trafficGB} GB`
                                }
                                // Если trafficGB равен 0 или не указан, показываем "Безлимит"
                                return 'Безлимит'
                              }
                              
                              // Если тариф не найден, но есть tariffId, показываем "Безлимит" (fallback)
                              // Это может произойти, если тариф еще не загружен или был удален
                              if (currentUser?.tariffId) {
                                logger.warn('Dashboard', 'Тариф не найден для tariffId', {
                                  tariffId: currentUser.tariffId,
                                  availableTariffs: tariffs.map(t => ({ id: t.id, name: t.name }))
                                })
                                return 'Безлимит'
                              }
                              
                              // Если нет ни тарифа, ни tariffId, показываем "Безлимит"
                              return 'Безлимит'
                            })()}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Дополнительная информация */}
                    <div className="space-y-3 sm:space-y-4">
                      {/* Дата окончания */}
                      {currentUser.expiresAt && (
                        <div className="flex items-start sm:items-center gap-3 p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                          <Calendar className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] mb-1">Действует до</p>
                            <p className="text-white font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">
                              {formatDate(currentUser.expiresAt)}
                            </p>
                            {new Date(currentUser.expiresAt) > new Date() && (
                              <p className="text-slate-500 text-xs mt-1">
                                Осталось: {Math.ceil((new Date(currentUser.expiresAt) - new Date()) / (1000 * 60 * 60 * 24))} дней
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Статус оплаты */}
                      <div className="flex items-start sm:items-center gap-3 p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                        <CreditCard className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] mb-1">Статус оплаты</p>
                          <p className={`font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] ${
                            currentUser.paymentStatus === 'paid' ? 'text-green-400' :
                            currentUser.paymentStatus === 'test_period' ? 'text-yellow-400' :
                            currentUser.paymentStatus === 'unpaid' ? 'text-red-400' :
                            'text-slate-300'
                          }`}>
                            {currentUser.paymentStatus === 'paid' ? 'Оплачено' : 
                             currentUser.paymentStatus === 'test_period' ? 'Тестовый период' :
                             currentUser.paymentStatus === 'unpaid' ? 'Не оплачено' : 
                             'Не указан'}
                          </p>
                        </div>
                      </div>

                      {/* Предупреждения и уведомления */}
                      {currentUser?.paymentStatus === 'test_period' && currentUser?.testPeriodEndDate && (
                        <div className="p-4 bg-yellow-900/20 border border-yellow-800/50 rounded-xl">
                          <div className="flex items-start gap-3">
                            <Clock className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-yellow-400 font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] mb-1">Тестовый период активен</p>
                              <p className="text-yellow-300/90 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)]">
                                Окончание: {formatDate(currentUser.testPeriodEndDate)}
                              </p>
                              <p className="text-yellow-300/70 text-xs mt-2 mb-3">
                                После окончания тестового периода подписка будет приостановлена до оплаты
                              </p>
                              {onHandleRenewSubscription && (
                                <button
                                  onClick={async () => {
                                    // Показываем модальное окно обработки платежа
                                    setPaymentProcessingMessage('Вызываем главного бухгалтера...')
                                    setShowPaymentProcessing(true)
                                    
                                    try {
                                      const result = await onHandleRenewSubscription()
                                      
                                      // Закрываем модальное окно обработки платежа
                                      setShowPaymentProcessing(false)
                                      
                                      // Если результат содержит ссылку на оплату, открываем её в miniapp
                                      if (result && result.paymentUrl && result.requiresPayment) {
                                        const windowFeatures = [
                                          'width=400',
                                          'height=700',
                                          'left=' + (window.screen.width / 2 - 200),
                                          'top=' + (window.screen.height / 2 - 350),
                                          'resizable=yes',
                                          'scrollbars=yes',
                                          'status=no',
                                          'toolbar=no',
                                          'menubar=no',
                                          'location=no'
                                        ].join(',')
                                        
                                        const paymentWindow = window.open(
                                          result.paymentUrl, 
                                          'payment_miniapp',
                                          windowFeatures
                                        )
                                        
                                        if (paymentWindow) {
                                          paymentWindow.focus()
                                        }
                                        
                                        setSubscriptionSuccess({
                                          vpnLink: null,
                                          paymentUrl: result.paymentUrl,
                                          orderId: result.orderId,
                                          amount: result.amount,
                                          requiresPayment: true,
                                          message: 'Окно оплаты открыто. Завершите оплату для активации подписки.',
                                          tariffName: currentUser.tariffName || 'Не указан',
                                          devices: currentUser.devices || 1,
                                          periodMonths: currentUser.periodMonths || 1
                                        })
                                        setShowSuccessModal(true)
                                      }
                                    } catch (error) {
                                      setShowPaymentProcessing(false)
                                      // Ошибка будет обработана в onHandleRenewSubscription
                                    }
                                  }}
                                  disabled={creatingSubscription || showPaymentProcessing}
                                  className="min-h-[40px] px-4 py-2 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 touch-manipulation"
                                  aria-label="Оплатить подписку"
                                >
                                  <CreditCard className="w-4 h-4 flex-shrink-0" />
                                  <span>{creatingSubscription || showPaymentProcessing ? 'Обработка...' : 'Оплатить подписку'}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      {currentUser?.paymentStatus === 'unpaid' && (() => {
                        // Вычисляем количество дней неоплаты
                        const unpaidStartDate = currentUser.unpaidStartDate || currentUser.testPeriodEndDate
                        const daysUnpaid = unpaidStartDate 
                          ? Math.floor((Date.now() - new Date(unpaidStartDate).getTime()) / (24 * 60 * 60 * 1000))
                          : 0
                        const daysLeft = 5 - daysUnpaid
                        const isExpiringSoon = daysLeft <= 2 && daysLeft > 0
                        const isExpired = daysLeft <= 0

                        return (
                          <div className={`p-4 border rounded-xl ${isExpired || isExpiringSoon ? 'bg-red-900/30 border-red-800/70' : 'bg-red-900/20 border-red-800/50'}`}>
                            <div className="flex items-start gap-3">
                              <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isExpired || isExpiringSoon ? 'text-red-400 animate-pulse' : 'text-red-400'}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-red-400 font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] mb-1">
                                  {isExpired ? 'Подписка будет удалена' : 'Требуется оплата'}
                                </p>
                                <p className="text-red-300/90 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] mb-2">
                                  {isExpired 
                                    ? 'Прошло более 5 дней с момента неоплаты. Подписка будет удалена автоматически.'
                                    : `Необходимо произвести оплату. Осталось ${daysLeft} ${daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'} до удаления подписки.`
                                  }
                                </p>
                                {!isExpired && (
                                  <button
                                    onClick={async () => {
                                      // Показываем модальное окно обработки платежа
                                      setPaymentProcessingMessage('Вызываем главного бухгалтера...')
                                      setShowPaymentProcessing(true)
                                      
                                      try {
                                        const result = await onHandleRenewSubscription()
                                        
                                        // Закрываем модальное окно обработки платежа
                                        setShowPaymentProcessing(false)
                                        
                                        // Если результат содержит ссылку на оплату, открываем её в miniapp
                                        if (result && result.paymentUrl && result.requiresPayment) {
                                          const windowFeatures = [
                                            'width=400',
                                            'height=700',
                                            'left=' + (window.screen.width / 2 - 200),
                                            'top=' + (window.screen.height / 2 - 350),
                                            'resizable=yes',
                                            'scrollbars=yes',
                                            'status=no',
                                            'toolbar=no',
                                            'menubar=no',
                                            'location=no'
                                          ].join(',')
                                          
                                          const paymentWindow = window.open(
                                            result.paymentUrl, 
                                            'payment_miniapp',
                                            windowFeatures
                                          )
                                          
                                          if (paymentWindow) {
                                            paymentWindow.focus()
                                            
                                            // Сохраняем ссылку на окно и orderId для отслеживания
                                            setPaymentWindowRef(paymentWindow)
                                            setPaymentOrderId(result.orderId)
                                            
                                            logger.info('Dashboard', 'Окно оплаты открыто (тестовый период), начинаем отслеживание', {
                                              orderId: result.orderId,
                                              paymentUrl: result.paymentUrl
                                            })
                                          }
                                          
                                          setSubscriptionSuccess({
                                            vpnLink: null,
                                            paymentUrl: result.paymentUrl,
                                            orderId: result.orderId,
                                            amount: result.amount,
                                            requiresPayment: true,
                                            message: 'Окно оплаты открыто. Завершите оплату для активации подписки. После оплаты страница обновится автоматически.',
                                            tariffName: currentUser.tariffName || 'Не указан',
                                            devices: currentUser.devices || 1,
                                            periodMonths: currentUser.periodMonths || 1
                                          })
                                          setShowSuccessModal(true)
                                        }
                                      } catch (error) {
                                        setShowPaymentProcessing(false)
                                        // Ошибка будет обработана в onHandleRenewSubscription
                                      }
                                    }}
                                    disabled={creatingSubscription || showPaymentProcessing}
                                    className="mt-2 min-h-[40px] px-4 py-2 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 touch-manipulation"
                                    aria-label="Оплатить подписку"
                                  >
                                    <CreditCard className="w-4 h-4 flex-shrink-0" />
                                    <span>{creatingSubscription || showPaymentProcessing ? 'Обработка...' : 'Оплатить подписку'}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>

                    {/* Блок управления подключением */}
                    <div className="mt-6 p-5 bg-slate-900/50 rounded-xl border border-slate-700">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                        <div>
                          <p className="text-slate-300 font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] mb-1">UUID / Ключ подключения</p>
                          {currentUser.uuid && (
                            <p className="text-slate-500 text-xs">Ваш уникальный идентификатор для VPN подключения</p>
                          )}
                        </div>
                        {currentUser.uuid ? (
                          <button
                            onClick={() => onSetShowKeyModal(true)}
                            className="btn-icon-only-mobile min-h-[44px] w-full sm:w-auto px-4 sm:px-5 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-2 touch-manipulation whitespace-nowrap"
                            aria-label="Показать конфигурацию"
                          >
                            <Globe className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                            <span className="btn-text">Показать конфигурацию</span>
                          </button>
                        ) : (
                          <button
                            onClick={onGetKey}
                            className="btn-icon-only-mobile min-h-[44px] w-full sm:w-auto px-4 sm:px-5 py-2.5 sm:py-3 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-2 touch-manipulation whitespace-nowrap"
                            aria-label="Получить ключ"
                          >
                            <Shield className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                            <span className="btn-text">Получить ключ</span>
                          </button>
                        )}
                      </div>
                      {currentUser.uuid && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <code className="flex-1 bg-slate-950 p-3 sm:p-4 rounded-lg text-slate-300 text-xs sm:text-sm font-mono break-all min-w-0 border border-slate-800">
                            {currentUser.uuid}
                          </code>
                          <button
                            onClick={() => onCopy(currentUser.uuid)}
                            className="btn-icon-only-mobile min-h-[44px] min-w-[44px] px-4 py-2.5 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg transition-all flex items-center justify-center touch-manipulation sm:w-auto w-full"
                            title="Копировать UUID"
                            aria-label="Копировать UUID"
                          >
                            <Copy className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span className="btn-text sm:hidden ml-2">Копировать</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Кнопки действий */}
                    <div className="mt-6 flex flex-col sm:flex-row gap-3">
                      {userStatus.status === 'expired' && (
                        <button
                          onClick={async () => {
                            // Показываем модальное окно обработки платежа
                            setPaymentProcessingMessage('Вызываем главного бухгалтера...')
                            setShowPaymentProcessing(true)
                            
                            try {
                              const result = await onHandleRenewSubscription()
                              
                              // Закрываем модальное окно обработки платежа
                              setShowPaymentProcessing(false)
                              
                              // Если результат содержит ссылку на оплату, открываем её в miniapp
                              if (result && result.paymentUrl && result.requiresPayment) {
                                const windowFeatures = [
                                  'width=400',
                                  'height=700',
                                  'left=' + (window.screen.width / 2 - 200),
                                  'top=' + (window.screen.height / 2 - 350),
                                  'resizable=yes',
                                  'scrollbars=yes',
                                  'status=no',
                                  'toolbar=no',
                                  'menubar=no',
                                  'location=no'
                                ].join(',')
                                
                                const paymentWindow = window.open(
                                  result.paymentUrl, 
                                  'payment_miniapp',
                                  windowFeatures
                                )
                                
                                if (paymentWindow) {
                                  paymentWindow.focus()
                                }
                                
                                setSubscriptionSuccess({
                                  vpnLink: null,
                                  paymentUrl: result.paymentUrl,
                                  orderId: result.orderId,
                                  amount: result.amount,
                                  requiresPayment: true,
                                  message: 'Окно оплаты открыто. Завершите оплату для активации подписки.',
                                  tariffName: currentUser.tariffName || 'Не указан',
                                  devices: currentUser.devices || 1,
                                  periodMonths: currentUser.periodMonths || 1
                                })
                                setShowSuccessModal(true)
                              }
                            } catch (error) {
                              setShowPaymentProcessing(false)
                              // Ошибка будет обработана в onHandleRenewSubscription
                            }
                          }}
                          disabled={creatingSubscription || showPaymentProcessing}
                          className="flex-1 min-h-[44px] px-5 sm:px-6 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg sm:rounded-xl font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center gap-2 touch-manipulation"
                          aria-label="Продлить подписку"
                        >
                          <Calendar className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                          <span>{creatingSubscription || showPaymentProcessing ? 'Продление...' : 'Продлить подписку'}</span>
                        </button>
                      )}
                      {currentUser?.paymentStatus === 'unpaid' && (() => {
                        const unpaidStartDate = currentUser.unpaidStartDate || currentUser.testPeriodEndDate
                        const daysUnpaid = unpaidStartDate 
                          ? Math.floor((Date.now() - new Date(unpaidStartDate).getTime()) / (24 * 60 * 60 * 1000))
                          : 0
                        const daysLeft = 5 - daysUnpaid
                        
                        if (daysLeft > 0) {
                          return (
                            <button
                              onClick={async () => {
                                // Показываем модальное окно обработки платежа
                                setPaymentProcessingMessage('Вызываем главного бухгалтера...')
                                setShowPaymentProcessing(true)
                                
                                try {
                                  const result = await onHandleRenewSubscription()
                                  
                                  // Закрываем модальное окно обработки платежа
                                  setShowPaymentProcessing(false)
                                  
                                  // Если результат содержит ссылку на оплату, открываем её в miniapp
                                  if (result && result.paymentUrl && result.requiresPayment) {
                                    const windowFeatures = [
                                      'width=400',
                                      'height=700',
                                      'left=' + (window.screen.width / 2 - 200),
                                      'top=' + (window.screen.height / 2 - 350),
                                      'resizable=yes',
                                      'scrollbars=yes',
                                      'status=no',
                                      'toolbar=no',
                                      'menubar=no',
                                      'location=no'
                                    ].join(',')
                                    
                                    const paymentWindow = window.open(
                                      result.paymentUrl, 
                                      'payment_miniapp',
                                      windowFeatures
                                    )
                                    
                                    if (paymentWindow) {
                                      paymentWindow.focus()
                                    }
                                    
                                    setSubscriptionSuccess({
                                      vpnLink: null,
                                      paymentUrl: result.paymentUrl,
                                      orderId: result.orderId,
                                      amount: result.amount,
                                      requiresPayment: true,
                                      message: 'Окно оплаты открыто. Завершите оплату для активации подписки.',
                                      tariffName: currentUser.tariffName || 'Не указан',
                                      devices: currentUser.devices || 1,
                                      periodMonths: currentUser.periodMonths || 1
                                    })
                                    setShowSuccessModal(true)
                                  }
                                } catch (error) {
                                  setShowPaymentProcessing(false)
                                  // Ошибка будет обработана в onHandleRenewSubscription
                                }
                              }}
                              disabled={creatingSubscription || showPaymentProcessing}
                              className="flex-1 min-h-[44px] px-5 sm:px-6 py-3 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg sm:rounded-xl font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center gap-2 touch-manipulation"
                              aria-label="Оплатить подписку"
                            >
                              <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                              <span>{creatingSubscription || showPaymentProcessing ? 'Обработка...' : 'Оплатить подписку'}</span>
                            </button>
                          )
                        }
                        return null
                      })()}
                    </div>
                  </div>
                  {userStatus.status === 'expired' && (
                    <button
                      onClick={async () => {
                        // Показываем модальное окно обработки платежа
                        setPaymentProcessingMessage('Вызываем главного бухгалтера...')
                        setShowPaymentProcessing(true)
                        
                        try {
                          const result = await onHandleRenewSubscription()
                          
                          // Закрываем модальное окно обработки платежа
                          setShowPaymentProcessing(false)
                          
                          // Если результат содержит ссылку на оплату, открываем её в miniapp
                          if (result && result.paymentUrl && result.requiresPayment) {
                            const windowFeatures = [
                              'width=400',
                              'height=700',
                              'left=' + (window.screen.width / 2 - 200),
                              'top=' + (window.screen.height / 2 - 350),
                              'resizable=yes',
                              'scrollbars=yes',
                              'status=no',
                              'toolbar=no',
                              'menubar=no',
                              'location=no'
                            ].join(',')
                            
                            const paymentWindow = window.open(
                              result.paymentUrl, 
                              'payment_miniapp',
                              windowFeatures
                            )
                            
                            if (paymentWindow) {
                              paymentWindow.focus()
                            }
                            
                            setSubscriptionSuccess({
                              vpnLink: null,
                              paymentUrl: result.paymentUrl,
                              orderId: result.orderId,
                              amount: result.amount,
                              requiresPayment: true,
                              message: 'Окно оплаты открыто. Завершите оплату для активации подписки.',
                              tariffName: currentUser.tariffName || 'Не указан',
                              devices: currentUser.devices || 1,
                              periodMonths: currentUser.periodMonths || 1
                            })
                            setShowSuccessModal(true)
                          }
                        } catch (error) {
                          setShowPaymentProcessing(false)
                          // Ошибка будет обработана в onHandleRenewSubscription
                        }
                      }}
                      disabled={creatingSubscription || showPaymentProcessing}
                      className="w-full min-h-[44px] px-5 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg sm:rounded-xl font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center touch-manipulation"
                      aria-label="Продлить подписку"
                    >
                      {creatingSubscription || showPaymentProcessing ? 'Продление...' : 'Продлить подписку'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200 mb-3 sm:mb-4 md:mb-5">Выберите тариф</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
                  {tariffs.filter(t => t.active && (t.name === 'Super' || t.name === 'MULTI')).map((tariff) => {
                    // Определяем характеристики для каждого тарифа
                    const isSuper = tariff.name === 'Super'
                    const features = isSuper 
                      ? [
                          `${tariff.devices} ${tariff.devices === 1 ? 'Устройство' : 'Устройств'}`,
                          'Обход белого списка',
                          'Протокол VLESS'
                        ]
                      : [
                          `${tariff.devices} ${tariff.devices === 1 ? 'Устройство' : 'Устройств'}`,
                          'Высокая скорость трафика',
                          'Без обхода белого списка'
                        ]
                    
                    return (
                      <div key={tariff.id} className="bg-slate-800 rounded-lg sm:rounded-xl p-5 sm:p-6 border border-slate-700 flex flex-col">
                        <div className="flex items-center justify-between mb-4 sm:mb-5">
                          <h3 className="text-[clamp(1.5rem,1.3rem+1vw,2.25rem)] font-bold text-white">{tariff.name}</h3>
                          {isSuper && (
                            <span className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-blue-600 text-white text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] font-bold rounded-full">ХИТ</span>
                          )}
                        </div>
                        <div className="mb-4 sm:mb-5">
                          <span className="text-[clamp(2rem,1.8rem+1vw,3rem)] font-bold text-blue-400">{tariff.price}</span>
                          <span className="text-slate-400 ml-2 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">₽/мес</span>
                        </div>
                        <ul className="space-y-2 sm:space-y-2.5 mb-6 sm:mb-7 flex-1">
                          {features.map((feature, index) => (
                            <li key={index} className="flex items-center gap-2 text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">
                              <Check className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 flex-shrink-0" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                        <button
                          onClick={() => handleTariffSelect(tariff)}
                          disabled={creatingSubscription}
                          className="w-full min-h-[44px] px-5 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg sm:rounded-xl font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center touch-manipulation mt-auto"
                          aria-label={`Выбрать тариф ${tariff.name}`}
                        >
                          Выбрать {tariff.name === 'Super' ? 'Super' : tariff.name}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {dashboardTab === 'profile' && (
          <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 p-4 sm:p-5 md:p-6">
            <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200 mb-4 sm:mb-5 md:mb-6">Настройки профиля</h2>
            <div className="space-y-4 sm:space-y-5 md:space-y-6">
              <div>
                <label htmlFor="profile-email" className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-bold mb-1.5 sm:mb-2">Email</label>
                <input
                  key="profile-email-input-disabled"
                  id="profile-email"
                  name="profile-email"
                  type="email"
                  value={currentUser.email}
                  disabled
                  className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-400 text-base cursor-not-allowed"
                />
                <p className="text-slate-500 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] mt-1.5">Email нельзя изменить</p>
              </div>

              <div>
                <label htmlFor="profile-name" className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-bold mb-1.5 sm:mb-2">Имя</label>
                {editingProfile ? (
                  <input
                    key="profile-name-input"
                    id="profile-name"
                    name="profile-name"
                    type="text"
                    value={profileData.name || ''}
                    onChange={onProfileNameChange}
                    placeholder="Введите ваше имя"
                    className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                    autoFocus={false}
                  />
                ) : (
                  <div className="min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base flex items-center">
                    {currentUser.name || <span className="text-slate-500">Не указано</span>}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="profile-phone" className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-bold mb-1.5 sm:mb-2">Номер телефона</label>
                {editingProfile ? (
                  <input
                    key="profile-phone-input"
                    id="profile-phone"
                    name="profile-phone"
                    type="tel"
                    value={profileData.phone || ''}
                    onChange={onProfilePhoneChange}
                    placeholder="+7 (999) 123-45-67"
                    className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                    autoFocus={false}
                  />
                ) : (
                  <div className="min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base flex items-center">
                    {currentUser.phone || <span className="text-slate-500">Не указано</span>}
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                {editingProfile ? (
                  <>
                    <button
                      onClick={onHandleUpdateProfile}
                      className="min-h-[44px] w-full sm:w-auto px-5 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg sm:rounded-xl font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center touch-manipulation"
                      aria-label="Сохранить профиль"
                    >
                      Сохранить
                    </button>
                    <button
                      onClick={() => onSetEditingProfile(false)}
                      className="min-h-[44px] w-full sm:w-auto px-5 sm:px-6 py-2.5 sm:py-3 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg sm:rounded-xl font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center touch-manipulation"
                      aria-label="Отмена редактирования"
                    >
                      Отмена
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => onSetEditingProfile(true)}
                    className="min-h-[44px] w-full sm:w-auto px-5 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg sm:rounded-xl font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center touch-manipulation"
                    aria-label="Редактировать профиль"
                  >
                    Редактировать
                  </button>
                )}
              </div>

              <div className="border-t border-slate-800 pt-4 sm:pt-5 md:pt-6">
                <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg font-semibold text-red-400 mb-3 sm:mb-4">Опасная зона</h3>
                <button
                  onClick={onHandleDeleteAccount}
                  className="min-h-[44px] w-full sm:w-auto px-5 sm:px-6 py-2.5 sm:py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-lg sm:rounded-xl font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center touch-manipulation"
                  aria-label="Удалить аккаунт"
                >
                  Удалить аккаунт
                </button>
              </div>
            </div>
          </div>
        )}

        {dashboardTab === 'payments' && (
          <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 p-4 sm:p-5 md:p-6">
            <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200 mb-4 sm:mb-5 md:mb-6">История платежей</h2>
            {paymentsLoading ? (
              <div className="flex items-center justify-center py-8 sm:py-10 md:py-12">
                <div className="w-7 h-7 sm:w-8 sm:h-8 border-2 border-slate-600 border-t-blue-600 rounded-full animate-spin"></div>
              </div>
            ) : payments.length === 0 ? (
              <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400 text-center py-8 sm:py-10 md:py-12">Нет платежей</p>
            ) : (
              <>
                {/* Mobile Card Layout */}
                <div className="md:hidden space-y-3">
                  {payments.map((payment) => (
                    <div key={payment.id} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                      <div className="space-y-2">
                        <div>
                          <span className="text-xs font-medium text-slate-400 uppercase">Дата</span>
                          <p className="text-slate-200 mt-0.5 text-sm">{formatDate(payment.createdAt)}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-slate-400 uppercase">Тариф</span>
                          <p className="text-slate-200 mt-0.5 text-sm">{payment.tariffName || 'Не указан'}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-slate-400 uppercase">Сумма</span>
                          <p className="text-slate-200 font-semibold mt-0.5 text-sm">{payment.amount} ₽</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-slate-400 uppercase">Статус</span>
                          <div className="mt-0.5">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              payment.status === 'completed' 
                                ? 'bg-green-900/30 text-green-400' 
                                : 'bg-slate-700 text-slate-400'
                            }`}>
                              {payment.status === 'completed' ? 'Оплачено' : payment.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table Layout */}
                <div className="hidden md:block overflow-x-auto -mx-2 sm:mx-0">
                  <div className="inline-block min-w-full align-middle">
                    <table className="min-w-full divide-y divide-slate-800">
                      <thead>
                        <tr className="border-b border-slate-800">
                          <th className="text-left py-3 px-2 sm:px-4 text-slate-400 font-semibold text-xs sm:text-sm">Дата</th>
                          <th className="text-left py-3 px-2 sm:px-4 text-slate-400 font-semibold text-xs sm:text-sm">Тариф</th>
                          <th className="text-left py-3 px-2 sm:px-4 text-slate-400 font-semibold text-xs sm:text-sm">Сумма</th>
                          <th className="text-left py-3 px-2 sm:px-4 text-slate-400 font-semibold text-xs sm:text-sm">Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((payment) => (
                          <tr key={payment.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                            <td className="py-3 px-2 sm:px-4 text-slate-300 text-xs sm:text-sm">{formatDate(payment.createdAt)}</td>
                            <td className="py-3 px-2 sm:px-4 text-slate-300 text-xs sm:text-sm">{payment.tariffName || 'Не указан'}</td>
                            <td className="py-3 px-2 sm:px-4 text-slate-300 font-semibold text-xs sm:text-sm">{payment.amount} ₽</td>
                            <td className="py-3 px-2 sm:px-4">
                              <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-semibold ${
                                payment.status === 'completed' 
                                  ? 'bg-green-900/30 text-green-400' 
                                  : 'bg-slate-800 text-slate-400'
                              }`}>
                                {payment.status === 'completed' ? 'Оплачено' : payment.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {showKeyModal && currentUser && (
          <KeyModal
            user={currentUser}
            onClose={() => onSetShowKeyModal(false)}
            settings={settings}
            onCopy={onCopy}
            formatDate={formatDate}
          />
        )}

        {/* Модальное окно выбора тарифа */}
        {showTariffModal && selectedTariff && (
          <TariffSelectionModal
            tariff={selectedTariff}
            onClose={() => {
              setShowTariffModal(false)
              setSelectedTariff(null)
            }}
            onConfirm={handleTariffConfirm}
            isLoading={creatingSubscription}
            natrockPorts={settings?.natrockPorts || []}
            settings={settings}
          />
        )}

        {/* Модальное окно обработки платежа */}
        {showPaymentProcessing && (
          <PaymentProcessingModal
            message={paymentProcessingMessage}
            onClose={() => {
              // Не позволяем закрыть модальное окно во время обработки
              // Оно закроется автоматически после получения результата
            }}
          />
        )}

        {/* Модальное окно успешного оформления подписки */}
        {showSuccessModal && subscriptionSuccess && (
          <SubscriptionSuccessModal
            vpnLink={subscriptionSuccess.vpnLink}
            onClose={() => {
              setShowSuccessModal(false)
              setSubscriptionSuccess(null)
            }}
            onCopy={onCopy}
            tariffName={subscriptionSuccess.tariffName || currentUser.tariffName || 'Не указан'}
            devices={subscriptionSuccess.devices || currentUser.devices || 1}
            periodMonths={subscriptionSuccess.periodMonths || currentUser.periodMonths || 1}
            expiresAt={subscriptionSuccess.expiresAt || currentUser.expiresAt || null}
            paymentStatus={subscriptionSuccess.paymentStatus || currentUser.paymentStatus || 'paid'}
            testPeriod={subscriptionSuccess.testPeriod || subscriptionSuccess.paymentStatus === 'test_period' || false}
            paymentUrl={subscriptionSuccess.paymentUrl || null}
            orderId={subscriptionSuccess.orderId || null}
            amount={subscriptionSuccess.amount || null}
            requiresPayment={subscriptionSuccess.requiresPayment || false}
            message={subscriptionSuccess.message || null}
          />
        )}

        {/* Модальное окно подтверждения удаления подписки */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-md" onClick={() => setShowDeleteConfirm(false)}>
            <div
              className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 sm:p-5 md:p-6 border-b border-slate-800">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-red-500/20 rounded-lg">
                    <AlertCircle className="w-6 h-6 text-red-400" />
                  </div>
                  <h3 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-white">
                    Отменить подписку?
                  </h3>
                </div>
                <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] mt-3">
                  Вы уверены, что хотите отменить подписку? Это действие удалит вашу VPN конфигурацию и прекратит доступ к сервису.
                </p>
                <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-800/50 rounded-lg">
                  <p className="text-yellow-300 text-xs sm:text-sm">
                    <strong>Внимание:</strong> Это действие нельзя отменить. После удаления подписки вам потребуется оформить новую подписку для восстановления доступа.
                  </p>
                </div>
              </div>
              <div className="p-4 sm:p-5 md:p-6 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deletingSubscription}
                  className="flex-1 min-h-[44px] px-4 py-3 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                  aria-label="Отмена"
                >
                  Отмена
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deletingSubscription || creatingSubscription}
                  className="flex-1 min-h-[44px] px-4 py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-lg font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-manipulation"
                  aria-label="Подтвердить удаление"
                >
                  {deletingSubscription || creatingSubscription ? (
                    <>
                      <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                      <span>Удаление...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span>Да, отменить подписку</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {showLogger && <LoggerPanel onClose={() => onSetShowLogger(false)} />}
    </div>
  )
}

export default Dashboard

