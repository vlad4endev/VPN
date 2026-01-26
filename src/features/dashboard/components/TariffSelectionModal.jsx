import { useState, useEffect } from 'react'
import { X, Check, Loader2, AlertCircle, Clock } from 'lucide-react'
import logger from '../../../shared/utils/logger.js'

const TariffSelectionModal = ({ 
  tariff, 
  onClose, 
  onConfirm, 
  isLoading = false,
  natrockPorts = [],
  settings = null,
  servers = []
}) => {
  const [selectedDevices, setSelectedDevices] = useState(1)
  const [selectedPort, setSelectedPort] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState(1) // Период в месяцах (1, 3, 6, 12)
  const [confirmed, setConfirmed] = useState(false)
  const [paymentMode, setPaymentMode] = useState(null) // 'pay_now' или 'pay_later'

  const isSuper = tariff?.name?.toLowerCase() === 'super' || tariff?.plan?.toLowerCase() === 'super'
  const isMulti = tariff?.name?.toLowerCase() === 'multi' || tariff?.plan?.toLowerCase() === 'multi'

  // Для MULTI тарифа: находим серверы с отметкой multi (через tariffIds)
  const multiServers = isMulti && tariff?.id 
    ? servers.filter(server => 
        server.active && 
        server.tariffIds && 
        Array.isArray(server.tariffIds) && 
        server.tariffIds.includes(tariff.id)
      )
    : []

  // Для SUPER тарифа: расчет итоговой стоимости с учетом периода и скидки
  // Используем цену из тарифа (цена за устройство за месяц)
  const devicePrice = tariff?.price || 150 // Цена одного устройства в рублях за месяц (из настроек тарифа)
  const baseMonthlyPrice = selectedDevices * devicePrice
  const totalMonthlyPrice = baseMonthlyPrice * selectedPeriod
  
  // Для MULTI тарифа: расчет итоговой стоимости с учетом периода и скидки
  // Используем цену из тарифа (цена за месяц)
  const multiBasePrice = tariff?.price || 0 // Цена тарифа MULTI за месяц
  const multiTotalMonthlyPrice = multiBasePrice * selectedPeriod
  
  // Скидка 10% для годовой оплаты (12 месяцев) - для обоих тарифов
  const discount = selectedPeriod === 12 ? 0.1 : 0
  const discountAmount = discount > 0 ? (isSuper ? totalMonthlyPrice : multiTotalMonthlyPrice) * discount : 0
  const totalPrice = (isSuper ? totalMonthlyPrice : multiTotalMonthlyPrice) - discountAmount

  const handleConfirm = () => {
    logger.debug('TariffSelectionModal', 'handleConfirm вызван', {
      confirmed,
      paymentMode,
      isMulti,
      isSuper,
      selectedDevices,
      selectedPeriod
    })
    
    if (!confirmed) {
      logger.debug('TariffSelectionModal', 'Первое подтверждение - показываем выбор оплаты')
      setConfirmed(true)
      return
    }

    // Если не выбран режим оплаты, показываем выбор (не должно происходить, так как кнопки вызывают напрямую)
    if (confirmed && !paymentMode) {
      logger.warn('TariffSelectionModal', 'Режим оплаты не выбран, но confirmed=true')
      return
    }

    // После выбора режима оплаты - вызываем обработчик
    const subscriptionData = {
      tariff,
      devices: isSuper ? selectedDevices : (tariff?.devices || 1),
      natrockPort: null, // Для MULTI больше не используется натрек-порт
      totalPrice: totalPrice,
      periodMonths: selectedPeriod, // Для обоих тарифов используется выбранный период
      discount: discount,
      discountAmount: discountAmount,
      paymentMode: paymentMode, // 'pay_now' или 'pay_later'
      testPeriod: paymentMode === 'pay_later', // Тестовый период если оплата позже
    }

    logger.debug('TariffSelectionModal', 'Вызов onConfirm с данными', {
      tariffName: tariff?.name,
      tariffId: tariff?.id,
      devices: subscriptionData.devices,
      periodMonths: subscriptionData.periodMonths,
      paymentMode: subscriptionData.paymentMode,
      testPeriod: subscriptionData.testPeriod,
      totalPrice: subscriptionData.totalPrice
    })

    if (!onConfirm || typeof onConfirm !== 'function') {
      logger.error('TariffSelectionModal', 'onConfirm не является функцией', { type: typeof onConfirm })
      alert('Ошибка: обработчик подтверждения не настроен')
      return
    }

    try {
      onConfirm(subscriptionData)
    } catch (error) {
      logger.error('TariffSelectionModal', 'Ошибка при вызове onConfirm', null, error)
      alert('Ошибка при обработке выбора: ' + error.message)
    }
  }

  const handlePayLater = () => {
    logger.debug('TariffSelectionModal', 'Выбрана оплата позже (тестовый период)')
    
    // Формируем данные подписки
    const subscriptionData = {
      tariff,
      devices: isSuper ? selectedDevices : (tariff?.devices || 1),
      natrockPort: null, // Для MULTI больше не используется натрек-порт
      totalPrice: totalPrice,
      periodMonths: selectedPeriod, // Для обоих тарифов используется выбранный период
      discount: discount,
      discountAmount: discountAmount,
      paymentMode: 'pay_later',
      testPeriod: true,
    }

    logger.debug('TariffSelectionModal', 'Вызов onConfirm (pay_later)', {
      tariffName: subscriptionData.tariff?.name,
      devices: subscriptionData.devices,
      periodMonths: subscriptionData.periodMonths,
      paymentMode: subscriptionData.paymentMode,
      testPeriod: subscriptionData.testPeriod,
      totalPrice: subscriptionData.totalPrice
    })
    
    // Обновляем состояние для UI
    setPaymentMode('pay_later')
    setConfirmed(true)
    
    // Вызываем обработчик напрямую
    if (!onConfirm) {
      logger.error('TariffSelectionModal', 'onConfirm не передан в handlePayLater')
      alert('Ошибка: обработчик подтверждения не настроен. Обратитесь к администратору.')
      return
    }
    
    if (typeof onConfirm !== 'function') {
      logger.error('TariffSelectionModal', 'onConfirm не является функцией в handlePayLater', { type: typeof onConfirm })
      alert('Ошибка: обработчик подтверждения имеет неправильный тип. Обратитесь к администратору.')
      return
    }
    
    try {
      logger.debug('TariffSelectionModal', 'Вызов onConfirm с данными подписки (pay_later)')
      
      // Вызываем onConfirm - он должен быть асинхронной функцией
      const promise = onConfirm(subscriptionData)
      
      // Если это Promise, обрабатываем его
      if (promise && typeof promise.then === 'function') {
        promise
          .then(() => {
            logger.debug('TariffSelectionModal', 'onConfirm (Promise) выполнен успешно (pay_later)')
          })
          .catch((error) => {
            logger.error('TariffSelectionModal', 'Ошибка в Promise onConfirm (pay_later)', null, error)
            alert('Ошибка при обработке: ' + (error.message || 'Неизвестная ошибка'))
          })
      } else {
        logger.debug('TariffSelectionModal', 'onConfirm вызван (не Promise, pay_later)')
      }
    } catch (error) {
      logger.error('TariffSelectionModal', 'Синхронная ошибка при вызове onConfirm (pay_later)', null, error)
      alert('Ошибка при обработке выбора: ' + (error.message || 'Неизвестная ошибка'))
    }
  }

  const handlePayNow = () => {
    logger.debug('TariffSelectionModal', 'Выбрана оплата сейчас')
    
    // Формируем данные подписки
    const subscriptionData = {
      tariff,
      devices: isSuper ? selectedDevices : (tariff?.devices || 1),
      natrockPort: null, // Для MULTI больше не используется натрек-порт
      totalPrice: totalPrice,
      periodMonths: selectedPeriod, // Для обоих тарифов используется выбранный период
      discount: discount,
      discountAmount: discountAmount,
      paymentMode: 'pay_now',
      testPeriod: false,
    }

    logger.debug('TariffSelectionModal', 'Формирование данных завершено (pay_now)', {
      tariffName: subscriptionData.tariff?.name,
      tariffId: subscriptionData.tariff?.id,
      devices: subscriptionData.devices,
      periodMonths: subscriptionData.periodMonths,
      paymentMode: subscriptionData.paymentMode,
      testPeriod: subscriptionData.testPeriod,
      totalPrice: subscriptionData.totalPrice
    })
    
    // Обновляем состояние для UI
    setPaymentMode('pay_now')
    setConfirmed(true)
    
    // Вызываем обработчик напрямую
    if (!onConfirm) {
      logger.error('TariffSelectionModal', 'onConfirm не передан в handlePayNow')
      alert('Ошибка: обработчик подтверждения не настроен. Обратитесь к администратору.')
      return
    }
    
    if (typeof onConfirm !== 'function') {
      logger.error('TariffSelectionModal', 'onConfirm не является функцией в handlePayNow', { type: typeof onConfirm })
      alert('Ошибка: обработчик подтверждения имеет неправильный тип. Обратитесь к администратору.')
      return
    }
    
    try {
      logger.debug('TariffSelectionModal', 'Вызов onConfirm с данными подписки (pay_now)')
      
      // Вызываем onConfirm - он должен быть асинхронной функцией
      const promise = onConfirm(subscriptionData)
      
      // Если это Promise, обрабатываем его
      if (promise && typeof promise.then === 'function') {
        promise
          .then(() => {
            logger.debug('TariffSelectionModal', 'onConfirm (Promise) выполнен успешно (pay_now)')
          })
          .catch((error) => {
            logger.error('TariffSelectionModal', 'Ошибка в Promise onConfirm (pay_now)', null, error)
            alert('Ошибка при обработке: ' + (error.message || 'Неизвестная ошибка'))
          })
      } else {
        logger.debug('TariffSelectionModal', 'onConfirm вызван (не Promise, pay_now)')
      }
    } catch (error) {
      logger.error('TariffSelectionModal', 'Синхронная ошибка при вызове onConfirm (pay_now)', null, error)
      alert('Ошибка при обработке выбора: ' + (error.message || 'Неизвестная ошибка'))
    }
  }

  const handleCancel = () => {
    setConfirmed(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-2 md:p-4 bg-black/60 backdrop-blur-md overflow-y-auto" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-800 w-full sm:max-w-[90vw] md:max-w-md rounded-none sm:rounded-xl md:rounded-2xl shadow-2xl min-h-full sm:min-h-0 sm:my-4 sm:max-h-[90vh] sm:overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 sm:p-4 md:p-6 border-b border-slate-800 flex justify-between items-center gap-3">
          <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.25rem)] sm:text-xl font-bold text-white flex-1 min-w-0">
            Выбор тарифа {tariff?.name}
          </h3>
          <button 
            onClick={handleCancel}
            disabled={isLoading}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
            aria-label="Закрыть"
          >
            <X size={20} className="sm:w-6 sm:h-6 text-slate-400" />
          </button>
        </div>

        <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-5 md:space-y-6">
          {/* Для SUPER тарифа: выбор количества устройств и периода */}
          {isSuper && (
            <div className="space-y-4">
              <div>
                <label className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-medium mb-1.5 sm:mb-2">
                  Количество устройств
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setSelectedDevices(num)
                        setConfirmed(false)
                        setPaymentMode(null)
                      }}
                      disabled={isLoading || confirmed}
                      className={`min-h-[44px] px-2 py-2.5 sm:py-3 rounded-lg border-2 transition-all font-semibold text-[clamp(0.875rem,0.8rem+0.25vw,1.125rem)] sm:text-lg ${
                        selectedDevices === num
                          ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                          : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                      } disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-medium mb-1.5 sm:mb-2">
                  Период оплаты
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { months: 1, label: '1 месяц' },
                    { months: 3, label: '3 месяца' },
                    { months: 6, label: '6 месяцев' },
                    { months: 12, label: 'Год', badge: '−10%' },
                  ].map((option) => (
                    <button
                      key={option.months}
                      type="button"
                      onClick={() => {
                        setSelectedPeriod(option.months)
                        setConfirmed(false)
                        setPaymentMode(null)
                      }}
                      disabled={isLoading || confirmed}
                      className={`min-h-[44px] px-2 sm:px-3 py-2.5 sm:py-3 rounded-lg border-2 transition-all font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm ${
                        selectedPeriod === option.months
                          ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                          : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                      } disabled:opacity-50 disabled:cursor-not-allowed relative touch-manipulation`}
                    >
                      {option.label}
                      {option.badge && (
                        <span className="absolute -top-1.5 sm:-top-2 -right-1.5 sm:-right-2 bg-green-500 text-white text-[clamp(0.65rem,0.6rem+0.25vw,0.75rem)] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded-full font-bold">
                          {option.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-800 rounded-lg sm:rounded-xl p-3 sm:p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Цена за устройство (мес.):</span>
                  <span className="text-slate-300 font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">{devicePrice} ₽</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Количество устройств:</span>
                  <span className="text-slate-300 font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">{selectedDevices}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Период:</span>
                  <span className="text-slate-300 font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">
                    {selectedPeriod === 1 ? '1 месяц' :
                     selectedPeriod === 3 ? '3 месяца' :
                     selectedPeriod === 6 ? '6 месяцев' :
                     'Год'}
                  </span>
                </div>
                <div className="flex justify-between items-center flex-wrap gap-1">
                  <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm break-words">Стоимость ({selectedPeriod} {selectedPeriod === 1 ? 'месяц' : selectedPeriod < 5 ? 'месяца' : 'месяцев'}):</span>
                  <span className="text-slate-300 font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">{totalMonthlyPrice.toFixed(2)} ₽</span>
                </div>
                {discount > 0 && (
                  <>
                    <div className="flex justify-between items-center text-green-400">
                      <span className="font-medium text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Скидка ({Math.round(discount * 100)}%):</span>
                      <span className="font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">−{discountAmount.toFixed(2)} ₽</span>
                    </div>
                  </>
                )}
                <div className="border-t border-slate-700 mt-2 sm:mt-3 pt-2 sm:pt-3 flex justify-between items-center">
                  <span className="text-white font-bold text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg">Итого:</span>
                  <span className="text-blue-400 font-bold text-[clamp(1.5rem,1.3rem+1vw,2.25rem)] sm:text-2xl">{totalPrice.toFixed(2)} ₽</span>
                </div>
              </div>

              {!confirmed && (
                <p className="text-slate-400 text-sm text-center">
                  Нажмите "Подтвердить" для продолжения
                </p>
              )}
            </div>
          )}

          {/* Для Multi тарифа: выбор периода оплаты (как в SUPER) */}
          {isMulti && (
            <div className="space-y-4">
              <div>
                <label className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-medium mb-1.5 sm:mb-2">
                  Период оплаты
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { months: 1, label: '1 месяц' },
                    { months: 3, label: '3 месяца' },
                    { months: 6, label: '6 месяцев' },
                    { months: 12, label: 'Год', badge: '−10%' },
                  ].map((option) => (
                    <button
                      key={option.months}
                      type="button"
                      onClick={() => {
                        setSelectedPeriod(option.months)
                        setConfirmed(false)
                        setPaymentMode(null)
                      }}
                      disabled={isLoading || confirmed}
                      className={`min-h-[44px] px-2 sm:px-3 py-2.5 sm:py-3 rounded-lg border-2 transition-all font-semibold text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm ${
                        selectedPeriod === option.months
                          ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                          : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                      } disabled:opacity-50 disabled:cursor-not-allowed relative touch-manipulation`}
                    >
                      {option.label}
                      {option.badge && (
                        <span className="absolute -top-1.5 sm:-top-2 -right-1.5 sm:-right-2 bg-green-500 text-white text-[clamp(0.65rem,0.6rem+0.25vw,0.75rem)] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded-full font-bold">
                          {option.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-800 rounded-lg sm:rounded-xl p-3 sm:p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Тариф:</span>
                  <span className="text-white font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">{tariff?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Цена за месяц:</span>
                  <span className="text-slate-300 font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">{multiBasePrice} ₽</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Период:</span>
                  <span className="text-slate-300 font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">
                    {selectedPeriod === 1 ? '1 месяц' :
                     selectedPeriod === 3 ? '3 месяца' :
                     selectedPeriod === 6 ? '6 месяцев' :
                     'Год'}
                  </span>
                </div>
                <div className="flex justify-between items-center flex-wrap gap-1">
                  <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm break-words">Стоимость ({selectedPeriod} {selectedPeriod === 1 ? 'месяц' : selectedPeriod < 5 ? 'месяца' : 'месяцев'}):</span>
                  <span className="text-slate-300 font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">{multiTotalMonthlyPrice.toFixed(2)} ₽</span>
                </div>
                {discount > 0 && (
                  <>
                    <div className="flex justify-between items-center text-green-400">
                      <span className="font-medium text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Скидка ({Math.round(discount * 100)}%):</span>
                      <span className="font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">−{discountAmount.toFixed(2)} ₽</span>
                    </div>
                  </>
                )}
                <div className="border-t border-slate-700 mt-2 sm:mt-3 pt-2 sm:pt-3 flex justify-between items-center">
                  <span className="text-white font-bold text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg">Итого:</span>
                  <span className="text-blue-400 font-bold text-[clamp(1.5rem,1.3rem+1vw,2.25rem)] sm:text-2xl">{totalPrice.toFixed(2)} ₽</span>
                </div>
              </div>

              {multiServers.length > 0 && (
                <div className="bg-blue-900/20 border border-blue-800 rounded-lg sm:rounded-xl p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-blue-400 mb-2">
                    <AlertCircle size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
                    <span className="font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Доступные серверы</span>
                  </div>
                  <p className="text-slate-300 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">
                    Найдено {multiServers.length} {multiServers.length === 1 ? 'сервер' : multiServers.length < 5 ? 'сервера' : 'серверов'} с отметкой MULTI
                  </p>
                </div>
              )}

              {!confirmed && (
                <p className="text-slate-400 text-sm text-center">
                  Нажмите "Подтвердить" для продолжения
                </p>
              )}
            </div>
          )}

          {/* Подтверждение - Mobile First */}
          {confirmed && !paymentMode && (
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg sm:rounded-xl p-3 sm:p-4">
              <div className="flex items-center gap-2 text-blue-400 mb-2">
                <Check size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
                <span className="font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Подтверждение выбора</span>
              </div>
              <p className="text-slate-300 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm mb-3 sm:mb-4 break-words">
                Вы подтверждаете выбор тарифа "{tariff?.name}" 
                {isSuper && (
                  <>
                    {' '}на {selectedDevices} {selectedDevices === 1 ? 'устройство' : 'устройства'}
                    {' '}на {selectedPeriod === 1 ? '1 месяц' :
                            selectedPeriod === 3 ? '3 месяца' :
                            selectedPeriod === 6 ? '6 месяцев' :
                            'год'}
                    {' '}за {totalPrice.toFixed(2)} ₽
                    {discount > 0 && <span className="text-green-400 ml-1">(со скидкой {Math.round(discount * 100)}%)</span>}
                  </>
                )}
                {isMulti && (
                  <>
                    {' '}на {selectedPeriod === 1 ? '1 месяц' :
                            selectedPeriod === 3 ? '3 месяца' :
                            selectedPeriod === 6 ? '6 месяцев' :
                            'год'}
                    {' '}за {totalPrice.toFixed(2)} ₽
                    {discount > 0 && <span className="text-green-400 ml-1">(со скидкой {Math.round(discount * 100)}%)</span>}
                  </>
                )}?
              </p>
              
              {/* Выбор режима оплаты */}
              <div className="space-y-2">
                <p className="text-slate-400 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] sm:text-xs font-medium mb-2">Выберите способ оплаты:</p>
                <button
                  onClick={handlePayNow}
                  disabled={isLoading}
                  className="w-full min-h-[44px] px-4 py-3 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-lg font-semibold text-[clamp(0.75rem,0.7rem+0.35vw,1rem)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-manipulation"
                  aria-label="Оплатить сейчас"
                >
                  <Check size={18} className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                  <span>Оплатить сейчас</span>
                </button>
                <button
                  onClick={handlePayLater}
                  disabled={isLoading}
                  className="w-full min-h-[44px] px-4 py-3 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg font-semibold text-[clamp(0.75rem,0.7rem+0.35vw,1rem)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-manipulation"
                  aria-label="Оплатить позже, тест 24 часа"
                >
                  <Clock size={18} className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                  <span>Оплатить позже (тест 24 часа)</span>
                </button>
                <p className="text-slate-500 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] sm:text-xs text-center mt-2 break-words">
                  При выборе "Оплатить позже" вы получите доступ на 24 часа для тестирования
                </p>
              </div>
            </div>
          )}

              {confirmed && paymentMode === 'pay_later' && (
            <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg sm:rounded-xl p-3 sm:p-4">
              <div className="flex items-center gap-2 text-yellow-400 mb-2">
                <Clock size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
                <span className="font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Тестовый период будет активирован</span>
              </div>
              <p className="text-slate-300 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm break-words">
                После подтверждения вам будет предоставлен тестовый период на 24 часа. 
                В течение этого времени VPN будет работать бесплатно. 
                После окончания тестового периода подписка будет приостановлена до оплаты.
              </p>
            </div>
          )}

          {/* Кнопки действий - Mobile First, подписи всегда видимы */}
          {!confirmed && (
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-3 sm:pt-4">
              <button
                onClick={handleConfirm}
                disabled={
                  isLoading || 
                  (isSuper && selectedDevices < 1)
                }
                className="min-h-[44px] flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-semibold text-[clamp(0.75rem,0.7rem+0.35vw,1rem)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-manipulation"
                aria-label="Подтвердить"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="w-4 h-4 sm:w-5 sm:h-5 animate-spin flex-shrink-0" />
                    <span>Оформление...</span>
                  </>
                ) : (
                  <span>Подтвердить</span>
                )}
              </button>
              <button
                onClick={handleCancel}
                disabled={isLoading}
                className="min-h-[44px] flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg font-semibold text-[clamp(0.75rem,0.7rem+0.35vw,1rem)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center touch-manipulation"
                aria-label="Отмена"
              >
                <span>Отмена</span>
              </button>
            </div>
          )}

          {/* Кнопка отмены при выборе режима оплаты - Mobile First */}
          {confirmed && paymentMode && (
            <div className="flex gap-3 pt-3 sm:pt-4">
              <button
                onClick={() => {
                  setConfirmed(false)
                  setPaymentMode(null)
                }}
                disabled={isLoading}
                className="min-h-[44px] flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                aria-label="Назад"
              >
                Назад
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TariffSelectionModal
