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
import { useSubscriptionNotifications } from '../hooks/useSubscriptionNotifications.js'
import notificationService from '../../../shared/services/notificationService.js'
import { formatTimeRemaining, getTimeRemaining } from '../../../shared/utils/formatDate.js'

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
  servers = [],
}) => {
  // Состояние для модальных окон выбора тарифа и успеха
  const [selectedTariff, setSelectedTariff] = useState(null)
  const [showTariffModal, setShowTariffModal] = useState(false)
  const [subscriptionSuccess, setSubscriptionSuccess] = useState(null)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingSubscription, setDeletingSubscription] = useState(false)
  const [showPaymentProcessing, setShowPaymentProcessing] = useState(false)
  const [paymentProcessingMessage, setPaymentProcessingMessage] = useState('Формируем подписку...')
  const [paymentProcessingStatus, setPaymentProcessingStatus] = useState('processing') // 'processing', 'waiting', 'checking', 'error'
  const [paymentWindowRef, setPaymentWindowRef] = useState(null)
  const [paymentOrderId, setPaymentOrderId] = useState(null)
  const paymentPollingIntervalRef = useRef(null)
  const paymentCheckTimeoutRef = useRef(null)
  const paymentCheckAttemptsRef = useRef(0)

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
      if (tariffs && tariffs.length > 0) {
        // Находим первый активный тариф или просто первый тариф
        const availableTariff = tariffs.find(t => t.active !== false) || tariffs[0]
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

    // Этап 1: Через 3 секунды меняем сообщение на "Ожидаем платеж"
    const waitingTimeout = setTimeout(() => {
      logger.debug('Dashboard', 'Переход в режим ожидания платежа', { orderId: paymentOrderId })
      setPaymentProcessingMessage('Ожидаем платеж')
      setPaymentProcessingStatus('waiting')
    }, 3000)

    // Этап 2: Через 2 секунды (итого 5 секунд) начинаем проверку
    const checkingTimeout = setTimeout(async () => {
      logger.debug('Dashboard', 'Начинаем проверку платежа через webhook', { orderId: paymentOrderId })
      setPaymentProcessingMessage('Проверяем платеж')
      setPaymentProcessingStatus('checking')

      // Функция проверки платежа через webhook
      const checkPaymentViaWebhook = async () => {
        try {
          const { dashboardService } = await import('../services/dashboardService.js')
          
          logger.debug('Dashboard', 'Отправка webhook для проверки платежа', {
            orderId: paymentOrderId,
            attempt: paymentCheckAttemptsRef.current + 1
          })

          // Отправляем webhook для проверки платежа
          const verifyResult = await dashboardService.verifyPayment(paymentOrderId)

          if (verifyResult && verifyResult.success) {
            logger.info('Dashboard', 'Результат проверки платежа получен от n8n', {
              orderId: paymentOrderId,
              attempt: paymentCheckAttemptsRef.current + 1,
              hasPayment: !!verifyResult.payment,
              paymentStatus: verifyResult.payment?.status
            })

            // Получаем данные платежа из результата от n8n
            // n8n ищет запись в базе данных по orderId и возвращает данные, если найдена
            // n8n может вернуть массив или объект, данные уже обработаны на сервере
            let payment = verifyResult.payment

            logger.info('Dashboard', 'Получены данные платежа от n8n', {
              orderId: paymentOrderId,
              attempt: paymentCheckAttemptsRef.current + 1,
              hasPayment: !!payment,
              hasResult: !!verifyResult.result,
              resultIsArray: Array.isArray(verifyResult.result),
              resultLength: Array.isArray(verifyResult.result) ? verifyResult.result.length : 'N/A'
            })

            // Если payment не найден в verifyResult.payment, проверяем result (массив или объект от n8n)
            if (!payment && verifyResult.result) {
              // Обработка массива от n8n
              if (Array.isArray(verifyResult.result) && verifyResult.result.length > 0) {
                const n8nPayment = verifyResult.result[0]
                logger.info('Dashboard', 'Обрабатываем данные из массива n8n (автоматическая проверка)', {
                  orderid: n8nPayment?.orderid,
                  statuspay: n8nPayment?.statuspay
                })
                
                // Маппим данные из формата n8n
                const statuspay = n8nPayment?.statuspay || ''
                const statuspayLower = String(statuspay).toLowerCase().trim()
                const isPaidStatus = statuspayLower === 'оплачено' || 
                                    statuspayLower === 'оплачен' || 
                                    statuspayLower === 'paid' || 
                                    statuspayLower === 'completed' ||
                                    statuspayLower === 'успешно'
                
                if (isPaidStatus) {
                  // Получаем данные подписки из subscriptionSuccess или currentUser
                  const subscriptionData = subscriptionSuccess || {}
                  const tariffId = subscriptionData.tariffName ? tariffs.find(t => t.name === subscriptionData.tariffName)?.id : currentUser?.tariffId
                  const tariff = tariffId ? tariffs.find(t => t.id === tariffId) : (tariffs.length > 0 ? tariffs[0] : null)
                  
                  // Создаем объект payment из данных n8n
                  payment = {
                    orderId: n8nPayment?.orderid || paymentOrderId,
                    status: 'completed',
                    originalStatus: n8nPayment?.statuspay,
                    amount: parseFloat(n8nPayment?.sum) || subscriptionData.amount || 0,
                    userId: n8nPayment?.uuid || currentUser?.id || null,
                    tariffId: tariff?.id || null,
                    tariffName: tariff?.name || subscriptionData.tariffName || null,
                    devices: subscriptionData.devices || currentUser?.devices || 1,
                    periodMonths: subscriptionData.periodMonths || currentUser?.periodMonths || 1,
                    discount: subscriptionData.discount || 0
                  }
                  
                  logger.info('Dashboard', '✅ Статус ОПЛАЧЕНО найден в массиве n8n, данные платежа подготовлены', {
                    orderId: payment.orderId,
                    tariffId: payment.tariffId,
                    status: payment.status
                  })
                }
              } 
              // Обработка объекта от n8n (когда n8n возвращает объект, а не массив)
              else if (typeof verifyResult.result === 'object' && !Array.isArray(verifyResult.result)) {
                const n8nPayment = verifyResult.result
                logger.info('Dashboard', 'Обрабатываем данные из объекта n8n (автоматическая проверка)', {
                  orderid: n8nPayment?.orderid,
                  statuspay: n8nPayment?.statuspay,
                  statuspayType: typeof n8nPayment?.statuspay,
                  allKeys: Object.keys(n8nPayment || {})
                })
                
                // Маппим данные из формата n8n
                const statuspay = n8nPayment?.statuspay || ''
                const statuspayLower = String(statuspay).toLowerCase().trim()
                logger.info('Dashboard', 'Проверка статуса платежа из объекта n8n (автоматическая проверка)', {
                  statuspay: statuspay,
                  statuspayLower: statuspayLower,
                  isPaid: statuspayLower === 'оплачено' || statuspayLower === 'оплачен' || statuspayLower === 'paid' || statuspayLower === 'completed' || statuspayLower === 'успешно'
                })
                
                const isPaidStatus = statuspayLower === 'оплачено' || 
                                    statuspayLower === 'оплачен' || 
                                    statuspayLower === 'paid' || 
                                    statuspayLower === 'completed' ||
                                    statuspayLower === 'успешно'
                
                if (isPaidStatus) {
                  // Получаем данные подписки из subscriptionSuccess или currentUser
                  const subscriptionData = subscriptionSuccess || {}
                  logger.info('Dashboard', 'Получение данных подписки из объекта n8n (автоматическая проверка)', {
                    hasSubscriptionSuccess: !!subscriptionSuccess,
                    subscriptionTariffName: subscriptionData.tariffName,
                    currentUserTariffId: currentUser?.tariffId,
                    availableTariffs: tariffs.map(t => ({ id: t.id, name: t.name }))
                  })
                  
                  const tariffId = subscriptionData.tariffName ? tariffs.find(t => t.name === subscriptionData.tariffName)?.id : currentUser?.tariffId
                  const tariff = tariffId ? tariffs.find(t => t.id === tariffId) : (tariffs.length > 0 ? tariffs[0] : null)
                  
                  // Создаем объект payment из данных n8n
                  payment = {
                    orderId: n8nPayment?.orderid || paymentOrderId,
                    status: 'completed',
                    originalStatus: n8nPayment?.statuspay,
                    amount: parseFloat(n8nPayment?.sum) || subscriptionData.amount || 0,
                    userId: n8nPayment?.uuid || currentUser?.id || null,
                    tariffId: tariff?.id || null,
                    tariffName: tariff?.name || subscriptionData.tariffName || null,
                    devices: subscriptionData.devices || currentUser?.devices || 1,
                    periodMonths: subscriptionData.periodMonths || currentUser?.periodMonths || 1,
                    discount: subscriptionData.discount || 0
                  }
                  
                  logger.info('Dashboard', '✅ Статус ОПЛАЧЕНО найден в объекте n8n, данные платежа подготовлены', {
                    orderId: payment.orderId,
                    tariffId: payment.tariffId,
                    tariffName: payment.tariffName,
                    status: payment.status,
                    amount: payment.amount
                  })
                }
              }
            }

            // Проверяем статус платежа из n8n
            // Статус уже нормализован на сервере: 'completed', 'paid', 'failed', 'cancelled', 'pending'
            const paymentStatus = payment?.status
            const isPaid = paymentStatus === 'completed' || paymentStatus === 'paid'
            
            logger.info('Dashboard', 'Проверка статуса платежа', {
              orderId: paymentOrderId,
              hasPayment: !!payment,
              paymentStatus: paymentStatus,
              originalStatus: payment?.originalStatus,
              isPaid: isPaid
            })

            if (payment && isPaid) {
          logger.info('Dashboard', 'Платеж подтвержден n8n (статус: оплачено), создаем подписку', {
            orderId: paymentOrderId,
            amount: payment.amount,
            tariffId: payment.tariffId,
            tariffName: payment.tariffName,
            devices: payment.devices,
            periodMonths: payment.periodMonths,
            status: payment.status
          })

              // Останавливаем все проверки
              if (paymentCheckTimeoutRef.current) {
                clearTimeout(paymentCheckTimeoutRef.current)
                paymentCheckTimeoutRef.current = null
              }
              if (paymentPollingIntervalRef.current) {
                clearTimeout(paymentPollingIntervalRef.current)
                paymentPollingIntervalRef.current = null
              }

              try {
                // Находим тариф по tariffId из платежа
                // Если tariffId не указан, берем из subscriptionSuccess или currentUser
                let tariff = payment.tariffId ? tariffs.find(t => t.id === payment.tariffId) : null
                
                if (!tariff) {
                  const subscriptionData = subscriptionSuccess || {}
                  const tariffId = subscriptionData.tariffName ? tariffs.find(t => t.name === subscriptionData.tariffName)?.id : currentUser?.tariffId
                  tariff = tariffId ? tariffs.find(t => t.id === tariffId) : (tariffs.length > 0 ? tariffs[0] : null)
                  
                  if (tariff) {
                    payment.tariffId = tariff.id
                    payment.tariffName = tariff.name
                  }
                }
                
                if (!tariff) {
                  logger.error('Dashboard', 'Тариф не найден для завершенного платежа', {
                    tariffId: payment.tariffId,
                    orderId: paymentOrderId,
                    availableTariffs: tariffs.map(t => ({ id: t.id, name: t.name }))
                  })
                  window.location.reload()
                  return
                }

                // Создаем подписку с данными из платежа
                logger.info('Dashboard', 'Создание подписки после успешной оплаты', {
                  userId: currentUser.id,
                  tariffId: tariff.id,
                  tariffName: tariff.name,
                  devices: payment.devices || 1,
                  periodMonths: payment.periodMonths || 1,
                  discount: payment.discount || 0,
                  paymentStatus: payment.status,
                  fullPayment: payment
                })

                // Вызываем создание подписки через onHandleCreateSubscription
                // ВАЖНО: передаем periodMonths и devices из payment, чтобы подписка была создана с правильными параметрами
                const subscriptionResult = await onHandleCreateSubscription(
                  tariff,
                  payment.devices || 1,
                  null, // natrockPort - не используется для SUPER тарифа
                  payment.periodMonths || 1,
                  false, // testPeriod - уже оплачено
                  'pay_now', // paymentMode - платёж уже оплачен, но режим pay_now для корректной обработки
                  payment.discount || 0
                )

                logger.info('Dashboard', 'Подписка создана после успешной оплаты', {
                  hasVpnLink: !!subscriptionResult?.vpnLink,
                  tariffName: subscriptionResult?.tariffName,
                  devices: subscriptionResult?.devices,
                  periodMonths: subscriptionResult?.periodMonths,
                  paymentStatus: subscriptionResult?.paymentStatus,
                  expiresAt: subscriptionResult?.expiresAt,
                  fullResult: subscriptionResult
                })

                // Отправляем уведомление об успешной оплате
                try {
                  const notificationInstance = notificationService.getInstance()
                  if (notificationInstance.hasPermission()) {
                    await notificationInstance.notifyPaymentSuccess(
                      payment.tariffName || tariff.name || 'Подписка',
                      payment.amount || 0
                    )
                    logger.info('Dashboard', 'Уведомление об успешной оплате отправлено')
                  }
                } catch (notificationError) {
                  logger.warn('Dashboard', 'Ошибка отправки уведомления об успешной оплате', null, notificationError)
                }

                // Закрываем модальное окно обработки
                setShowPaymentProcessing(false)
                setPaymentOrderId(null)
                setPaymentWindowRef(null)

                // Закрываем модальное окно успеха (если открыто)
                setShowSuccessModal(false)
                setSubscriptionSuccess(null)

                // Обновляем страницу, чтобы загрузить обновленные данные пользователя
                // Увеличиваем задержку, чтобы убедиться, что данные сохранились в Firestore
                logger.info('Dashboard', 'Ожидание перед перезагрузкой страницы для применения изменений', {
                  orderId: paymentOrderId
                })
                setTimeout(() => {
                  logger.info('Dashboard', 'Перезагрузка страницы после успешной оплаты')
                  window.location.reload()
                }, 1500) // Увеличиваем до 1.5 секунды для надежного сохранения данных
              } catch (error) {
                logger.error('Dashboard', 'Ошибка создания подписки после успешной оплаты', {
                  orderId: paymentOrderId
                }, error)
                setTimeout(() => {
                  window.location.reload()
                }, 1000)
              }
              return true // Платеж найден и обработан
            } else if (payment && (payment.status === 'failed' || payment.status === 'cancelled' || payment.status === 'rejected')) {
              logger.warn('Dashboard', 'Платеж не прошел', {
                orderId: paymentOrderId,
                status: payment.status
              })

              // Останавливаем все проверки
              if (paymentCheckTimeoutRef.current) {
                clearTimeout(paymentCheckTimeoutRef.current)
                paymentCheckTimeoutRef.current = null
              }
              if (paymentPollingIntervalRef.current) {
                clearTimeout(paymentPollingIntervalRef.current)
                paymentPollingIntervalRef.current = null
              }

              // Показываем ошибку
              setPaymentProcessingMessage('Платеж не прошел')
              setPaymentProcessingStatus('error')

              // Очищаем состояние через 3 секунды
              setTimeout(() => {
                setShowPaymentProcessing(false)
                setPaymentOrderId(null)
                setPaymentWindowRef(null)
                setPaymentProcessingStatus('processing')
                setPaymentProcessingMessage('Формируем подписку...')
              }, 3000)

              return true // Платеж обработан (не прошел)
            }
          }

          // Если платеж не найден, продолжаем проверку
          paymentCheckAttemptsRef.current++
          logger.debug('Dashboard', 'Платеж не найден, продолжаем проверку', {
            orderId: paymentOrderId,
            attempt: paymentCheckAttemptsRef.current,
            maxAttempts: 6
          })

          return false // Платеж не найден
        } catch (error) {
          logger.error('Dashboard', 'Ошибка проверки платежа через webhook', {
            orderId: paymentOrderId,
            attempt: paymentCheckAttemptsRef.current + 1
          }, error)
          paymentCheckAttemptsRef.current++
          return false // Продолжаем попытки при ошибке
        }
      }

      // Выполняем проверку сразу и затем каждые 3 секунды, максимум 6 попыток
      const performCheck = async () => {
        if (paymentCheckAttemptsRef.current >= 6) {
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
          setPaymentProcessingMessage('Платеж не прошел')
          setPaymentProcessingStatus('error')

          // Очищаем состояние через 3 секунды
          setTimeout(() => {
            setShowPaymentProcessing(false)
            setPaymentOrderId(null)
            setPaymentWindowRef(null)
            setPaymentProcessingStatus('processing')
            setPaymentProcessingMessage('Формируем подписку...')
            paymentCheckAttemptsRef.current = 0
          }, 3000)
          return
        }

        const found = await checkPaymentViaWebhook()

        if (!found && paymentCheckAttemptsRef.current < 6) {
          // Продолжаем проверку через 3 секунды
          paymentPollingIntervalRef.current = setTimeout(performCheck, 3000)
        }
      }

      // Запускаем первую проверку
      performCheck()
    }, 5000) // Итого 5 секунд (3 сек ожидание + 2 сек до начала проверки)

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
  }, [paymentOrderId, showPaymentProcessing, tariffs, onHandleCreateSubscription, currentUser])

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
              logger.info('Dashboard', 'Окно оплаты закрыто, запускаем проверку статуса платежа через webhook', {
                orderId: paymentOrderId
              })

              const { dashboardService } = await import('../services/dashboardService.js')
              
              // Отправляем запрос на проверку платежа через webhook в n8n
              const verifyResult = await dashboardService.verifyPayment(paymentOrderId)

              logger.info('Dashboard', 'Запрос на проверку платежа через webhook отправлен', {
                orderId: paymentOrderId,
                success: verifyResult?.success,
                hasPayment: !!verifyResult?.payment,
                hasResult: !!verifyResult?.result
              })

              // Обрабатываем результат от n8n (может быть объект или массив)
              let payment = verifyResult?.payment
              
              // Если payment не найден, обрабатываем result (массив или объект от n8n)
              if (!payment && verifyResult?.result) {
                // Обработка массива от n8n
                if (Array.isArray(verifyResult.result) && verifyResult.result.length > 0) {
                  const n8nPayment = verifyResult.result[0]
                  const statuspay = n8nPayment?.statuspay || ''
                  const statuspayLower = String(statuspay).toLowerCase().trim()
                  const isPaidStatus = statuspayLower === 'оплачено' || 
                                      statuspayLower === 'оплачен' || 
                                      statuspayLower === 'paid' || 
                                      statuspayLower === 'completed' ||
                                      statuspayLower === 'успешно'
                  
                  if (isPaidStatus) {
                    const subscriptionData = subscriptionSuccess || {}
                    const tariffId = subscriptionData.tariffName ? tariffs.find(t => t.name === subscriptionData.tariffName)?.id : currentUser?.tariffId
                    const tariff = tariffId ? tariffs.find(t => t.id === tariffId) : (tariffs.length > 0 ? tariffs[0] : null)
                    
                    payment = {
                      orderId: n8nPayment?.orderid || paymentOrderId,
                      status: 'completed',
                      originalStatus: n8nPayment?.statuspay,
                      amount: parseFloat(n8nPayment?.sum) || 0,
                      userId: n8nPayment?.uuid || currentUser?.id || null,
                      tariffId: tariff?.id || null,
                      tariffName: tariff?.name || subscriptionData.tariffName || null,
                      devices: subscriptionData.devices || currentUser?.devices || 1,
                      periodMonths: subscriptionData.periodMonths || currentUser?.periodMonths || 1,
                      discount: subscriptionData.discount || 0
                    }
                  }
                }
                // Обработка объекта от n8n (когда n8n возвращает объект, а не массив)
                else if (typeof verifyResult.result === 'object' && !Array.isArray(verifyResult.result)) {
                  const n8nPayment = verifyResult.result
                  const statuspay = n8nPayment?.statuspay || ''
                  const statuspayLower = String(statuspay).toLowerCase().trim()
                  const isPaidStatus = statuspayLower === 'оплачено' || 
                                      statuspayLower === 'оплачен' || 
                                      statuspayLower === 'paid' || 
                                      statuspayLower === 'completed' ||
                                      statuspayLower === 'успешно'
                  
                  if (isPaidStatus) {
                    const subscriptionData = subscriptionSuccess || {}
                    const tariffId = subscriptionData.tariffName ? tariffs.find(t => t.name === subscriptionData.tariffName)?.id : currentUser?.tariffId
                    const tariff = tariffId ? tariffs.find(t => t.id === tariffId) : (tariffs.length > 0 ? tariffs[0] : null)
                    
                    payment = {
                      orderId: n8nPayment?.orderid || paymentOrderId,
                      status: 'completed',
                      originalStatus: n8nPayment?.statuspay,
                      amount: parseFloat(n8nPayment?.sum) || 0,
                      userId: n8nPayment?.uuid || currentUser?.id || null,
                      tariffId: tariff?.id || null,
                      tariffName: tariff?.name || subscriptionData.tariffName || null,
                      devices: subscriptionData.devices || currentUser?.devices || 1,
                      periodMonths: subscriptionData.periodMonths || currentUser?.periodMonths || 1,
                      discount: subscriptionData.discount || 0
                    }
                    
                    logger.info('Dashboard', '✅ Статус ОПЛАЧЕНО найден в объекте n8n (после закрытия окна), данные платежа подготовлены', {
                      orderId: payment.orderId,
                      tariffId: payment.tariffId,
                      status: payment.status
                    })
                  }
                }
              }
              
              if (payment && (payment.status === 'completed' || payment.status === 'paid')) {
                logger.info('Dashboard', 'Платеж подтвержден n8n (после закрытия окна), создаем подписку', {
                  orderId: paymentOrderId,
                  status: payment.status
                })
                
                // Находим тариф
                let tariff = payment.tariffId ? tariffs.find(t => t.id === payment.tariffId) : null
                if (!tariff) {
                  const subscriptionData = subscriptionSuccess || {}
                  const tariffId = subscriptionData.tariffName ? tariffs.find(t => t.name === subscriptionData.tariffName)?.id : currentUser?.tariffId
                  tariff = tariffId ? tariffs.find(t => t.id === tariffId) : (tariffs.length > 0 ? tariffs[0] : null)
                }
                
                if (tariff && onHandleCreateSubscription) {
                  // Создаем подписку с данными из платежа
                  await onHandleCreateSubscription(
                    tariff,
                    payment.devices || 1,
                    null,
                    payment.periodMonths || 1,
                    false,
                    'pay_now',
                    payment.discount || 0
                  )
                  
                  logger.info('Dashboard', 'Подписка создана после проверки webhook', {
                    orderId: paymentOrderId
                  })
                  
                  // Перезагружаем страницу для обновления данных
                  setTimeout(() => {
                    window.location.reload()
                  }, 1000)
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
  }, [paymentWindowRef, paymentOrderId, tariffs, onHandleCreateSubscription, currentUser])

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
      setPaymentProcessingMessage('Формируем подписку...')
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
        subscriptionData.discount || 0
      )
      
      logger.info('Dashboard', 'onHandleCreateSubscription вернул результат (ПОСЛЕ await)', {
        hasResult: !!result,
        hasPaymentUrl: !!result?.paymentUrl,
        requiresPayment: result?.requiresPayment,
        resultKeys: result ? Object.keys(result) : [],
        fullResult: result
      })
      
      console.log('🔍 Dashboard: result после await onHandleCreateSubscription:', result)
      
      // Если результат содержит ссылку на оплату, открываем её в miniapp
      // Проверяем наличие paymentUrl, даже если requiresPayment не указан явно
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
          message: result.message || 'Требуется оплата для активации подписки',
          tariffName: result.tariffName || subscriptionData.tariff.name,
          devices: result.devices || subscriptionData.devices || 1,
          periodMonths: result.periodMonths || subscriptionData.periodMonths || 1
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
          setPaymentProcessingMessage('Перенаправление на оплату...')
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

  // Обработчик ручной проверки статуса оплаты
  const handleManualPaymentCheck = async (orderId) => {
    if (!orderId) {
      logger.error('Dashboard', 'orderId не указан для ручной проверки платежа')
      throw new Error('ID заказа не указан')
    }

    try {
      logger.info('Dashboard', 'Ручная проверка статуса оплаты', { orderId })
      
      const { dashboardService } = await import('../services/dashboardService.js')
      
      // Отправляем webhook для проверки платежа
      const verifyResult = await dashboardService.verifyPayment(orderId)

      if (verifyResult && verifyResult.success) {
        // Получаем данные платежа из результата от n8n
        // n8n ищет запись в базе данных по orderId и возвращает данные, если найдена
        // n8n может вернуть массив или объект, данные уже обработаны на сервере
        let payment = verifyResult.payment

        logger.info('Dashboard', 'Получен результат проверки от n8n (ручная проверка)', {
          orderId,
          hasPayment: !!payment,
          paymentStatus: payment?.status,
          paymentOriginalStatus: payment?.originalStatus,
          hasResult: !!verifyResult.result,
          resultIsArray: Array.isArray(verifyResult.result),
          resultLength: Array.isArray(verifyResult.result) ? verifyResult.result.length : 'N/A',
          verifyResultKeys: Object.keys(verifyResult || {}),
          fullVerifyResult: JSON.stringify(verifyResult).substring(0, 2000)
        })

        // Если payment не найден в verifyResult.payment, проверяем result (массив от n8n)
        if (!payment && verifyResult?.result) {
          logger.info('Dashboard', 'payment не найден в verifyResult.payment, проверяем result', {
            resultIsArray: Array.isArray(verifyResult.result),
            resultLength: Array.isArray(verifyResult.result) ? verifyResult.result.length : 'N/A',
            firstItemKeys: Array.isArray(verifyResult.result) && verifyResult.result[0] ? Object.keys(verifyResult.result[0]) : 'N/A'
          })
          
          // Если result - массив, берем первый элемент и обрабатываем
          if (Array.isArray(verifyResult.result) && verifyResult.result.length > 0) {
            const n8nPayment = verifyResult.result[0]
            logger.info('Dashboard', 'Обрабатываем данные из массива n8n', {
              orderid: n8nPayment?.orderid,
              statuspay: n8nPayment?.statuspay,
              statuspayType: typeof n8nPayment?.statuspay,
              allKeys: Object.keys(n8nPayment || {}),
              fullN8nPayment: JSON.stringify(n8nPayment).substring(0, 1000)
            })
            
            // Маппим данные из формата n8n в формат приложения
            const statuspay = n8nPayment?.statuspay || ''
            const statuspayLower = String(statuspay).toLowerCase().trim()
            logger.info('Dashboard', 'Проверка статуса платежа', {
              statuspay: statuspay,
              statuspayLower: statuspayLower,
              isPaid: statuspayLower === 'оплачено' || statuspayLower === 'оплачен' || statuspayLower === 'paid' || statuspayLower === 'completed' || statuspayLower === 'успешно'
            })
            
            const isPaidStatus = statuspayLower === 'оплачено' || 
                                statuspayLower === 'оплачен' || 
                                statuspayLower === 'paid' || 
                                statuspayLower === 'completed' ||
                                statuspayLower === 'успешно'
            
            if (isPaidStatus) {
              logger.info('Dashboard', '✅ Статус ОПЛАЧЕНО найден в данных n8n, создаем подписку', {
                orderId: n8nPayment?.orderid || orderId,
                statuspay: n8nPayment?.statuspay,
                amount: n8nPayment?.sum
              })
              
              // Создаем объект payment для дальнейшей обработки
              payment = {
                orderId: n8nPayment?.orderid || orderId,
                status: 'completed',
                originalStatus: n8nPayment?.statuspay,
                amount: parseFloat(n8nPayment?.sum) || 0,
                userId: n8nPayment?.uuid || currentUser?.id || null,
                tariffId: null, // Будет получен из subscriptionSuccess или currentUser
                devices: 1,
                periodMonths: 1,
                discount: 0
              }
              
              // Получаем данные подписки из subscriptionSuccess или currentUser
              const subscriptionData = subscriptionSuccess || {}
              logger.info('Dashboard', 'Получение данных подписки', {
                hasSubscriptionSuccess: !!subscriptionSuccess,
                subscriptionTariffName: subscriptionData.tariffName,
                currentUserTariffId: currentUser?.tariffId,
                availableTariffs: tariffs.map(t => ({ id: t.id, name: t.name }))
              })
              
              const tariffId = subscriptionData.tariffName ? tariffs.find(t => t.name === subscriptionData.tariffName)?.id : currentUser?.tariffId
              const tariff = tariffId ? tariffs.find(t => t.id === tariffId) : (tariffs.length > 0 ? tariffs[0] : null)
              
              if (!tariff) {
                logger.error('Dashboard', 'Тариф не найден для создания подписки', {
                  tariffId,
                  tariffName: subscriptionData.tariffName,
                  availableTariffs: tariffs.map(t => ({ id: t.id, name: t.name }))
                })
                throw new Error('Тариф не найден')
              }
              
              payment.tariffId = tariff.id
              payment.tariffName = tariff.name
              payment.devices = subscriptionData.devices || currentUser?.devices || 1
              payment.periodMonths = subscriptionData.periodMonths || currentUser?.periodMonths || 1
              
              logger.info('Dashboard', 'Данные платежа подготовлены, создаем подписку', {
                tariffId: payment.tariffId,
                tariffName: payment.tariffName,
                devices: payment.devices,
                periodMonths: payment.periodMonths
              })
              
              // Создаем подписку
              await onHandleCreateSubscription(
                tariff,
                payment.devices,
                null,
                payment.periodMonths,
                false,
                'pay_now',
                payment.discount
              )
              
              logger.info('Dashboard', '✅ Подписка создана после проверки оплаты через n8n')
              
              setTimeout(() => {
                window.location.reload()
              }, 1000)
              return
            } else {
              logger.warn('Dashboard', 'Статус платежа не ОПЛАЧЕНО', {
                statuspay: statuspay,
                statuspayLower: statuspayLower,
                orderId: n8nPayment?.orderid || orderId,
                fullPaymentData: JSON.stringify(n8nPayment).substring(0, 500)
              })
              throw new Error(`Платеж найден, но статус: ${statuspay || 'неизвестен'}`)
            }
          } else if (verifyResult.result && typeof verifyResult.result === 'object' && !Array.isArray(verifyResult.result)) {
            // Если result - объект (не массив) с данными платежа от n8n
            const n8nPayment = verifyResult.result
            logger.info('Dashboard', 'result - объект (не массив) с данными n8n, обрабатываем его', {
              orderid: n8nPayment?.orderid,
              statuspay: n8nPayment?.statuspay,
              statuspayType: typeof n8nPayment?.statuspay,
              allKeys: Object.keys(n8nPayment || {})
            })
            
            // Маппим данные из формата n8n в формат приложения
            const statuspay = n8nPayment?.statuspay || ''
            const statuspayLower = String(statuspay).toLowerCase().trim()
            logger.info('Dashboard', 'Проверка статуса платежа из объекта n8n', {
              statuspay: statuspay,
              statuspayLower: statuspayLower,
              isPaid: statuspayLower === 'оплачено' || statuspayLower === 'оплачен' || statuspayLower === 'paid' || statuspayLower === 'completed' || statuspayLower === 'успешно'
            })
            
            const isPaidStatus = statuspayLower === 'оплачено' || 
                                statuspayLower === 'оплачен' || 
                                statuspayLower === 'paid' || 
                                statuspayLower === 'completed' ||
                                statuspayLower === 'успешно'
            
            if (isPaidStatus) {
              logger.info('Dashboard', '✅ Статус ОПЛАЧЕНО найден в объекте n8n, создаем подписку', {
                orderId: n8nPayment?.orderid || orderId,
                statuspay: n8nPayment?.statuspay,
                amount: n8nPayment?.sum
              })
              
              // Создаем объект payment для дальнейшей обработки
              payment = {
                orderId: n8nPayment?.orderid || orderId,
                status: 'completed',
                originalStatus: n8nPayment?.statuspay,
                amount: parseFloat(n8nPayment?.sum) || 0,
                userId: n8nPayment?.uuid || currentUser?.id || null,
                tariffId: null, // Будет получен из subscriptionSuccess или currentUser
                devices: 1,
                periodMonths: 1,
                discount: 0
              }
              
              // Получаем данные подписки из subscriptionSuccess или currentUser
              const subscriptionData = subscriptionSuccess || {}
              logger.info('Dashboard', 'Получение данных подписки из объекта n8n', {
                hasSubscriptionSuccess: !!subscriptionSuccess,
                subscriptionTariffName: subscriptionData.tariffName,
                currentUserTariffId: currentUser?.tariffId,
                availableTariffs: tariffs.map(t => ({ id: t.id, name: t.name }))
              })
              
              const tariffId = subscriptionData.tariffName ? tariffs.find(t => t.name === subscriptionData.tariffName)?.id : currentUser?.tariffId
              const tariff = tariffId ? tariffs.find(t => t.id === tariffId) : (tariffs.length > 0 ? tariffs[0] : null)
              
              if (!tariff) {
                logger.error('Dashboard', 'Тариф не найден для создания подписки', {
                  tariffId,
                  tariffName: subscriptionData.tariffName,
                  availableTariffs: tariffs.map(t => ({ id: t.id, name: t.name }))
                })
                throw new Error('Тариф не найден')
              }
              
              payment.tariffId = tariff.id
              payment.tariffName = tariff.name
              payment.devices = subscriptionData.devices || currentUser?.devices || 1
              payment.periodMonths = subscriptionData.periodMonths || currentUser?.periodMonths || 1
              
              logger.info('Dashboard', 'Данные платежа подготовлены из объекта n8n, создаем подписку', {
                tariffId: payment.tariffId,
                tariffName: payment.tariffName,
                devices: payment.devices,
                periodMonths: payment.periodMonths
              })
              
              // Создаем подписку
              await onHandleCreateSubscription(
                tariff,
                payment.devices,
                null,
                payment.periodMonths,
                false,
                'pay_now',
                payment.discount
              )
              
              logger.info('Dashboard', '✅ Подписка создана после проверки оплаты через n8n (объект)')
              
              setTimeout(() => {
                window.location.reload()
              }, 1000)
              return
            } else {
              logger.warn('Dashboard', 'Статус платежа в объекте n8n не ОПЛАЧЕНО', {
                statuspay: statuspay,
                statuspayLower: statuspayLower,
                orderId: n8nPayment?.orderid || orderId
              })
              throw new Error(`Платеж найден, но статус: ${statuspay || 'неизвестен'}`)
            }
          }
        }

        // Проверяем статус платежа из n8n
        // Статус уже нормализован на сервере: 'completed', 'paid', 'failed', 'cancelled', 'pending'
        const paymentStatus = payment?.status
        const isPaid = paymentStatus === 'completed' || paymentStatus === 'paid'

        if (payment && isPaid) {
          logger.info('Dashboard', 'Платеж подтвержден n8n (статус: оплачено, ручная проверка), создаем подписку', {
            orderId,
            amount: payment.amount,
            tariffId: payment.tariffId,
            status: payment.status
          })

          try {
            // Находим тариф по tariffId из платежа
            const tariff = tariffs.find(t => t.id === payment.tariffId)
            if (!tariff) {
              logger.error('Dashboard', 'Тариф не найден для завершенного платежа', {
                tariffId: payment.tariffId,
                orderId
              })
              throw new Error('Тариф не найден')
            }

            // Создаем подписку с данными из платежа
            await onHandleCreateSubscription(
              tariff,
              payment.devices || 1,
              null, // natrockPort
              payment.periodMonths || 1,
              false, // testPeriod
              'pay_now', // paymentMode
              payment.discount || 0
            )

            logger.info('Dashboard', 'Подписка создана после ручной проверки оплаты')
            
            // Обновляем страницу для отображения обновленных данных
            setTimeout(() => {
              window.location.reload()
            }, 1000)
          } catch (error) {
            logger.error('Dashboard', 'Ошибка создания подписки после ручной проверки оплаты', {
              orderId
            }, error)
            throw error
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
            logger.warn('Dashboard', 'Платеж не найден или статус не оплачено в ответе от n8n (ручная проверка)', {
              orderId,
              hasVerifyResult: !!verifyResult,
              hasPayment: !!payment,
              paymentStatus: payment?.status,
              hasResult: !!verifyResult?.result,
              resultIsArray: Array.isArray(verifyResult?.result),
              resultLength: Array.isArray(verifyResult?.result) ? verifyResult.result.length : 'N/A',
              resultType: typeof verifyResult?.result,
              resultKeys: verifyResult?.result && typeof verifyResult.result === 'object' ? Object.keys(verifyResult.result) : 'N/A',
              firstItem: Array.isArray(verifyResult?.result) && verifyResult.result.length > 0 ? verifyResult.result[0] : null,
              fullVerifyResult: JSON.stringify(verifyResult).substring(0, 2000)
            })
            throw new Error('Платеж еще не завершен. Попробуйте позже.')
          }
        }
      } else {
        throw new Error('Не удалось проверить статус платежа')
      }
    } catch (error) {
      logger.error('Dashboard', 'Ошибка при ручной проверке статуса оплаты', { orderId }, error)
      throw error
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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-white">Текущая подписка</h2>
                  {currentUser?.uuid && onHandleDeleteSubscription && (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={deletingSubscription || creatingSubscription}
                      className="btn-icon-only-mobile min-h-[44px] w-full sm:w-auto px-3 sm:px-4 py-2 bg-red-600/90 hover:bg-red-700 active:bg-red-800 disabled:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center gap-2 touch-manipulation"
                      aria-label="Отменить подписку"
                    >
                      <Trash2 className="w-4 h-4 flex-shrink-0" />
                      <span className="btn-text">{deletingSubscription ? 'Отмена...' : 'Отменить подписку'}</span>
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {/* Основная карточка подписки - компактный дизайн */}
                  <div className="bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 rounded-lg sm:rounded-xl p-4 sm:p-5 border border-slate-700">
                    {/* Заголовок с тарифом и статусом - компактная версия */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
                      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                        <h3 className="text-[clamp(1.25rem,1.15rem+0.5vw,1.5rem)] font-bold text-white">{currentUser.tariffName || 'Не указан'}</h3>
                        {currentUser.tariffName?.toLowerCase() === 'super' && (
                          <span className="px-2 py-0.5 bg-blue-600 text-white text-[clamp(0.65rem,0.6rem+0.25vw,0.75rem)] font-bold rounded-full">PREMIUM</span>
                        )}
                        <div className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg ${userStatus.color} font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)]`}>
                          {userStatus.status === 'active' && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
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
                      <div className="bg-slate-900/60 rounded-lg p-2.5 sm:p-3 border border-slate-700/50 text-center">
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                          <Smartphone className="w-4 h-4 text-blue-400 flex-shrink-0" />
                          <p className="text-slate-400 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] font-medium">Устройств</p>
                        </div>
                        <p className="text-white font-bold text-[clamp(1rem,0.95rem+0.25vw,1.25rem)]">
                          {currentUser.devices || currentTariff?.devices || 1}
                        </p>
                      </div>

                      {/* Период или Трафик */}
                      {currentUser.periodMonths ? (
                        <div className="bg-slate-900/60 rounded-lg p-2.5 sm:p-3 border border-slate-700/50 text-center">
                          <div className="flex items-center justify-center gap-1.5 mb-1">
                            <Calendar className="w-4 h-4 text-green-400 flex-shrink-0" />
                            <p className="text-slate-400 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] font-medium">Период</p>
                          </div>
                          <p className="text-white font-bold text-[clamp(1rem,0.95rem+0.25vw,1.25rem)]">
                            {currentUser.periodMonths} {currentUser.periodMonths === 1 ? 'мес' : 'мес'}
                          </p>
                        </div>
                      ) : (
                        (currentTariff || currentUser?.paymentStatus) && (
                          <div className="bg-slate-900/60 rounded-lg p-2.5 sm:p-3 border border-slate-700/50 text-center">
                            <div className="flex items-center justify-center gap-1.5 mb-1">
                              <Zap className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                              <p className="text-slate-400 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] font-medium">Трафик</p>
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
                            <p className="text-slate-400 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] font-medium">Трафик</p>
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
                            <p className="text-slate-400 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] mb-0.5">Период действия</p>
                            {timeRemaining && !timeRemaining.isExpired ? (
                              <div>
                                <p className={`font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] ${
                                  timeRemaining.days <= 3 && timeRemaining.months === 0 
                                    ? 'text-yellow-400' 
                                    : timeRemaining.days <= 7 && timeRemaining.months === 0
                                    ? 'text-orange-400'
                                    : 'text-white'
                                }`}>
                                  {formatTimeRemaining(currentUser.expiresAt)}
                                </p>
                                <p className="text-slate-500 text-[clamp(0.65rem,0.6rem+0.25vw,0.7rem)] mt-0.5">
                                  До {formatDate(currentUser.expiresAt)}
                                </p>
                              </div>
                            ) : (
                              <p className="text-red-400 font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)]">
                                Истекла
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <CreditCard className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-slate-400 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] mb-0.5">Оплата</p>
                          <p className={`font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] ${
                            currentUser.paymentStatus === 'paid' ? 'text-green-400' :
                            currentUser.paymentStatus === 'test_period' ? 'text-yellow-400' :
                            currentUser.paymentStatus === 'unpaid' ? 'text-red-400' :
                            'text-slate-300'
                          }`}>
                            {currentUser.paymentStatus === 'paid' ? 'Оплачено' : 
                             currentUser.paymentStatus === 'test_period' ? 'Тест' :
                             currentUser.paymentStatus === 'unpaid' ? 'Не оплачено' : 
                             '—'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Компактные предупреждения */}
                    <div className="space-y-2 sm:space-y-2.5">
                      {currentUser?.paymentStatus === 'test_period' && currentUser?.testPeriodEndDate && (
                        <div className="p-2.5 sm:p-3 bg-yellow-900/20 border border-yellow-800/50 rounded-lg">
                          <div className="flex items-start gap-2">
                            <Clock className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-yellow-400 font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)]">Тест до {formatDate(currentUser.testPeriodEndDate)}</p>
                                <p className="text-yellow-300/80 text-[clamp(0.65rem,0.6rem+0.25vw,0.75rem)] mt-0.5">После окончания подписка приостановится</p>
                              </div>
                              {onHandleRenewSubscription && (
                                <button
                                  onClick={async () => {
                                    setPaymentProcessingMessage('Формируем подписку...')
                                    setShowPaymentProcessing(true)
                                    try {
                                      const result = await onHandleRenewSubscription()
                                      setShowPaymentProcessing(false)
                                      if (result && result.paymentUrl && result.requiresPayment) {
                                        const windowFeatures = ['width=400', 'height=700', 'left=' + (window.screen.width / 2 - 200), 'top=' + (window.screen.height / 2 - 350), 'resizable=yes', 'scrollbars=yes', 'status=no', 'toolbar=no', 'menubar=no', 'location=no'].join(',')
                                        const paymentWindow = window.open(result.paymentUrl, 'payment_miniapp', windowFeatures)
                                        if (paymentWindow) paymentWindow.focus()
                                        setSubscriptionSuccess({ vpnLink: null, paymentUrl: result.paymentUrl, orderId: result.orderId, amount: result.amount, requiresPayment: true, message: 'Окно оплаты открыто. Завершите оплату для активации подписки.', tariffName: currentUser.tariffName || 'Не указан', devices: currentUser.devices || 1, periodMonths: currentUser.periodMonths || 1 })
                                        setShowSuccessModal(true)
                                      }
                                    } catch (error) {
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
                                  {isExpired ? 'Подписка будет удалена' : `Требуется оплата (${daysLeft} ${daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'})`}
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
                                    setPaymentProcessingMessage('Формируем подписку...')
                                    setShowPaymentProcessing(true)
                                    try {
                                      const result = await onHandleRenewSubscription()
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
                                        setSubscriptionSuccess({ vpnLink: null, paymentUrl: result.paymentUrl, orderId: result.orderId, amount: result.amount, requiresPayment: true, message: 'Окно оплаты открыто. Завершите оплату для активации подписки.', tariffName: currentUser.tariffName || 'Не указан', devices: currentUser.devices || 1, periodMonths: currentUser.periodMonths || 1 })
                                        setShowSuccessModal(true)
                                      }
                                    } catch (error) {
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

                    {/* Компактный блок управления подключением */}
                    <div className="mt-3 p-2.5 sm:p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 flex items-center justify-center">
                      {currentUser.uuid ? (
                        <button
                          onClick={() => onSetShowKeyModal(true)}
                          className="btn-icon-only-mobile min-h-[40px] w-full sm:w-auto px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] rounded-lg transition-all flex items-center justify-center gap-2 touch-manipulation whitespace-nowrap"
                          aria-label="Конфигурация"
                        >
                          <Globe className="w-4 h-4 flex-shrink-0" />
                          <span className="btn-text">Конфигурация</span>
                        </button>
                      ) : (
                        <button
                          onClick={onGetKey}
                          className="btn-icon-only-mobile min-h-[40px] w-full sm:w-auto px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] rounded-lg transition-all flex items-center justify-center gap-2 touch-manipulation whitespace-nowrap"
                          aria-label="Получить ключ"
                        >
                          <Shield className="w-4 h-4 flex-shrink-0" />
                          <span className="btn-text">Получить ключ</span>
                        </button>
                      )}
                    </div>

                    {/* Компактная кнопка продления для expired статуса */}
                    {userStatus.status === 'expired' && (
                      <div className="mt-3">
                        <button
                          onClick={async () => {
                            setPaymentProcessingMessage('Формируем подписку...')
                            setShowPaymentProcessing(true)
                            try {
                              const result = await onHandleRenewSubscription()
                              setShowPaymentProcessing(false)
                              if (result && result.paymentUrl && result.requiresPayment) {
                                const windowFeatures = ['width=400', 'height=700', 'left=' + (window.screen.width / 2 - 200), 'top=' + (window.screen.height / 2 - 350), 'resizable=yes', 'scrollbars=yes', 'status=no', 'toolbar=no', 'menubar=no', 'location=no'].join(',')
                                const paymentWindow = window.open(result.paymentUrl, 'payment_miniapp', windowFeatures)
                                if (paymentWindow) paymentWindow.focus()
                                setSubscriptionSuccess({ vpnLink: null, paymentUrl: result.paymentUrl, orderId: result.orderId, amount: result.amount, requiresPayment: true, message: 'Окно оплаты открыто. Завершите оплату для активации подписки.', tariffName: currentUser.tariffName || 'Не указан', devices: currentUser.devices || 1, periodMonths: currentUser.periodMonths || 1 })
                                setShowSuccessModal(true)
                              }
                            } catch (error) {
                              setShowPaymentProcessing(false)
                            }
                          }}
                          disabled={creatingSubscription || showPaymentProcessing}
                          className="w-full min-h-[40px] px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center gap-2 touch-manipulation"
                          aria-label="Продлить подписку"
                        >
                          <Calendar className="w-4 h-4 flex-shrink-0" />
                          <span>{creatingSubscription || showPaymentProcessing ? 'Продление...' : 'Продлить подписку'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200 mb-3 sm:mb-4">Выберите тариф</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
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
                      <div key={tariff.id} className="bg-slate-800 rounded-lg sm:rounded-xl p-4 sm:p-5 border border-slate-700 flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-[clamp(1.25rem,1.15rem+0.5vw,1.75rem)] font-bold text-white">{tariff.name}</h3>
                          {isSuper && (
                            <span className="px-2 py-1 bg-blue-600 text-white text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] sm:text-xs font-bold rounded-full">ХИТ</span>
                          )}
                        </div>
                        <div className="mb-3 sm:mb-4">
                          <span className="text-[clamp(1.5rem,1.4rem+0.5vw,2rem)] font-bold text-blue-400">{tariff.price}</span>
                          <span className="text-slate-400 ml-1.5 sm:ml-2 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">₽/мес</span>
                        </div>
                        <ul className="space-y-1.5 sm:space-y-2 mb-4 sm:mb-5 flex-1">
                          {features.map((feature, index) => (
                            <li key={index} className="flex items-center gap-2 text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">
                              <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                        <button
                          onClick={() => handleTariffSelect(tariff)}
                          disabled={creatingSubscription}
                          className="w-full min-h-[44px] px-4 sm:px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all flex items-center justify-center touch-manipulation mt-auto"
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
                    <span>Не сгенерирован</span>
                  </div>
                )}
                <p className="text-slate-500 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] mt-1.5">Используется для формирования ссылки на подписку</p>
              </div>

              <div>
                <label htmlFor={editingProfile ? "profile-name" : undefined} className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-bold mb-1.5 sm:mb-2">Имя</label>
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
                <label htmlFor={editingProfile ? "profile-phone" : undefined} className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-bold mb-1.5 sm:mb-2">Номер телефона</label>
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
            servers={servers}
          />
        )}

        {/* Модальное окно обработки платежа */}
        {showPaymentProcessing && (
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
                setPaymentProcessingMessage('Формируем подписку...')
              }
            }}
          />
        )}

        {/* Модальное окно успешного оформления подписки */}
        {showSuccessModal && subscriptionSuccess && (
          <SubscriptionSuccessModal
            vpnLink={subscriptionSuccess.vpnLink}
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

