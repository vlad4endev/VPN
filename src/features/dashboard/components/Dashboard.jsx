import { useEffect, useState, useRef } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { CheckCircle2, XCircle, AlertCircle, CreditCard, User, History, Shield, Globe, Copy, Check, Clock, Calendar, Smartphone, Zap, Trash2, Loader2, X, Link2, Gift, RefreshCw, ArrowLeftRight, Lock } from 'lucide-react'
import Sidebar from '../../../shared/components/Sidebar.jsx'
import Footer from '../../../shared/components/Footer.jsx'
import KeyModal from './KeyModal.jsx'
import LoggerPanel from '../../../shared/components/LoggerPanel.jsx'
import TariffSelectionModal from './TariffSelectionModal.jsx'
import TariffsContainer from './TariffsContainer.jsx'
import SubscriptionSuccessModal from './SubscriptionSuccessModal.jsx'
import PaymentProcessingModal from './PaymentProcessingModal.jsx'
import { getUserStatus } from '../../../shared/utils/userStatus.js'
import { useSubscriptionStatus } from '../../../shared/hooks/useSubscriptionStatus.js'
import logger from '../../../shared/utils/logger.js'
import { dashboardService } from '../services/dashboardService.js'
import { useSubscriptionNotifications } from '../hooks/useSubscriptionNotifications.js'
import notificationService from '../../../shared/services/notificationService.js'
import { formatTimeRemaining, getTimeRemaining } from '../../../shared/utils/formatDate.js'
import TelegramBindCard from '../../telegram/components/TelegramBindCard.jsx'
import SetPasswordForEmailCard from './SetPasswordForEmailCard.jsx'
import SubscriptionInfoCard from './SubscriptionInfoCard.jsx'
import VPNKeyControl from './VPNKeyControl.jsx'



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
  onHandleAddDevices,
  onHandleDeleteSubscription,
  onRefreshUserAfterPayment,
  onHandleUpdateProfile,
  onHandleDeleteAccount,
  onProfileNameChange,
  onProfilePhoneChange,
  hasGoogleProvider = false,
  onSetPasswordForEmail,
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
  servers = [],
  isTelegramMini = false,
}) => {
  const { t } = useTranslation()
  // Состояние для модальных окон выбора тарифа и успеха
  const [selectedTariff, setSelectedTariff] = useState(null)
  const [showTariffModal, setShowTariffModal] = useState(false)
  const [subscriptionSuccess, setSubscriptionSuccess] = useState(null)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingSubscription, setDeletingSubscription] = useState(false)
  const [showAddDevicesModal, setShowAddDevicesModal] = useState(false)
  const [additionalDevices, setAdditionalDevices] = useState(1)
  const [showPaymentProcessing, setShowPaymentProcessing] = useState(false)
  const [paymentProcessingMessage, setPaymentProcessingMessage] = useState('')
  const [paymentProcessingStatus, setPaymentProcessingStatus] = useState('processing') // 'processing', 'waiting', 'checking', 'error'
  const paymentProcessingMessageTimerRef = useRef(null)
  const [paymentWindowRef, setPaymentWindowRef] = useState(null)
  const [paymentOrderId, setPaymentOrderId] = useState(null)
  const paymentPollingIntervalRef = useRef(null)
  const paymentCheckTimeoutRef = useRef(null)
  const paymentCheckAttemptsRef = useRef(0)
  const urlOrderIdProcessedRef = useRef(false)
  const [awaitingPaymentResult, setAwaitingPaymentResult] = useState(false)
  const [paymentPollAttempt, setPaymentPollAttempt] = useState(0)
  const paymentAutoPollTimeoutRef = useRef(null)
  const paymentAutoPollIntervalRef = useRef(null)
  const handleManualPaymentCheckRef = useRef(() => { })
  /** Защита от двойного создания: orderId, для которых подписка уже создаётся или создана (до следующего нового платежа). */
  const subscriptionCreatedForOrderIdsRef = useRef(new Set())
  /** orderId, для которого идёт повторная проверка статуса из истории платежей */
  const [recheckingOrderId, setRecheckingOrderId] = useState(null)
  const [changingPlan, setChangingPlan] = useState(false)
  const [changePlanError, setChangePlanError] = useState(null)
  const [changePlanSuccess, setChangePlanSuccess] = useState(null)

  // Получаем статус подписки (subscription.status - единственный источник правды)
  const { status: subscriptionStatus, label: subscriptionLabel, color: subscriptionColor, subscription } = useSubscriptionStatus(currentUser)

  // Показываем блок подписки, если есть ключ и тариф, и статус не «окончательно истёк»
  // active до конца срока, expiring_soon (< 2 дней), grace (5 дней после просрочки), затем expired — только тогда «нет подписки»
  const hasSubscription = currentUser?.uuid && currentUser?.tariffId && (
    subscriptionStatus === 'active' ||
    subscriptionStatus === 'test_period' ||
    subscriptionStatus === 'activating' ||
    subscriptionStatus === 'expiring_soon' ||
    subscriptionStatus === 'grace' ||
    (subscriptionStatus === 'expired' && (() => {
      if (!subscription && currentUser?.unpaidStartDate) {
        const daysUnpaid = (Date.now() - new Date(currentUser.unpaidStartDate).getTime()) / (24 * 60 * 60 * 1000)
        return daysUnpaid < 5
      }
      return false
    })())
  )

  // Используем статус из subscription (единственный источник правды)
  const userStatus = {
    status: subscriptionStatus,
    label: subscriptionLabel,
    color: subscriptionColor
  }

  const tariffsList = Array.isArray(tariffs) ? tariffs : []
  const currentTariff = tariffsList.find(t => t.id === currentUser?.tariffId)
  const currentPlanKey = (currentUser?.plan || currentUser?.tariffName || '').toLowerCase()
  // Все остальные активные тарифы для переключения; по одному на уникальное имя/план (без дублей в UI)
  const otherTariffsForSwitchRaw = tariffsList.filter(t => {
    if (!t.active) return false
    if (t.id === currentUser?.tariffId) return false
    return true
  })
  const otherTariffsForSwitch = otherTariffsForSwitchRaw.reduce((acc, t) => {
    const key = ((t.plan || t.name || t.id) || '').toString().toLowerCase().trim()
    if (!key) return acc
    if (acc.some(x => ((x.plan || x.name || x.id) || '').toString().toLowerCase().trim() === key)) return acc
    acc.push(t)
    return acc
  }, [])
  const otherTariffForSwitch = otherTariffsForSwitch[0] ?? null

  // Состояние для оставшегося времени подписки (обновляется каждую минуту)
  const [timeRemaining, setTimeRemaining] = useState(() =>
    currentUser?.expiresAt ? getTimeRemaining(currentUser.expiresAt) : null
  )

  // Обновление оставшегося времени каждую минуту
  useEffect(() => {
    if (!currentUser?.expiresAt) {
      setTimeRemaining(null)
      return
    }

    const updateTimeRemaining = () => {
      setTimeRemaining(getTimeRemaining(currentUser.expiresAt))
    }

    // Обновляем сразу
    updateTimeRemaining()

    // Обновляем каждую минуту
    const interval = setInterval(updateTimeRemaining, 60000)

    return () => clearInterval(interval)
  }, [currentUser?.expiresAt])

  // Используем хук для проверки подписок и отправки уведомлений
  useSubscriptionNotifications(currentUser)

  // Обработчик события от уведомлений для открытия окна оплаты
  useEffect(() => {
    const handleOpenPaymentModal = (event) => {
      logger.info('Dashboard', 'Получено событие для открытия окна оплаты', {
        type: event.detail?.type
      })

      // Если есть доступные тарифы, открываем модальное окно с первым доступным тарифом
      if (tariffsList.length > 0) {
        // Находим первый активный тариф или просто первый тариф
        const availableTariff = tariffsList.find(t => t.active !== false) || tariffsList[0]
        if (availableTariff) {
          setSelectedTariff(availableTariff)
          setShowTariffModal(true)
          logger.info('Dashboard', 'Открыто модальное окно оплаты по уведомлению', {
            tariffId: availableTariff.id,
            tariffName: availableTariff.name
          })
        } else {
          logger.warn('Dashboard', 'Не найден доступный тариф для открытия окна оплаты')
        }
      } else {
        logger.warn('Dashboard', 'Нет доступных тарифов для открытия окна оплаты')
      }
    }

    window.addEventListener('openPaymentModal', handleOpenPaymentModal)

    return () => {
      window.removeEventListener('openPaymentModal', handleOpenPaymentModal)
    }
  }, [tariffs])

  // Отладочный useEffect для отслеживания изменений состояния модального окна
  useEffect(() => {
    logger.debug('Dashboard', 'Состояние модального окна изменилось', {
      showSuccessModal,
      hasSubscriptionSuccess: !!subscriptionSuccess,
      subscriptionSuccessKeys: subscriptionSuccess ? Object.keys(subscriptionSuccess) : [],
      subscriptionSuccessPaymentUrl: subscriptionSuccess?.paymentUrl
    })
  }, [showSuccessModal, subscriptionSuccess])

  // Сохраняем стабильные ссылки на функции и данные, чтобы избежать перезапуска useEffect
  const onHandleCreateSubscriptionRef = useRef(onHandleCreateSubscription)
  const tariffsRef = useRef(tariffs)
  const currentUserRef = useRef(currentUser)
  const subscriptionSuccessRef = useRef(subscriptionSuccess)
  const onSetShowKeyModalRef = useRef(onSetShowKeyModal)
  const onRefreshUserAfterPaymentRef = useRef(onRefreshUserAfterPayment)

  // Обновляем refs при изменении
  useEffect(() => {
    onHandleCreateSubscriptionRef.current = onHandleCreateSubscription
    tariffsRef.current = tariffs
    currentUserRef.current = currentUser
    subscriptionSuccessRef.current = subscriptionSuccess
    onSetShowKeyModalRef.current = onSetShowKeyModal
    onRefreshUserAfterPaymentRef.current = onRefreshUserAfterPayment
  }, [onHandleCreateSubscription, tariffs, currentUser, subscriptionSuccess, onSetShowKeyModal, onRefreshUserAfterPayment])

  // Проверка статуса платежа с задержками и повторными попытками
  useEffect(() => {
    if (!paymentOrderId || !showPaymentProcessing) {
      // Очищаем все таймауты и интервалы если нет активного заказа
      if (paymentCheckTimeoutRef.current) {
        clearTimeout(paymentCheckTimeoutRef.current)
        paymentCheckTimeoutRef.current = null
      }
      if (paymentPollingIntervalRef.current) {
        clearTimeout(paymentPollingIntervalRef.current) // Используем clearTimeout, так как это setTimeout
        paymentPollingIntervalRef.current = null
      }
      paymentCheckAttemptsRef.current = 0
      return
    }

    logger.debug('Dashboard', 'Запуск проверки статуса платежа с задержками', { orderId: paymentOrderId })

    // Сбрасываем счетчик попыток
    paymentCheckAttemptsRef.current = 0

    // Этап 1: Через 5 секунд меняем сообщение на "Ожидаем платеж" (увеличено с 3 до 5 секунд)
    const waitingTimeout = setTimeout(() => {
      logger.debug('Dashboard', 'Переход в режим ожидания платежа', { orderId: paymentOrderId })
      setPaymentProcessingMessage(t('dashboard.statusPending'))
      setPaymentProcessingStatus('waiting')
    }, 5000)

    // Этап 2: Через 10 секунд начинаем проверку статуса (до 20 попыток, каждые 3 с — успех или отказ)
    const checkingTimeout = setTimeout(async () => {
      logger.debug('Dashboard', 'Начинаем проверку статуса платежа (Platega API)', { orderId: paymentOrderId })
      setPaymentProcessingMessage(t('dashboard.statusChecking'))
      setPaymentProcessingStatus('checking')

      const MAX_PAYMENT_CHECK_ATTEMPTS = 20

      // Функция проверки: только GET /api/payment/status (Platega)
      const checkPaymentViaWebhook = async () => {
        try {
          const { dashboardService } = await import('../services/dashboardService.js')
          const attempt = paymentCheckAttemptsRef.current + 1

          logger.debug('Dashboard', 'Проверка статуса платежа', {
            orderId: paymentOrderId,
            attempt,
            maxAttempts: MAX_PAYMENT_CHECK_ATTEMPTS
          })

          // Сначала запрос статуса к API (бэкенд опрашивает Platega и синхронизирует Firestore)
          const statusResult = await dashboardService.fetchPaymentStatus(paymentOrderId)
          if (statusResult.success && statusResult.status === 'completed' && statusResult.payment) {
            const payment = statusResult.payment
            logger.info('Dashboard', 'Платёж подтверждён (API статуса)', {
              orderId: paymentOrderId,
              attempt,
              status: payment.status
            })
            // Останавливаем проверки и запускаем блок успеха (ниже)
            if (paymentCheckTimeoutRef.current) {
              clearTimeout(paymentCheckTimeoutRef.current)
              paymentCheckTimeoutRef.current = null
            }
            if (paymentPollingIntervalRef.current) {
              clearTimeout(paymentPollingIntervalRef.current)
              paymentPollingIntervalRef.current = null
            }
            // Тариф только из платежа или subscriptionSuccess (выбранный при оплате). Не подставлять currentUser.tariffId и не tariffs[0].
            const tariffsList = tariffsRef.current || []
            const subscriptionData = subscriptionSuccessRef.current || {}
            const currentUserData = currentUserRef.current
            let tariff = payment.tariffId ? tariffsList.find(t => t.id === payment.tariffId) : null
            if (!tariff && (payment.tariffName || subscriptionData.tariffName)) {
              const name = (payment.tariffName || subscriptionData.tariffName || '').trim()
              tariff = name ? tariffsList.find(t => (t.name || '').toLowerCase() === name.toLowerCase()) : null
              if (tariff) {
                payment.tariffId = tariff.id
                payment.tariffName = tariff.name
              }
            }
            if (!tariff && subscriptionData.tariffId) {
              tariff = tariffsList.find(t => t.id === subscriptionData.tariffId)
              if (tariff) {
                payment.tariffId = tariff.id
                payment.tariffName = tariff.name
              }
            }
            if (!tariff) {
              logger.error('Dashboard', 'Тариф не найден для завершённого платежа', { orderId: paymentOrderId })
              window.location.reload()
              return true
            }
            if (subscriptionData.operationType === 'add_devices' && subscriptionData.newDevicesCount != null && currentUserData) {
              try {
                await dashboardService.applyAddDevicesAfterPayment(currentUserData, subscriptionData.newDevicesCount)
                await onRefreshUserAfterPaymentRef.current?.().catch((err) => console.warn('Dashboard:', err?.message))
                setShowSuccessModal(false)
                setSubscriptionSuccess(null)
                subscriptionCreatedForOrderIdsRef.current.add(paymentOrderId)
                setShowPaymentProcessing(false)
                setPaymentOrderId(null)
                setPaymentWindowRef(null)
                setTimeout(() => window.location.reload(), 1500)
                return true
              } catch (addDevErr) {
                logger.error('Dashboard', 'Ошибка применения добавления устройств', { orderId: paymentOrderId }, addDevErr)
              }
            }
            try {
              await onHandleCreateSubscriptionRef.current(
                tariff,
                payment.devices || 1,
                null,
                payment.periodMonths || 1,
                false,
                'paid',
                payment.discount || 0
              )
              try {
                const notificationInstance = notificationService.getInstance()
                if (notificationInstance.hasPermission()) {
                  await notificationInstance.notifyPaymentSuccess(
                    payment.tariffName || tariff.name || t('dashboard.subscriptionFallback'),
                    payment.amount || 0
                  )
                }
              } catch (_) { }
              setShowPaymentProcessing(false)
              setPaymentOrderId(null)
              setPaymentWindowRef(null)
              setShowSuccessModal(false)
              setSubscriptionSuccess(null)
              setTimeout(() => window.location.reload(), 1500)
            } catch (err) {
              logger.error('Dashboard', 'Ошибка создания подписки после оплаты', { orderId: paymentOrderId }, err)
              setTimeout(() => window.location.reload(), 1000)
            }
            return true
          }
          if (statusResult.success && ['cancelled', 'failed', 'chargebacked'].includes(statusResult.status)) {
            logger.warn('Dashboard', 'Платёж не прошёл (отказ)', { orderId: paymentOrderId, status: statusResult.status })
            if (paymentCheckTimeoutRef.current) {
              clearTimeout(paymentCheckTimeoutRef.current)
              paymentCheckTimeoutRef.current = null
            }
            if (paymentPollingIntervalRef.current) {
              clearTimeout(paymentPollingIntervalRef.current)
              paymentPollingIntervalRef.current = null
            }
            setPaymentProcessingMessage(t('paymentProcessing.paymentFailed'))
            setPaymentProcessingStatus('error')
            setTimeout(() => {
              setShowPaymentProcessing(false)
              setPaymentOrderId(null)
              setPaymentWindowRef(null)
              setPaymentProcessingStatus('processing')
              setPaymentProcessingMessage(t('paymentProcessing.accountant'))
            }, 3000)
            return true
          }

          // Статус ещё pending или ошибка API — следующая попытка через 3 с (только Platega)
          paymentCheckAttemptsRef.current++
          logger.debug('Dashboard', 'Статус pending, следующая проверка через 3 с', {
            orderId: paymentOrderId,
            attempt: paymentCheckAttemptsRef.current,
            maxAttempts: MAX_PAYMENT_CHECK_ATTEMPTS
          })

          return false
        } catch (error) {
          logger.error('Dashboard', 'Ошибка проверки платежа', {
            orderId: paymentOrderId,
            attempt: paymentCheckAttemptsRef.current + 1
          }, error)
          paymentCheckAttemptsRef.current++
          return false // Продолжаем попытки при ошибке
        }
      }

      // Проверка каждые 3 секунды, максимум 20 попыток — до успеха или отказа
      const performCheck = async () => {
        if (paymentCheckAttemptsRef.current >= MAX_PAYMENT_CHECK_ATTEMPTS) {
          logger.warn('Dashboard', 'Достигнуто максимальное количество попыток проверки платежа', {
            orderId: paymentOrderId,
            attempts: paymentCheckAttemptsRef.current
          })

          // Останавливаем все проверки
          if (paymentPollingIntervalRef.current) {
            clearTimeout(paymentPollingIntervalRef.current)
            paymentPollingIntervalRef.current = null
          }

          // Показываем ошибку
          setPaymentProcessingMessage(t('paymentProcessing.paymentFailed'))
          setPaymentProcessingStatus('error')

          // Очищаем состояние через 3 секунды
          setTimeout(() => {
            setShowPaymentProcessing(false)
            setPaymentOrderId(null)
            setPaymentWindowRef(null)
            setPaymentProcessingStatus('processing')
            setPaymentProcessingMessage(t('paymentProcessing.accountant'))
            paymentCheckAttemptsRef.current = 0
          }, 3000)
          return
        }

        const found = await checkPaymentViaWebhook()

        if (!found && paymentCheckAttemptsRef.current < MAX_PAYMENT_CHECK_ATTEMPTS) {
          // Продолжаем проверку через 3 секунды
          paymentPollingIntervalRef.current = setTimeout(performCheck, 3000)
        }
      }

      // Запускаем первую проверку
      performCheck()
    }, 10000) // Через 10 с после показа ожидания начинаем опрос (до 20 попыток по 3 с — успех или отказ)

    // Cleanup: останавливаем все таймауты и интервалы
    return () => {
      clearTimeout(waitingTimeout)
      clearTimeout(checkingTimeout)
      if (paymentCheckTimeoutRef.current) {
        clearTimeout(paymentCheckTimeoutRef.current)
        paymentCheckTimeoutRef.current = null
      }
      if (paymentPollingIntervalRef.current) {
        clearTimeout(paymentPollingIntervalRef.current) // Используем clearTimeout, так как это setTimeout, а не setInterval
        paymentPollingIntervalRef.current = null
      }
      paymentCheckAttemptsRef.current = 0
    }
    // Убираем зависимости tariffs, onHandleCreateSubscription, currentUser, subscriptionSuccess из массива зависимостей
    // Используем refs для доступа к актуальным значениям без перезапуска useEffect
  }, [paymentOrderId, showPaymentProcessing])

  // Отслеживание закрытия окна оплаты
  useEffect(() => {
    if (!paymentWindowRef || !paymentOrderId) return

    logger.debug('Dashboard', 'Отслеживание закрытия окна оплаты', {
      orderId: paymentOrderId
    })

    const checkWindowClosed = setInterval(() => {
      try {
        // Проверяем, закрыто ли окно
        if (paymentWindowRef.closed) {
          logger.info('Dashboard', 'Окно оплаты закрыто, ожидаем 5 секунд перед проверкой платежа', {
            orderId: paymentOrderId
          })

          // Очищаем интервал проверки окна
          clearInterval(checkWindowClosed)

          // Сразу запускаем проверку статуса платежа через webhook
          setTimeout(async () => {
            try {
              logger.info('Dashboard', 'Окно оплаты закрыто, проверка статуса через Platega API', {
                orderId: paymentOrderId
              })

              const { dashboardService } = await import('../services/dashboardService.js')
              const statusResult = await dashboardService.fetchPaymentStatus(paymentOrderId)

              logger.info('Dashboard', 'Результат проверки статуса (Platega)', {
                orderId: paymentOrderId,
                success: statusResult?.success,
                status: statusResult?.status,
                hasPayment: !!statusResult?.payment
              })

              const payment = statusResult?.success && statusResult?.status === 'completed' ? statusResult.payment : null

              if (payment && (payment.status === 'completed' || payment.status === 'paid')) {
                logger.info('Dashboard', 'Платеж подтверждён (Platega, после закрытия окна), создаем подписку', {
                  orderId: paymentOrderId,
                  status: payment.status
                })

                // Находим тариф (используем refs для стабильности)
                // Тариф только из платежа или subscriptionSuccess (выбранный при оплате)
                const tariffsList = tariffsRef.current || []
                const subscriptionData = subscriptionSuccessRef.current || {}
                const currentUserData = currentUserRef.current
                let tariff = payment.tariffId ? tariffsList.find(t => t.id === payment.tariffId) : null
                if (!tariff && (payment.tariffName || subscriptionData.tariffName)) {
                  const name = (payment.tariffName || subscriptionData.tariffName || '').trim()
                  tariff = name ? tariffsList.find(t => (t.name || '').toLowerCase() === name.toLowerCase()) : null
                }
                if (!tariff && subscriptionData.tariffId) {
                  tariff = tariffsList.find(t => t.id === subscriptionData.tariffId)
                }
                if (!tariff && (payment.tariffId || payment.tariffName)) {
                  logger.warn('Dashboard', 'Тариф из платежа не найден в списке тарифов (окно закрыто). Нажмите «Проверить статус» в истории платежей.', {
                    orderId: paymentOrderId,
                    paymentTariffId: payment.tariffId,
                    paymentTariffName: payment.tariffName
                  })
                }

                if (subscriptionData.operationType === 'add_devices' && subscriptionData.newDevicesCount != null && currentUserData) {
                  try {
                    await dashboardService.applyAddDevicesAfterPayment(currentUserData, subscriptionData.newDevicesCount)
                    await onRefreshUserAfterPaymentRef.current?.().catch((err) => console.warn('Dashboard:', err?.message))
                    setShowSuccessModal(false)
                    setSubscriptionSuccess(null)
                    subscriptionCreatedForOrderIdsRef.current.add(paymentOrderId)
                    setTimeout(() => { window.location.reload() }, 1000)
                  } catch (addDevErr) {
                    logger.error('Dashboard', 'Ошибка применения добавления устройств (окно закрыто)', { orderId: paymentOrderId }, addDevErr)
                  }
                  return
                }
                if (tariff && onHandleCreateSubscriptionRef.current) {
                  if (subscriptionCreatedForOrderIdsRef.current.has(paymentOrderId)) {
                    logger.info('Dashboard', 'Пропуск дубликата: подписка уже создана/создаётся для этого заказа (окно закрыто)', { orderId: paymentOrderId })
                    return
                  }
                  subscriptionCreatedForOrderIdsRef.current.add(paymentOrderId)
                  try {
                    const isFirstPaymentWebhook = !currentUserData?.uuid || !currentUserData?.tariffId
                    await onHandleCreateSubscriptionRef.current(
                      tariff,
                      payment.devices || 1,
                      null,
                      payment.periodMonths || 1,
                      false,
                      'paid',
                      payment.discount || 0
                    )
                    logger.info('Dashboard', 'Подписка создана после проверки webhook', {
                      orderId: paymentOrderId,
                      isFirstPayment: isFirstPaymentWebhook
                    })
                    if (isFirstPaymentWebhook && typeof onSetShowKeyModalRef.current === 'function') {
                      await onRefreshUserAfterPaymentRef.current?.().catch((err) => console.warn('Dashboard:', err?.message))
                      setShowSuccessModal(false)
                      setSubscriptionSuccess(null)
                      onSetShowKeyModalRef.current(true)
                    } else {
                      setTimeout(() => { window.location.reload() }, 1000)
                    }
                  } catch (err) {
                    subscriptionCreatedForOrderIdsRef.current.delete(paymentOrderId)
                    throw err
                  }
                  return
                }
              } else {
                logger.info('Dashboard', 'Платеж еще не обработан, продолжаем polling', {
                  orderId: paymentOrderId,
                  status: payment?.status || 'pending'
                })
              }
            } catch (error) {
              logger.error('Dashboard', 'Ошибка при проверке платежа после закрытия окна', {
                orderId: paymentOrderId
              }, error)
              // Не показываем ошибку пользователю, polling продолжит проверку
            }
          }, 2000) // Ждем 2 секунды для обработки webhook

          // Если polling еще не запущен (не должно быть), запускаем его
          // Но обычно polling уже запущен, так что это просто безопасность
          if (!paymentPollingIntervalRef.current) {
            logger.debug('Dashboard', 'Окно закрыто, запускаем polling (fallback)')
          }
        }
      } catch (error) {
        // Ошибка может возникнуть при попытке доступа к закрытому окну из другого домена
        // Это нормально, просто очищаем интервал
        logger.debug('Dashboard', 'Ошибка проверки статуса окна (возможно, окно закрыто)', {
          error: error.message
        })
        clearInterval(checkWindowClosed)
      }
    }, 1000) // Проверяем каждую секунду

    return () => {
      clearInterval(checkWindowClosed)
    }
    // Убираем зависимости tariffs, onHandleCreateSubscription, currentUser из массива зависимостей
    // Используем refs для доступа к актуальным значениям без перезапуска useEffect
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
    if (tariffsList.length === 0) {
      loadTariffs()
    }
  }, [tariffsList.length, loadTariffs])

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
      if (paymentProcessingMessageTimerRef.current) clearTimeout(paymentProcessingMessageTimerRef.current)
      setPaymentProcessingMessage(t('paymentProcessing.accountant'))
      setShowPaymentProcessing(true)
      paymentProcessingMessageTimerRef.current = setTimeout(() => {
        setPaymentProcessingMessage(t('paymentProcessing.accountantLong'))
        paymentProcessingMessageTimerRef.current = null
      }, 3000)

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

      logger.info('Dashboard', 'Вызов onHandleCreateSubscription', {
        tariffId: subscriptionData.tariff.id,
        tariffName: subscriptionData.tariff.name
      })

      console.log('🔍 Dashboard: ПЕРЕД await onHandleCreateSubscription')

      const result = await onHandleCreateSubscription(
        subscriptionData.tariff,
        subscriptionData.devices,
        subscriptionData.natrockPort,
        subscriptionData.periodMonths || 1,
        subscriptionData.testPeriod || false,
        subscriptionData.paymentMode || 'pay_now',
        subscriptionData.discount || 0,
        subscriptionData.promocodeId || null
      )

      logger.info('Dashboard', 'onHandleCreateSubscription вернул результат (ПОСЛЕ await)', {
        hasResult: !!result,
        hasPaymentUrl: !!result?.paymentUrl,
        requiresPayment: result?.requiresPayment,
        resultKeys: result ? Object.keys(result) : [],
        fullResult: result
      })

      console.log('🔍 Dashboard: result после await onHandleCreateSubscription:', result)

      // Если результат содержит требование оплаты (orderId + requiresPayment), показываем модалку ожидания
      // paymentUrl может быть пустым (оплата по реквизитам / Platega не настроен)
      if (paymentProcessingMessageTimerRef.current) {
        clearTimeout(paymentProcessingMessageTimerRef.current)
        paymentProcessingMessageTimerRef.current = null
      }
      if (result && result.requiresPayment && result.orderId) {
        const subscriptionSuccessData = {
          vpnLink: null,
          paymentUrl: result.paymentUrl || '',
          orderId: result.orderId,
          amount: result.amount,
          requiresPayment: true,
          message: result.message || t('dashboard.paymentRequiredForActivation'),
          tariffId: result.tariffId || subscriptionData.tariff?.id || null,
          tariffName: result.tariffName || subscriptionData.tariff?.name || null,
          devices: result.devices || subscriptionData.devices || 1,
          periodMonths: result.periodMonths || subscriptionData.periodMonths || 1,
          discount: result.discount || subscriptionData.discount || 0
        }
        setSubscriptionSuccess(subscriptionSuccessData)
        setShowSuccessModal(true)
        setShowPaymentProcessing(false)
        if (result.orderId) setPaymentOrderId(result.orderId)
        // Открываем окно оплаты только если есть ссылка
        if (result.paymentUrl) {
          logger.info('Dashboard', 'Открываем ссылку на оплату в мини-окне', {
            paymentUrl: result.paymentUrl,
            orderId: result.orderId
          })
          const windowFeatures = ['width=400', 'height=700', 'left=' + (window.screen.width / 2 - 200), 'top=' + (window.screen.height / 2 - 350), 'resizable=yes', 'scrollbars=yes', 'status=no', 'toolbar=no', 'menubar=no', 'location=no'].join(',')
          const paymentWindow = window.open(result.paymentUrl, 'payment_miniapp', windowFeatures)
          if (paymentWindow) {
            paymentWindow.focus()
            setPaymentWindowRef(paymentWindow)
            setPaymentProcessingMessage(t('paymentProcessing.redirecting'))
            setPaymentProcessingStatus('processing')
          } else {
            logger.warn('Dashboard', 'Не удалось открыть окно оплаты (возможно, заблокировано браузером)')
          }
        }
        return
      }
      if (result && result.paymentUrl) {
        logger.info('Dashboard', 'Открываем ссылку на оплату в мини-окне', {
          paymentUrl: result.paymentUrl,
          orderId: result.orderId,
          amount: result.amount,
          requiresPayment: result.requiresPayment
        })

        // Показываем модальное окно с информацией об оплате
        const subscriptionSuccessData = {
          vpnLink: null,
          paymentUrl: result.paymentUrl,
          orderId: result.orderId,
          amount: result.amount,
          requiresPayment: true,
          message: result.message || t('dashboard.paymentRequiredForActivation'),
          tariffId: result.tariffId || subscriptionData.tariff?.id || null,
          tariffName: result.tariffName || subscriptionData.tariff?.name || null,
          devices: result.devices || subscriptionData.devices || 1,
          periodMonths: result.periodMonths || subscriptionData.periodMonths || 1,
          discount: result.discount || subscriptionData.discount || 0
        }

        logger.info('Dashboard', 'Устанавливаем subscriptionSuccess и показываем модальное окно', {
          hasPaymentUrl: !!subscriptionSuccessData.paymentUrl,
          orderId: subscriptionSuccessData.orderId,
          amount: subscriptionSuccessData.amount,
          tariffName: subscriptionSuccessData.tariffName,
          willSetShowSuccessModal: true
        })

        setSubscriptionSuccess(subscriptionSuccessData)
        setShowSuccessModal(true)
        // Закрываем модалку обработки, чтобы была видна модалка «требуется оплата» и автопроверка («Проверяем оплату…»)
        setShowPaymentProcessing(false)

        logger.info('Dashboard', 'Модальное окно должно быть показано', {
          showSuccessModal: true,
          subscriptionSuccess: subscriptionSuccessData
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

          // Обновляем сообщение модального окна обработки - окно меняется
          setPaymentProcessingMessage(t('paymentProcessing.redirecting'))
          setPaymentProcessingStatus('processing')

          // Сохраняем ссылку на окно и orderId для отслеживания
          setPaymentWindowRef(paymentWindow)
          if (result.orderId) {
            setPaymentOrderId(result.orderId)
            // Модальное окно обработки остается открытым для отслеживания статуса платежа
            // Оно будет менять сообщения через useEffect выше
          }

          logger.info('Dashboard', 'Окно оплаты открыто, начинаем отслеживание', {
            orderId: result.orderId,
            paymentUrl: result.paymentUrl
          })
        } else {
          logger.warn('Dashboard', 'Не удалось открыть окно оплаты (возможно, заблокировано браузером)', {
            paymentUrl: result.paymentUrl
          })
          // Если окно заблокировано, закрываем модальное окно обработки
          setShowPaymentProcessing(false)
        }
        return
      }

      // Закрываем модальное окно обработки платежа если нет ссылки на оплату
      if (paymentProcessingMessageTimerRef.current) {
        clearTimeout(paymentProcessingMessageTimerRef.current)
        paymentProcessingMessageTimerRef.current = null
      }
      setShowPaymentProcessing(false)

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
          subscriptionLinks: result.subscriptionLinks || null,
          subscriptionLinksWithPlan: result.subscriptionLinksWithPlan || null,
          tariffId: result.tariffId || subscriptionData.tariff?.id || null,
          tariffName: result.tariffName || subscriptionData.tariff?.name || null,
          devices: result.devices || subscriptionData.devices || 1,
          periodMonths: result.periodMonths || subscriptionData.periodMonths || 1,
          expiresAt: result.expiresAt || null,
          paymentStatus: result.paymentStatus ?? (subscriptionData.testPeriod ? 'test_period' : 'pending'),
          testPeriod: result.testPeriod !== undefined ? result.testPeriod : (subscriptionData.testPeriod || false),
          discount: result.discount || subscriptionData.discount || 0
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

      // Отправляем уведомление об ошибке оплаты
      try {
        const notificationInstance = notificationService.getInstance()
        if (notificationInstance.hasPermission()) {
          const errorMessage = error.message || 'Неизвестная ошибка'
          await notificationInstance.notifyPaymentFailed(errorMessage)
          logger.info('Dashboard', 'Уведомление об ошибке оплаты отправлено')
        }
      } catch (notificationError) {
        logger.warn('Dashboard', 'Ошибка отправки уведомления об ошибке оплаты', null, notificationError)
      }

      // Закрываем модальное окно обработки платежа при ошибке
      if (paymentProcessingMessageTimerRef.current) {
        clearTimeout(paymentProcessingMessageTimerRef.current)
        paymentProcessingMessageTimerRef.current = null
      }
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

  const handleChangePlan = async (targetTariff) => {
    const tariff = targetTariff ?? otherTariffForSwitch
    if (!currentUser?.id || !tariff) return
    setChangePlanError(null)
    setChangePlanSuccess(null)
    try {
      setChangingPlan(true)
      const result = await dashboardService.changePlanTariff(currentUser, tariff)
      await onRefreshUserAfterPayment?.().catch((err) => console.warn('Dashboard:', err?.message))
      setChangePlanSuccess(result.message || t('dashboard.changePlanSuccess'))
      setTimeout(() => setChangePlanSuccess(null), 6000)
    } catch (err) {
      setChangePlanError(err?.message || t('dashboard.changePlanError'))
    } finally {
      setChangingPlan(false)
    }
  }

  // Обработчик ручной проверки статуса оплаты
  const handleManualPaymentCheck = async (orderId) => {
    if (!orderId) {
      logger.error('Dashboard', 'orderId не указан для ручной проверки платежа')
      throw new Error('ID заказа не указан')
    }

    try {
      logger.info('Dashboard', 'Ручная проверка статуса оплаты', { orderId })
      // В dev — дольше не перезагружаем, чтобы успеть скопировать логи
      const reloadDelayMs = (typeof import.meta !== 'undefined' && import.meta.env?.DEV) ? 8000 : 2000

      const { dashboardService } = await import('../services/dashboardService.js')

      // Проверка статуса через Platega API (GET /api/payment/status)
      const statusResult = await dashboardService.fetchPaymentStatus(orderId)

      logger.info('Dashboard', 'Результат проверки статуса (Platega, ручная проверка)', {
        orderId,
        success: statusResult?.success,
        status: statusResult?.status,
        hasPayment: !!statusResult?.payment
      })

      let payment = null
      if (statusResult.success && statusResult.status === 'completed' && statusResult.payment) {
        payment = statusResult.payment
      } else if (statusResult.success && ['cancelled', 'failed', 'chargebacked'].includes(statusResult.status)) {
        throw new Error('Платёж не прошёл')
      } else {
        throw new Error('Платёж ещё не найден или не оплачен. Попробуйте позже.')
      }

      // Дополняем payment из subscriptionSuccess при необходимости (tariffId, devices, periodMonths)
      const subscriptionData = subscriptionSuccess || {}
      if (payment && !payment.tariffId && (subscriptionData.tariffId || subscriptionData.tariffName)) {
        const tariffId = subscriptionData.tariffId
          || (subscriptionData.tariffName ? tariffsList.find(t => t.name === subscriptionData.tariffName)?.id : null)
          || currentUser?.tariffId
        const tariff = tariffId ? tariffsList.find(t => t.id === tariffId) : (tariffsList.length > 0 ? tariffsList[0] : null)
        if (tariff) {
          payment.tariffId = tariff.id
          payment.tariffName = tariff.name
          payment.devices = subscriptionData.devices ?? currentUser?.devices ?? payment.devices ?? 1
          payment.periodMonths = subscriptionData.periodMonths ?? currentUser?.periodMonths ?? payment.periodMonths ?? 1
        }
      }

      // Проверяем статус платежа (из Platega API). Статус нормализован: 'completed', 'paid', 'failed', 'cancelled', 'pending'
      const paymentStatus = payment?.status
      const isPaid = paymentStatus === 'completed' || paymentStatus === 'paid'

      if (payment && isPaid) {
        // Восстанавливаем tariffId только из subscriptionSuccess (тариф, выбранный при открытии оплаты), не из currentUser
        if (!payment.tariffId && subscriptionSuccess) {
          const subscriptionData = subscriptionSuccess
          const tariffId = subscriptionData.tariffId ||
            (subscriptionData.tariffName ? tariffsList.find(t => (t.name || '').toLowerCase() === (subscriptionData.tariffName || '').toLowerCase())?.id : null)
          if (tariffId) {
            payment.tariffId = tariffId
            payment.tariffName = subscriptionData.tariffName || tariffsList.find(t => t.id === tariffId)?.name
            payment.devices = subscriptionData.devices ?? payment.devices ?? 1
            payment.periodMonths = subscriptionData.periodMonths ?? payment.periodMonths ?? 1
            payment.discount = subscriptionData.discount ?? payment.discount ?? 0
            logger.info('Dashboard', 'tariffId восстановлен из subscriptionSuccess', { orderId, tariffId: payment.tariffId, tariffName: payment.tariffName })
          }
        }

        logger.info('Dashboard', 'Платеж подтвержден (Platega, ручная проверка), создаем подписку', {
          orderId,
          amount: payment.amount,
          tariffId: payment.tariffId,
          tariffName: payment.tariffName,
          status: payment.status
        })

        try {
          // Тариф только из платежа или subscriptionSuccess (оплаченный тариф). Не подставлять другой тариф.
          let tariff = payment.tariffId ? tariffsList.find(t => t.id === payment.tariffId) : null
          if (!tariff && (payment.tariffName || subscriptionSuccess?.tariffName)) {
            const name = (payment.tariffName || subscriptionSuccess?.tariffName || '').trim()
            tariff = name ? tariffsList.find(t => (t.name || '').toLowerCase() === name.toLowerCase()) : null
            if (tariff) {
              payment.tariffId = tariff.id
              payment.tariffName = tariff.name
              logger.info('Dashboard', 'Тариф найден по имени из платежа/subscriptionSuccess', { tariffId: tariff.id, tariffName: tariff.name })
            }
          }
          if (!tariff && subscriptionSuccess?.tariffId) {
            tariff = tariffsList.find(t => t.id === subscriptionSuccess.tariffId)
            if (tariff) {
              payment.tariffId = tariff.id
              payment.tariffName = tariff.name
            }
          }
          if (!tariff) {
            logger.error('Dashboard', 'Тариф не найден для завершенного платежа', {
              tariffId: payment.tariffId,
              orderId,
              availableTariffs: tariffsList.map(t => ({ id: t.id, name: t.name }))
            })
            throw new Error('Тариф не найден')
          }

          if (subscriptionSuccess?.operationType === 'add_devices' && subscriptionSuccess?.newDevicesCount != null && currentUser) {
            if (subscriptionCreatedForOrderIdsRef.current.has(orderId)) return
            subscriptionCreatedForOrderIdsRef.current.add(orderId)
            try {
              await dashboardService.applyAddDevicesAfterPayment(currentUser, subscriptionSuccess.newDevicesCount)
              await dashboardService.updatePaymentStatus(orderId, 'completed').catch((err) => console.warn('Dashboard:', err?.message))
              await onRefreshUserAfterPayment?.().catch((err) => console.warn('Dashboard:', err?.message))
              setShowSuccessModal(false)
              setSubscriptionSuccess(null)
              setTimeout(() => { window.location.reload() }, 1000)
            } catch (addDevErr) {
              subscriptionCreatedForOrderIdsRef.current.delete(orderId)
              throw addDevErr
            }
            return
          }

          if (subscriptionCreatedForOrderIdsRef.current.has(orderId)) {
            logger.info('Dashboard', 'Пропуск дубликата: подписка уже создана/создаётся для этого заказа (ручная проверка)', { orderId })
            return
          }
          subscriptionCreatedForOrderIdsRef.current.add(orderId)
          const isFirstPaymentManual = !currentUser?.uuid || !currentUser?.tariffId
          await onHandleCreateSubscription(
            tariff,
            payment.devices || 1,
            null, // natrockPort
            payment.periodMonths || 1,
            false, // testPeriod
            'paid', // paymentMode: оплата уже проверена, создаём подписку без нового платежа
            payment.discount || 0
          )
          logger.info('Dashboard', 'Подписка создана после ручной проверки оплаты')
          await dashboardService.updatePaymentStatus(orderId, 'completed').catch((err) => console.warn('Dashboard:', err?.message))
          const cleanPath = (window.location.pathname || '/dashboard').split('?')[0] || '/dashboard'
          const cleanUrl = window.location.origin + cleanPath
          if (typeof window.history?.replaceState === 'function') {
            window.history.replaceState({}, '', cleanUrl)
          }
          await onRefreshUserAfterPayment?.().catch((err) => console.warn('Dashboard:', err?.message))
          if (isFirstPaymentManual && typeof onSetShowKeyModal === 'function') {
            setShowSuccessModal(false)
            setSubscriptionSuccess(null)
            onSetShowKeyModal(true)
          } else {
            if (reloadDelayMs > 2000) {
              logger.info('Dashboard', 'Перезагрузка через 8 сек. В DevTools → Console → включите «Preserve log», чтобы логи не пропадали.')
            }
            setTimeout(() => { window.location.replace(cleanUrl) }, reloadDelayMs)
          }
        } catch (err) {
          subscriptionCreatedForOrderIdsRef.current.delete(orderId)
          logger.error('Dashboard', 'Ошибка создания подписки после ручной проверки оплаты', {
            orderId
          }, err)
          throw err
        }
      } else if (payment && (payment.status === 'failed' || payment.status === 'cancelled' || payment.status === 'rejected')) {
        logger.warn('Dashboard', 'Платеж не прошел (ручная проверка)', {
          orderId,
          status: payment.status
        })
        throw new Error(`Платеж не прошел. Статус: ${payment.status}`)
      } else {
        // Если payment есть, но статус не "completed" или "paid", логируем детали
        if (payment) {
          logger.warn('Dashboard', 'Платеж найден, но статус не оплачено (ручная проверка)', {
            orderId,
            status: payment.status,
            originalStatus: payment.originalStatus,
            payment: payment
          })
          throw new Error(`Платеж найден, но статус: ${payment.status || payment.originalStatus || 'неизвестен'}`)
        } else {
          logger.warn('Dashboard', 'Платеж не найден или статус не оплачено в ответе API (ручная проверка)', {
            orderId,
            hasPayment: !!payment,
            paymentStatus: payment?.status
          })
          throw new Error('Платеж еще не завершен. Попробуйте позже.')
        }
      }
    } catch (error) {
      logger.error('Dashboard', 'Ошибка при ручной проверке статуса оплаты', { orderId }, error)
      throw error
    }
  }

  handleManualPaymentCheckRef.current = handleManualPaymentCheck

  // Повторная проверка статуса оплаты из истории платежей
  const handleRecheckPaymentStatusFromHistory = async (orderId) => {
    if (!orderId || !loadPayments) return
    setRecheckingOrderId(orderId)
    try {
      await handleManualPaymentCheck(orderId)
      loadPayments()
    } catch (err) {
      logger.error('Dashboard', 'Ошибка повторной проверки статуса из истории', { orderId }, err)
      const msg = err?.message || t('paymentProcessing.checkStatusError', 'Ошибка при проверке статуса.')
      alert(msg)
    } finally {
      setRecheckingOrderId(null)
    }
  }

  // Автопроверка платежа: через 3 с после показа модалки «требуется оплата» — 20 запросов раз в 4 с до статуса «Оплачено»
  // В тестовом режиме и при paymentUrl без requiresPayment тоже запускаем (orderId обязателен)
  useEffect(() => {
    const hasOrderId = !!subscriptionSuccess?.orderId
    const needsPayment = subscriptionSuccess?.requiresPayment === true || (!!subscriptionSuccess?.paymentUrl && hasOrderId)
    const need = showSuccessModal && hasOrderId && needsPayment
    if (!need) {
      setAwaitingPaymentResult(false)
      setPaymentPollAttempt(0)
      if (paymentAutoPollTimeoutRef.current) {
        clearTimeout(paymentAutoPollTimeoutRef.current)
        paymentAutoPollTimeoutRef.current = null
      }
      if (paymentAutoPollIntervalRef.current) {
        clearInterval(paymentAutoPollIntervalRef.current)
        paymentAutoPollIntervalRef.current = null
      }
      return
    }

    const orderId = subscriptionSuccess.orderId
    const INIT_DELAY_MS = 3000
    const POLL_INTERVAL_MS = 4000
    const MAX_ATTEMPTS = 20

    paymentAutoPollTimeoutRef.current = setTimeout(() => {
      setAwaitingPaymentResult(true)
      let attempt = 0

      const runCheck = async () => {
        attempt += 1
        setPaymentPollAttempt(attempt)
        try {
          const { dashboardService } = await import('../services/dashboardService.js')
          const res = await dashboardService.fetchPaymentStatus(orderId)
          if (!res?.success) return
          const isPaid = res.status === 'completed'
          if (isPaid) {
            if (paymentAutoPollIntervalRef.current) {
              clearInterval(paymentAutoPollIntervalRef.current)
              paymentAutoPollIntervalRef.current = null
            }
            setAwaitingPaymentResult(false)
            logger.info('Dashboard', 'Автопроверка: платёж оплачен, создаём подписку и закрываем окно', { orderId, attempt })
            const fn = handleManualPaymentCheckRef.current
            if (typeof fn === 'function') await Promise.resolve(fn(orderId)).catch((err) => console.warn('Dashboard:', err?.message))
            return
          }
        } catch (_) { }
        if (attempt >= MAX_ATTEMPTS) {
          if (paymentAutoPollIntervalRef.current) {
            clearInterval(paymentAutoPollIntervalRef.current)
            paymentAutoPollIntervalRef.current = null
          }
          setAwaitingPaymentResult(false)
          logger.info('Dashboard', 'Автопроверка: достигнут лимит попыток', { orderId, attempt: MAX_ATTEMPTS })
        }
      }

      runCheck()
      paymentAutoPollIntervalRef.current = setInterval(runCheck, POLL_INTERVAL_MS)
    }, INIT_DELAY_MS)

    return () => {
      if (paymentAutoPollTimeoutRef.current) {
        clearTimeout(paymentAutoPollTimeoutRef.current)
        paymentAutoPollTimeoutRef.current = null
      }
      if (paymentAutoPollIntervalRef.current) {
        clearInterval(paymentAutoPollIntervalRef.current)
        paymentAutoPollIntervalRef.current = null
      }
    }
  }, [showSuccessModal, subscriptionSuccess?.orderId, subscriptionSuccess?.requiresPayment, subscriptionSuccess?.paymentUrl])

  // Восстановление сценария после редиректа с оплаты: при загрузке с ?orderId=... или ?label=... запускаем проверку с повторами
  useEffect(() => {
    if (!currentUser?.uid || urlOrderIdProcessedRef.current) return
    const params = new URLSearchParams(window.location.search)
    let orderIdFromUrl = params.get('orderId') || params.get('orderid') || params.get('label')
    if (!orderIdFromUrl) return

    // Игнорировать тестовые/плэйсхолдерные значения (напр. из конфига YooMoney/n8n)
    const isTestOrderId = /^test_order_/i.test(String(orderIdFromUrl).trim()) || String(orderIdFromUrl).trim() === 'test_order_123'
    if (isTestOrderId) {
      logger.info('Dashboard', 'Игнорируем тестовый orderId в URL, не запускаем проверку', { orderIdFromUrl })
      if (typeof window.history?.replaceState === 'function') {
        const u = new URL(window.location.href)
        u.searchParams.delete('orderId')
        u.searchParams.delete('orderid')
        u.searchParams.delete('label')
        u.searchParams.delete('payment')
        window.history.replaceState({}, '', u.toString())
      }
      urlOrderIdProcessedRef.current = true
      return
    }

    urlOrderIdProcessedRef.current = true
    if (typeof window.history?.replaceState === 'function') {
      const u = new URL(window.location.href)
      u.searchParams.delete('orderId')
      u.searchParams.delete('orderid')
      u.searchParams.delete('label')
      u.searchParams.delete('payment')
      window.history.replaceState({}, '', u.toString())
    }

    const maxAttempts = 4
    const delayMs = 4000
    let attempt = 0

    const runCheck = () => {
      attempt += 1
      logger.info('Dashboard', 'Обнаружен orderId в URL после редиректа с оплаты, запуск проверки', {
        orderId: orderIdFromUrl,
        attempt,
        maxAttempts
      })
      handleManualPaymentCheck(orderIdFromUrl)
        .then(() => { })
        .catch((err) => {
          if (attempt < maxAttempts) {
            logger.info('Dashboard', 'Повтор проверки платежа через ' + delayMs / 1000 + ' с', {
              orderId: orderIdFromUrl,
              nextAttempt: attempt + 1
            })
            setTimeout(runCheck, delayMs)
          } else {
            logger.warn('Dashboard', 'Проверка платежа по orderId из URL не удалась после ' + maxAttempts + ' попыток', {
              orderId: orderIdFromUrl
            }, err)
          }
        })
    }
    runCheck()
  }, [currentUser?.uid])

  return (
    <div className="min-h-screen min-h-[100dvh] flex-1 flex flex-col lg:flex-row lg:min-h-0 lg:h-screen lg:overflow-hidden overflow-x-hidden bg-slate-950">
      {!isTelegramMini && (
        <Sidebar
          currentUser={currentUser}
          view={view}
          onSetView={onSetView}
          onLogout={onLogout}
          dashboardTab={dashboardTab}
          onSetDashboardTab={onSetDashboardTab}
        />
      )}
      {isTelegramMini && (
        <>
          <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-slate-900/95 border-b border-slate-800 backdrop-blur safe-area-inset-top">
            <h1 className="text-lg font-semibold text-white truncate">{t('sidebar.cabinet')}</h1>
            <button
              type="button"
              onClick={onLogout}
              className="shrink-0 px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            >
              {t('auth.logout') || 'Выход'}
            </button>
          </header>
          <div className="fixed top-[52px] left-0 right-0 z-30 flex gap-1 px-2 py-2 bg-slate-900/90 border-b border-slate-800">
            {[
              { id: 'subscription', labelKey: 'sidebar.subscription', icon: CreditCard },
              { id: 'profile', labelKey: 'sidebar.profile', icon: User },
              { id: 'payments', labelKey: 'sidebar.payments', icon: History },
            ].map(({ id, labelKey, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onSetDashboardTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium transition-colors ${dashboardTab === id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{t(labelKey)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className={`flex-1 w-full min-w-0 min-h-0 p-3 sm:p-4 md:p-6 lg:p-8 pb-20 sm:pb-24 lg:pb-8 overflow-y-auto overflow-x-hidden ${isTelegramMini ? 'pt-28' : 'pt-14 sm:pt-16 lg:pt-6 lg:pt-8'}`}>
        <div className="mb-4 sm:mb-5 md:mb-6">
          <h1 className="text-[clamp(1.25rem,1.1rem+0.75vw,1.875rem)] font-bold text-white mb-1.5 sm:mb-2">{t('sidebar.cabinet')}</h1>
          <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400">{t('dashboard.subtitle')}</p>
        </div>

        {/* Общая статистика - Mobile First */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-5 md:mb-6">
          <div className="bg-slate-900 rounded-lg sm:rounded-xl p-4 sm:p-5 border border-slate-800">
            <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400 mb-1.5 sm:mb-2">{t('dashboard.status')}</p>
            <div className={`inline-flex items-center gap-2 ${userStatus.color} font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]`}>
              {userStatus.status === 'active' && <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />}
              {userStatus.status === 'expired' && <XCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />}
              {userStatus.status === 'no-key' && <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />}
              <span>{userStatus.label}</span>
            </div>
          </div>
          <div className="bg-slate-900 rounded-lg sm:rounded-xl p-4 sm:p-5 border border-slate-800">
            <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400 mb-1.5 sm:mb-2">{t('dashboard.tariff')}</p>
            <p className="text-white font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">{currentUser.tariffName || t('dashboard.notSelected')}</p>
          </div>
          <div className="bg-slate-900 rounded-lg sm:rounded-xl p-4 sm:p-5 border border-slate-800">
            <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400 mb-1.5 sm:mb-2">{t('dashboard.key')}</p>
            <p className="text-white font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">
              {currentUser.uuid ? t('dashboard.active') : t('dashboard.notReceived')}
            </p>
          </div>
        </div>

        {/* Контент разделов (навигация — в боковом меню / нижней панели на мобильных) */}
        <div key={dashboardTab} className="dashboard-tab-enter">
          {dashboardTab === 'subscription' && (
            <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 p-4 sm:p-5 md:p-6">
              {hasSubscription ? (
                <div>
                  <div className="mb-3 sm:mb-4">
                    <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-white">{t('dashboard.currentSubscription')}</h2>
                  </div>
                  <div className="space-y-3">
                    {/* Основная карточка подписки - компактный дизайн */}
                    <SubscriptionInfoCard
                      currentUser={currentUser}
                      currentTariff={currentTariff}
                      userStatus={userStatus}
                      timeRemaining={timeRemaining}
                      hasSubscription={hasSubscription}
                      creatingSubscription={creatingSubscription}
                      showPaymentProcessing={showPaymentProcessing}
                      onHandleAddDevices={onHandleAddDevices}
                      onHandleRenewSubscription={onHandleRenewSubscription}
                      setShowAddDevicesModal={setShowAddDevicesModal}
                      setAdditionalDevices={setAdditionalDevices}
                      setPaymentProcessingMessage={setPaymentProcessingMessage}
                      setShowPaymentProcessing={setShowPaymentProcessing}
                      setSubscriptionSuccess={setSubscriptionSuccess}
                      setShowSuccessModal={setShowSuccessModal}
                      setPaymentWindowRef={setPaymentWindowRef}
                      setPaymentOrderId={setPaymentOrderId}
                      paymentProcessingMessageTimerRef={paymentProcessingMessageTimerRef}
                    />
                    {/* Компактный блок управления подключением */}
                    <VPNKeyControl
                      currentUser={currentUser}
                      onSetShowKeyModal={onSetShowKeyModal}
                      onGetKey={onGetKey}
                    />
                    {/* Компактная кнопка продления для expired статуса */}
                    {userStatus.status === 'expired' && (
                      <div className="mt-3">
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
                                setSubscriptionSuccess({ vpnLink: null, paymentUrl: result.paymentUrl, orderId: result.orderId, amount: result.amount, requiresPayment: true, message: 'Окно оплаты открыто. Завершите оплату для активации подписки.', tariffName: currentUser.tariffName || 'Не указан', devices: currentUser.devices || 1, periodMonths: currentUser.periodMonths || 1 })
                                setShowSuccessModal(true)
                              }
                            } catch (error) {
                              if (paymentProcessingMessageTimerRef.current) { clearTimeout(paymentProcessingMessageTimerRef.current); paymentProcessingMessageTimerRef.current = null }
                              setShowPaymentProcessing(false)
                            }
                          }}
                          disabled={creatingSubscription || showPaymentProcessing}
                          className="w-full min-h-[40px] px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center gap-2 touch-manipulation"
                          aria-label={t('dashboard.renewAria')}
                        >
                          <Calendar className="w-4 h-4 flex-shrink-0" />
                          <span>{creatingSubscription || showPaymentProcessing ? 'Продление...' : 'Продлить подписку'}</span>
                        </button>
                      </div>
                    )}

                    {/* Смена тарифа на другой (все активные тарифы) */}
                    {currentUser?.uuid && otherTariffsForSwitch.length > 0 && (
                      <div className="mt-3 flex flex-col gap-2">
                        {changePlanSuccess && (
                          <p className="text-green-400 text-sm px-2 py-1 rounded bg-green-900/20" role="status">
                            {changePlanSuccess}
                          </p>
                        )}
                        {changePlanError && (
                          <p className="text-red-400 text-sm px-2 py-1 rounded bg-red-900/20" role="alert">
                            {changePlanError}
                          </p>
                        )}
                        <div className="flex flex-col gap-1.5">
                          {otherTariffsForSwitch.map((tariff) => (
                            <button
                              key={tariff.id}
                              type="button"
                              onClick={() => handleChangePlan(tariff)}
                              disabled={changingPlan || creatingSubscription || showPaymentProcessing}
                              className="w-full min-h-[40px] px-4 py-2 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-800 disabled:cursor-not-allowed text-slate-200 rounded-lg font-medium text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center gap-2 touch-manipulation border border-slate-600"
                              aria-label={t('dashboard.changePlanAria', { name: tariff.name })}
                            >
                              {changingPlan ? (
                                <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
                              ) : (
                                <ArrowLeftRight className="w-4 h-4 flex-shrink-0" />
                              )}
                              <span>{changingPlan ? t('dashboard.changingPlan') : t('dashboard.changePlanTo', { name: tariff.name })}</span>
                            </button>
                          ))}
                        </div>
                        {currentUser?.nextPaymentDiscountAmount > 0 && (
                          <p className="text-slate-400 text-xs px-2">
                            {t('dashboard.nextPaymentDiscountHint', { amount: currentUser.nextPaymentDiscountAmount })}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Кнопка отмены подписки — внизу, приглушённая и компактная */}
                    {currentUser?.uuid && onHandleDeleteSubscription && (
                      <div className="mt-4 pt-3 border-t border-slate-700/50 flex justify-center">
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          disabled={deletingSubscription || creatingSubscription}
                          className="text-xs text-slate-500 hover:text-red-400/90 border border-slate-600/70 hover:border-red-900/60 rounded px-2.5 py-1.5 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                          aria-label={t('dashboard.cancelSubscription')}
                        >
                          <Trash2 className="w-3 h-3 flex-shrink-0" />
                          <span>{deletingSubscription ? t('dashboard.deleting') : t('dashboard.cancelSubscription')}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <TariffsContainer
                  tariffs={tariffs}
                  settings={settings}
                  creatingSubscription={creatingSubscription}
                  handleTariffSelect={handleTariffSelect}
                />
              )
              }

              {/* Реферальная программа */}
              <div className="mt-6 pt-6 border-t border-slate-700/50">
                <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] font-bold text-white mb-3 flex items-center gap-2">
                  <Gift className="w-5 h-5 text-blue-400" />
                  {t('dashboard.inviteFriend')}
                </h3>
                <p className="text-slate-400 text-[clamp(0.8rem,0.75rem+0.25vw,0.875rem)] mb-4">
                  {t('dashboard.referralDescription')}
                </p>
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 flex rounded-lg overflow-hidden border border-slate-700 bg-slate-800/50">
                      <span className="px-3 py-2.5 text-slate-500 text-sm font-mono shrink-0 flex items-center gap-1.5">
                        <Link2 className="w-4 h-4" /> {t('dashboard.linkLabel')}
                      </span>
                      <input
                        type="text"
                        readOnly
                        value={currentUser.referralCode ? `${typeof window !== 'undefined' ? window.location.origin + (window.location.pathname || '') : ''}?ref=${currentUser.referralCode}` : '…'}
                        className="flex-1 min-h-[44px] px-3 py-2.5 bg-transparent text-slate-200 text-sm font-mono border-0 outline-none"
                        aria-label={t('dashboard.referralLinkAria')}
                      />
                      <button
                        type="button"
                        onClick={() => currentUser.referralCode && onCopy(`${typeof window !== 'undefined' ? window.location.origin + (window.location.pathname || '') : ''}?ref=${currentUser.referralCode}`)}
                        disabled={!currentUser.referralCode}
                        className="shrink-0 min-h-[44px] min-w-[44px] px-3 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center justify-center touch-manipulation"
                        aria-label={t('dashboard.copyLinkAria')}
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-500 text-sm">{t('dashboard.code')}</span>
                    <div className="inline-flex rounded-lg overflow-hidden border border-slate-700 bg-slate-800/50">
                      <code className="px-3 py-2 text-slate-200 font-mono text-sm font-bold">
                        {currentUser.referralCode || '…'}
                      </code>
                      <button
                        type="button"
                        onClick={() => currentUser.referralCode && onCopy(currentUser.referralCode)}
                        disabled={!currentUser.referralCode}
                        className="min-h-[40px] min-w-[40px] px-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center justify-center touch-manipulation"
                        aria-label={t('dashboard.copyCodeAria')}
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300 text-sm">
                    <Gift className="w-4 h-4 text-green-400 shrink-0" />
                    <span><Trans i18nKey="dashboard.referralBalance" values={{ count: Number(currentUser.referralBonusBalance) || 0 }} components={{ strong: <strong className="text-white" /> }} /></span>
                  </div>
                </div>
              </div>

            </div >
          )}

          {
            dashboardTab === 'profile' && (
              <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 p-4 sm:p-5 md:p-6">
                <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200 mb-4 sm:mb-5 md:mb-6">{t('dashboard.profileSettings')}</h2>
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
                    <label htmlFor="profile-subid" className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-bold mb-1.5 sm:mb-2">SubId (ID подписки)</label>
                    {currentUser.subId ? (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          key="profile-subid-input-disabled"
                          id="profile-subid"
                          name="profile-subid"
                          type="text"
                          value={currentUser.subId}
                          disabled
                          readOnly
                          className="flex-1 min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-400 text-base cursor-text font-mono text-sm sm:text-base"
                        />
                        <button
                          onClick={() => onCopy(currentUser.subId)}
                          className="min-h-[44px] min-w-[44px] px-4 py-2.5 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg sm:rounded-xl transition-all flex items-center justify-center touch-manipulation"
                          title="Копировать SubId"
                          aria-label="Копировать SubId"
                        >
                          <Copy className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      </div>
                    ) : (
                      <div className="min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-500 text-base flex items-center">
                        <span>{t('dashboard.notGenerated')}</span>
                      </div>
                    )}
                    <p className="text-slate-500 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] mt-1.5">{t('dashboard.subIdHint')}</p>
                  </div>

                  <div>
                    <label htmlFor={editingProfile ? "profile-name" : undefined} className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-bold mb-1.5 sm:mb-2">{t('dashboard.name')}</label>
                    {editingProfile ? (
                      <input
                        key="profile-name-input"
                        id="profile-name"
                        name="profile-name"
                        type="text"
                        value={profileData.name || ''}
                        onChange={onProfileNameChange}
                        placeholder={t('dashboard.namePlaceholder')}
                        className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                        autoFocus={false}
                      />
                    ) : (
                      <div className="min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base flex items-center">
                        {currentUser.name || <span className="text-slate-500">{t('dashboard.notSet')}</span>}
                      </div>
                    )}
                  </div>

                  <div>
                    <label htmlFor={editingProfile ? "profile-phone" : undefined} className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-bold mb-1.5 sm:mb-2">{t('dashboard.phone')}</label>
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
                        {currentUser.phone || <span className="text-slate-500">{t('dashboard.notSet')}</span>}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 sm:space-y-5">
                    <TelegramBindCard
                      currentUser={currentUser}
                      onBoundChange={onRefreshUserAfterPayment}
                      onCopy={onCopy}
                    />
                  </div>

                  {hasGoogleProvider && typeof onSetPasswordForEmail === 'function' && (
                    <SetPasswordForEmailCard
                      onSetPassword={onSetPasswordForEmail}
                      t={t}
                    />
                  )}

                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                    {editingProfile ? (
                      <>
                        <button
                          onClick={onHandleUpdateProfile}
                          className="min-h-[44px] w-full sm:w-auto px-5 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg sm:rounded-xl font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center touch-manipulation"
                          aria-label={t('dashboard.saveProfileAria')}
                        >
                          {t('common.save')}
                        </button>
                        <button
                          onClick={() => onSetEditingProfile(false)}
                          className="min-h-[44px] w-full sm:w-auto px-5 sm:px-6 py-2.5 sm:py-3 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg sm:rounded-xl font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center touch-manipulation"
                          aria-label={t('dashboard.cancelEditAria')}
                        >
                          {t('common.cancel')}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => onSetEditingProfile(true)}
                        className="min-h-[44px] w-full sm:w-auto px-5 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg sm:rounded-xl font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center touch-manipulation"
                        aria-label={t('dashboard.editProfileAria')}
                      >
                        {t('dashboard.editProfile')}
                      </button>
                    )}
                  </div>

                  <div className="border-t border-slate-800 pt-4 sm:pt-5 md:pt-6">
                    <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg font-semibold text-red-400 mb-3 sm:mb-4">{t('dashboard.dangerZone')}</h3>
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
            )
          }

          {
            dashboardTab === 'payments' && (
              <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 p-4 sm:p-5 md:p-6">
                <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200 mb-4 sm:mb-5 md:mb-6">{t('dashboard.paymentHistory')}</h2>
                {paymentsLoading ? (
                  <div className="flex items-center justify-center py-8 sm:py-10 md:py-12">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 border-2 border-slate-600 border-t-blue-600 rounded-full animate-spin"></div>
                  </div>
                ) : payments.length === 0 ? (
                  <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400 text-center py-8 sm:py-10 md:py-12">{t('dashboard.noPayments')}</p>
                ) : (
                  <>
                    {/* Mobile Card Layout */}
                    <div className="md:hidden space-y-3">
                      {payments.map((payment) => (
                        <div key={payment.id} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                          <div className="space-y-2">
                            <div>
                              <span className="text-xs font-medium text-slate-400 uppercase">{t('dashboard.date')}</span>
                              <p className="text-slate-200 mt-0.5 text-sm">{formatDate(payment.createdAt)}</p>
                            </div>
                            <div>
                              <span className="text-xs font-medium text-slate-400 uppercase">{t('dashboard.tariffTableHeader')}</span>
                              <p className="text-slate-200 mt-0.5 text-sm">{payment.tariffName || 'Не указан'}</p>
                            </div>
                            <div>
                              <span className="text-xs font-medium text-slate-400 uppercase">{t('dashboard.amount')}</span>
                              <p className="text-slate-200 font-semibold mt-0.5 text-sm">{payment.amount} ₽</p>
                            </div>
                            <div>
                              <span className="text-xs font-medium text-slate-400 uppercase">{t('dashboard.statusTableHeader')}</span>
                              <div className="mt-0.5">
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${payment.status === 'completed'
                                  ? 'bg-green-900/30 text-green-400'
                                  : 'bg-slate-700 text-slate-400'
                                  }`}>
                                  {payment.status === 'completed' ? 'Успех' : payment.status}
                                </span>
                              </div>
                            </div>
                            {payment.orderId && (
                              <div className="pt-2">
                                <button
                                  type="button"
                                  onClick={() => handleRecheckPaymentStatusFromHistory(payment.orderId)}
                                  disabled={recheckingOrderId === payment.orderId}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 text-slate-200 hover:bg-slate-600 disabled:opacity-50 disabled:pointer-events-none"
                                  title={t('dashboard.recheckPaymentStatus', 'Проверить статус оплаты')}
                                >
                                  {recheckingOrderId === payment.orderId ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                                  ) : (
                                    <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                                  )}
                                  {t('dashboard.recheckPaymentStatus', 'Проверить статус')}
                                </button>
                              </div>
                            )}
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
                              <th className="text-left py-3 px-2 sm:px-4 text-slate-400 font-semibold text-xs sm:text-sm">{t('dashboard.date')}</th>
                              <th className="text-left py-3 px-2 sm:px-4 text-slate-400 font-semibold text-xs sm:text-sm">{t('dashboard.tariffTableHeader')}</th>
                              <th className="text-left py-3 px-2 sm:px-4 text-slate-400 font-semibold text-xs sm:text-sm">{t('dashboard.amount')}</th>
                              <th className="text-left py-3 px-2 sm:px-4 text-slate-400 font-semibold text-xs sm:text-sm">{t('dashboard.statusTableHeader')}</th>
                              <th className="text-left py-3 px-2 sm:px-4 text-slate-400 font-semibold text-xs sm:text-sm">{t('dashboard.actionsTableHeader', 'Действия')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {payments.map((payment) => (
                              <tr key={payment.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                                <td className="py-3 px-2 sm:px-4 text-slate-300 text-xs sm:text-sm">{formatDate(payment.createdAt)}</td>
                                <td className="py-3 px-2 sm:px-4 text-slate-300 text-xs sm:text-sm">{payment.tariffName || 'Не указан'}</td>
                                <td className="py-3 px-2 sm:px-4 text-slate-300 font-semibold text-xs sm:text-sm">{payment.amount} ₽</td>
                                <td className="py-3 px-2 sm:px-4">
                                  <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-semibold ${payment.status === 'completed'
                                    ? 'bg-green-900/30 text-green-400'
                                    : 'bg-slate-800 text-slate-400'
                                    }`}>
                                    {payment.status === 'completed' ? 'Успех' : payment.status}
                                  </span>
                                </td>
                                <td className="py-3 px-2 sm:px-4">
                                  {payment.orderId ? (
                                    <button
                                      type="button"
                                      onClick={() => handleRecheckPaymentStatusFromHistory(payment.orderId)}
                                      disabled={recheckingOrderId === payment.orderId}
                                      className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 text-slate-200 hover:bg-slate-600 disabled:opacity-50 disabled:pointer-events-none"
                                      title={t('dashboard.recheckPaymentStatus', 'Проверить статус оплаты')}
                                    >
                                      {recheckingOrderId === payment.orderId ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                                      ) : (
                                        <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                                      )}
                                      <span className="hidden sm:inline">{t('dashboard.recheckPaymentStatus', 'Проверить статус')}</span>
                                    </button>
                                  ) : (
                                    <span className="text-slate-500 text-xs">—</span>
                                  )}
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
            )
          }
        </div >

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
        {
          showTariffModal && selectedTariff && (
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
              servers={servers}
              userId={currentUser?.id}
            />
          )
        }

        {/* Модальное окно обработки платежа */}
        {
          showPaymentProcessing && (
            <PaymentProcessingModal
              message={paymentProcessingMessage}
              status={paymentProcessingStatus}
              onClose={() => {
                // Закрываем модальное окно только если статус ошибки
                if (paymentProcessingStatus === 'error') {
                  setShowPaymentProcessing(false)
                  setPaymentOrderId(null)
                  setPaymentWindowRef(null)
                  setPaymentProcessingStatus('processing')
                  setPaymentProcessingMessage(t('paymentProcessing.accountant'))
                }
              }}
            />
          )
        }

        {/* Модальное окно успешного оформления подписки */}
        {
          showSuccessModal && subscriptionSuccess && (
            <SubscriptionSuccessModal
              vpnLink={subscriptionSuccess.vpnLink}
              subscriptionLinks={subscriptionSuccess.subscriptionLinks || null}
              subscriptionLinksWithPlan={subscriptionSuccess.subscriptionLinksWithPlan || null}
              user={currentUser}
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
              onCheckPaymentStatus={handleManualPaymentCheck}
              awaitingPaymentResult={awaitingPaymentResult}
              paymentPollAttempt={paymentPollAttempt}
            />
          )
        }

        {/* Модальное окно «Добавить устройства» (Super) */}
        {
          showAddDevicesModal && currentTariff && (currentUser?.tariffName?.toLowerCase() === 'super' || currentTariff.plan?.toLowerCase() === 'super' || currentTariff.name?.toLowerCase() === 'super') && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-md" onClick={() => setShowAddDevicesModal(false)}>
              <div
                className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">{t('dashboard.addDevices', 'Добавить устройства')}</h3>
                  <button type="button" onClick={() => setShowAddDevicesModal(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700" aria-label={t('common.close')}>
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 sm:p-5 space-y-4">
                  <p className="text-slate-300 text-sm">
                    {t('dashboard.addDevicesDescription', 'Укажите, сколько устройств добавить. Оплата — за оставшийся период подписки.')}
                  </p>
                  <div>
                    <label className="block text-slate-400 text-sm font-medium mb-2">{t('dashboard.devicesToAdd', 'Количество устройств')}</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={additionalDevices}
                      onChange={(e) => setAdditionalDevices(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  {(() => {
                    const expiresAt = currentUser?.expiresAt ? new Date(currentUser.expiresAt).getTime() : 0
                    const now = Date.now()
                    const remainingMs = Math.max(0, expiresAt - now)
                    const remainingMonths = Math.max(1, Math.ceil(remainingMs / (30 * 24 * 60 * 60 * 1000)))
                    const devicePrice = currentTariff?.price || 150
                    const baseAmount = additionalDevices * devicePrice * remainingMonths
                    const discountPercent = 5
                    const amount = Math.round(baseAmount * (1 - discountPercent / 100))
                    return (
                      <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700">
                        <p className="text-slate-300 text-sm">
                          {t('dashboard.addDevicesPrice', 'К оплате')}: <span className="font-semibold text-white">{amount} ₽</span>
                          {baseAmount > amount && (
                            <span className="text-slate-500 text-xs ml-1 line-through">{baseAmount} ₽</span>
                          )}
                          {discountPercent > 0 && (
                            <span className="text-green-400 text-xs ml-1">({t('dashboard.addDevicesDiscount', 'скидка')} {discountPercent}%)</span>
                          )}
                        </p>
                        <p className="text-slate-500 text-xs mt-1">
                          {additionalDevices} × {devicePrice} ₽/мес × {remainingMonths} {remainingMonths === 1 ? t('dashboard.month') : t('dashboard.months')}
                          {discountPercent > 0 && ` − ${discountPercent}%`}
                        </p>
                      </div>
                    )
                  })()}
                </div>
                <div className="p-4 sm:p-5 flex gap-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddDevicesModal(false)}
                    className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={creatingSubscription}
                    onClick={async () => {
                      if (!onHandleAddDevices) return
                      const result = await onHandleAddDevices(additionalDevices)
                      if (!result?.paymentUrl || !result?.orderId) return
                      setShowAddDevicesModal(false)
                      setSubscriptionSuccess({
                        paymentUrl: result.paymentUrl,
                        orderId: result.orderId,
                        amount: result.amount,
                        requiresPayment: true,
                        message: t('dashboard.paymentWindowOpen'),
                        tariffId: result.tariffId || currentUser?.tariffId,
                        tariffName: result.tariffName || currentUser?.tariffName,
                        devices: result.devices,
                        periodMonths: result.periodMonths,
                        discount: 0,
                        operationType: 'add_devices',
                        newDevicesCount: result.newDevicesCount,
                      })
                      setShowSuccessModal(true)
                      const windowFeatures = ['width=400', 'height=700', 'left=' + (window.screen.width / 2 - 200), 'top=' + (window.screen.height / 2 - 350), 'resizable=yes', 'scrollbars=yes', 'status=no', 'toolbar=no', 'menubar=no', 'location=no'].join(',')
                      const paymentWindow = window.open(result.paymentUrl, 'payment_miniapp', windowFeatures)
                      if (paymentWindow) {
                        paymentWindow.focus()
                        setPaymentWindowRef(paymentWindow)
                        setPaymentOrderId(result.orderId)
                      }
                    }}
                    className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                  >
                    {creatingSubscription ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    <span>{creatingSubscription ? t('dashboard.processing', 'Обработка...') : t('dashboard.payAndAdd', 'Оплатить и добавить')}</span>
                  </button>
                </div>
              </div>
            </div>
          )
        }

        {/* Модальное окно подтверждения удаления подписки */}
        {
          showDeleteConfirm && (
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
                      {t('dashboard.confirmUnsubscribeTitle')}
                    </h3>
                  </div>
                  <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] mt-3">
                    {t('dashboard.confirmUnsubscribeQuestion')}
                  </p>
                  <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-800/50 rounded-lg">
                    <p className="text-yellow-300 text-xs sm:text-sm">
                      {t('dashboard.deleteWarning')}
                    </p>
                  </div>
                </div>
                <div className="p-4 sm:p-5 md:p-6 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deletingSubscription}
                    className="flex-1 min-h-[44px] px-4 py-3 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                    aria-label={t('common.cancel')}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    disabled={deletingSubscription || creatingSubscription}
                    className="flex-1 min-h-[44px] px-4 py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-lg font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-manipulation"
                    aria-label={t('dashboard.confirmDeleteAria')}
                  >
                    {deletingSubscription || creatingSubscription ? (
                      <>
                        <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                        <span>{t('dashboard.deleting')}</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span>{t('dashboard.confirmUnsubscribe')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )
        }

        <div className="max-sm:hidden">
          <Footer />
        </div>
      </div >
      {showLogger && <LoggerPanel onClose={() => onSetShowLogger(false)} />}
    </div >
  )
}

export default Dashboard

