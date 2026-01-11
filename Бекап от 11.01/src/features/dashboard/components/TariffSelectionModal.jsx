import { useState, useEffect } from 'react'
import { X, Check, Loader2, AlertCircle, Clock } from 'lucide-react'

const TariffSelectionModal = ({ 
  tariff, 
  onClose, 
  onConfirm, 
  isLoading = false,
  natrockPorts = [],
  settings = null
}) => {
  const [selectedDevices, setSelectedDevices] = useState(1)
  const [selectedPort, setSelectedPort] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState(1) // Период в месяцах (1, 3, 6, 12)
  const [confirmed, setConfirmed] = useState(false)
  const [paymentMode, setPaymentMode] = useState(null) // 'pay_now' или 'pay_later'

  const isSuper = tariff?.name?.toLowerCase() === 'super' || tariff?.plan?.toLowerCase() === 'super'
  const isMulti = tariff?.name?.toLowerCase() === 'multi' || tariff?.plan?.toLowerCase() === 'multi'

  // Загружаем натрек-порты из настроек для Multi тарифа
  useEffect(() => {
    if (isMulti && settings?.natrockPorts && settings.natrockPorts.length > 0) {
      setSelectedPort(settings.natrockPorts[0])
    }
  }, [isMulti, settings])

  // Для SUPER тарифа: расчет итоговой стоимости с учетом периода и скидки
  const devicePrice = 150 // Цена одного устройства в рублях за месяц
  const baseMonthlyPrice = selectedDevices * devicePrice
  const totalMonthlyPrice = baseMonthlyPrice * selectedPeriod
  
  // Скидка 10% для годовой оплаты (12 месяцев)
  const discount = selectedPeriod === 12 ? 0.1 : 0
  const discountAmount = discount > 0 ? totalMonthlyPrice * discount : 0
  const totalPrice = totalMonthlyPrice - discountAmount

  const handleConfirm = () => {
    console.log('🔘 TariffSelectionModal.handleConfirm вызван', {
      confirmed,
      paymentMode,
      isMulti,
      selectedPort,
      isSuper,
      selectedDevices
    })

    if (isMulti && !selectedPort) {
      console.warn('⚠️ TariffSelectionModal: Порт не выбран для Multi тарифа')
      alert('Пожалуйста, выберите натрек-порт для тарифа Multi')
      return
    }
    
    if (!confirmed) {
      console.log('📝 TariffSelectionModal: Первое подтверждение - показываем выбор оплаты')
      setConfirmed(true)
      return
    }

    // Если не выбран режим оплаты, показываем выбор (не должно происходить, так как кнопки вызывают напрямую)
    if (confirmed && !paymentMode) {
      console.warn('⚠️ TariffSelectionModal: Режим оплаты не выбран, но confirmed=true')
      return
    }

    // После выбора режима оплаты - вызываем обработчик
    const subscriptionData = {
      tariff,
      devices: isSuper ? selectedDevices : (tariff?.devices || 1),
      natrockPort: isMulti ? selectedPort : null,
      totalPrice: isSuper ? totalPrice : tariff?.price || 0,
      periodMonths: isSuper ? selectedPeriod : 1,
      discount: discount,
      discountAmount: discountAmount,
      paymentMode: paymentMode, // 'pay_now' или 'pay_later'
      testPeriod: paymentMode === 'pay_later', // Тестовый период если оплата позже
    }

    console.log('✅ TariffSelectionModal.handleConfirm: Вызов onConfirm с данными:', {
      tariffName: tariff?.name,
      tariffId: tariff?.id,
      devices: subscriptionData.devices,
      periodMonths: subscriptionData.periodMonths,
      paymentMode: subscriptionData.paymentMode,
      testPeriod: subscriptionData.testPeriod,
      totalPrice: subscriptionData.totalPrice,
      hasOnConfirm: typeof onConfirm === 'function'
    })

    if (!onConfirm || typeof onConfirm !== 'function') {
      console.error('❌ TariffSelectionModal: onConfirm не является функцией!', typeof onConfirm, onConfirm)
      alert('Ошибка: обработчик подтверждения не настроен')
      return
    }

    try {
      onConfirm(subscriptionData)
    } catch (error) {
      console.error('❌ TariffSelectionModal: Ошибка при вызове onConfirm:', error)
      alert('Ошибка при обработке выбора: ' + error.message)
    }
  }

  const handlePayLater = () => {
    console.log('⏰ TariffSelectionModal: Выбрана оплата позже (тестовый период)')
    
    // Проверка для Multi тарифа
    if (isMulti && !selectedPort) {
      console.error('❌ TariffSelectionModal: Порт не выбран для Multi тарифа')
      alert('Пожалуйста, выберите натрек-порт для тарифа Multi')
      return
    }
    
    // Формируем данные подписки
    const subscriptionData = {
      tariff,
      devices: isSuper ? selectedDevices : (tariff?.devices || 1),
      natrockPort: isMulti ? selectedPort : null,
      totalPrice: isSuper ? totalPrice : tariff?.price || 0,
      periodMonths: isSuper ? selectedPeriod : 1,
      discount: discount,
      discountAmount: discountAmount,
      paymentMode: 'pay_later',
      testPeriod: true,
    }

    console.log('✅ TariffSelectionModal: Вызов onConfirm (pay_later) с данными:', {
      tariffName: subscriptionData.tariff?.name,
      devices: subscriptionData.devices,
      periodMonths: subscriptionData.periodMonths,
      paymentMode: subscriptionData.paymentMode,
      testPeriod: subscriptionData.testPeriod,
      totalPrice: subscriptionData.totalPrice
    })
    
    // Обновляем состояние для UI (хотя оно уже не будет видно, так как модальное окно закроется)
    setPaymentMode('pay_later')
    setConfirmed(true)
    
    // Обновляем состояние для UI
    setPaymentMode('pay_later')
    setConfirmed(true)
    
    // Вызываем обработчик напрямую
    console.log('🔄 TariffSelectionModal.handlePayLater: Проверка onConfirm перед вызовом')
    if (!onConfirm) {
      console.error('❌ TariffSelectionModal.handlePayLater: onConfirm не передан!', onConfirm)
      alert('Ошибка: обработчик подтверждения не настроен. Обратитесь к администратору.')
      return
    }
    
    if (typeof onConfirm !== 'function') {
      console.error('❌ TariffSelectionModal.handlePayLater: onConfirm не является функцией!', typeof onConfirm, onConfirm)
      alert('Ошибка: обработчик подтверждения имеет неправильный тип. Обратитесь к администратору.')
      return
    }
    
    try {
      console.log('🚀 TariffSelectionModal.handlePayLater: Вызов onConfirm с данными подписки')
      console.log('📋 Данные подписки (pay_later):', JSON.stringify(subscriptionData, null, 2))
      
      // Вызываем onConfirm - он должен быть асинхронной функцией
      const promise = onConfirm(subscriptionData)
      
      // Если это Promise, обрабатываем его
      if (promise && typeof promise.then === 'function') {
        promise
          .then(() => {
            console.log('✅ TariffSelectionModal.handlePayLater: onConfirm (Promise) выполнен успешно')
          })
          .catch((error) => {
            console.error('❌ TariffSelectionModal.handlePayLater: Ошибка в Promise onConfirm:', error)
            alert('Ошибка при обработке: ' + (error.message || 'Неизвестная ошибка'))
          })
      } else {
        console.log('✅ TariffSelectionModal.handlePayLater: onConfirm вызван (не Promise)')
      }
    } catch (error) {
      console.error('❌ TariffSelectionModal.handlePayLater: Синхронная ошибка при вызове onConfirm:', error)
      alert('Ошибка при обработке выбора: ' + (error.message || 'Неизвестная ошибка'))
    }
  }

  const handlePayNow = () => {
    console.log('💰 TariffSelectionModal.handlePayNow: Выбрана оплата сейчас')
    
    // Проверка для Multi тарифа
    if (isMulti && !selectedPort) {
      console.error('❌ TariffSelectionModal.handlePayNow: Порт не выбран для Multi тарифа')
      alert('Пожалуйста, выберите натрек-порт для тарифа Multi')
      return
    }
    
    // Формируем данные подписки
    const subscriptionData = {
      tariff,
      devices: isSuper ? selectedDevices : (tariff?.devices || 1),
      natrockPort: isMulti ? selectedPort : null,
      totalPrice: isSuper ? totalPrice : tariff?.price || 0,
      periodMonths: isSuper ? selectedPeriod : 1,
      discount: discount,
      discountAmount: discountAmount,
      paymentMode: 'pay_now',
      testPeriod: false,
    }

    console.log('✅ TariffSelectionModal.handlePayNow: Формирование данных завершено:', {
      tariffName: subscriptionData.tariff?.name,
      tariffId: subscriptionData.tariff?.id,
      devices: subscriptionData.devices,
      periodMonths: subscriptionData.periodMonths,
      paymentMode: subscriptionData.paymentMode,
      testPeriod: subscriptionData.testPeriod,
      totalPrice: subscriptionData.totalPrice,
      hasOnConfirm: typeof onConfirm === 'function'
    })
    
    // Обновляем состояние для UI
    setPaymentMode('pay_now')
    setConfirmed(true)
    
    // Вызываем обработчик напрямую
    console.log('🔄 TariffSelectionModal.handlePayNow: Проверка onConfirm перед вызовом')
    if (!onConfirm) {
      console.error('❌ TariffSelectionModal.handlePayNow: onConfirm не передан!', onConfirm)
      alert('Ошибка: обработчик подтверждения не настроен. Обратитесь к администратору.')
      return
    }
    
    if (typeof onConfirm !== 'function') {
      console.error('❌ TariffSelectionModal.handlePayNow: onConfirm не является функцией!', typeof onConfirm, onConfirm)
      alert('Ошибка: обработчик подтверждения имеет неправильный тип. Обратитесь к администратору.')
      return
    }
    
    try {
      console.log('🚀 TariffSelectionModal.handlePayNow: Вызов onConfirm с данными подписки')
      console.log('📋 Данные подписки (pay_now):', JSON.stringify(subscriptionData, null, 2))
      
      // Вызываем onConfirm - он должен быть асинхронной функцией
      const promise = onConfirm(subscriptionData)
      
      // Если это Promise, обрабатываем его
      if (promise && typeof promise.then === 'function') {
        promise
          .then(() => {
            console.log('✅ TariffSelectionModal.handlePayNow: onConfirm (Promise) выполнен успешно')
          })
          .catch((error) => {
            console.error('❌ TariffSelectionModal.handlePayNow: Ошибка в Promise onConfirm:', error)
            alert('Ошибка при обработке: ' + (error.message || 'Неизвестная ошибка'))
          })
      } else {
        console.log('✅ TariffSelectionModal.handlePayNow: onConfirm вызван (не Promise)')
      }
    } catch (error) {
      console.error('❌ TariffSelectionModal.handlePayNow: Синхронная ошибка при вызове onConfirm:', error)
      alert('Ошибка при обработке выбора: ' + (error.message || 'Неизвестная ошибка'))
    }
  }

  const handleCancel = () => {
    setConfirmed(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-md" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-800 w-full max-w-[90vw] sm:max-w-md rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
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
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={selectedDevices}
                  onChange={(e) => {
                    const value = Math.max(1, Math.min(10, parseInt(e.target.value) || 1))
                    setSelectedDevices(value)
                    setConfirmed(false) // Сбрасываем подтверждение при изменении
                    setPaymentMode(null)
                  }}
                  className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-800 border border-slate-700 rounded-lg text-white text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                  disabled={isLoading || confirmed}
                />
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

          {/* Для Multi тарифа: выбор натрек-порта - Mobile First */}
          {isMulti && (
            <div className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-medium mb-1.5 sm:mb-2">
                  Выберите натрек-порт
                </label>
                {natrockPorts && natrockPorts.length > 0 ? (
                  <select
                    value={selectedPort}
                    onChange={(e) => setSelectedPort(e.target.value)}
                    className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-800 border border-slate-700 rounded-lg text-white text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                    disabled={isLoading || confirmed}
                  >
                    {natrockPorts.map((port) => (
                      <option key={port} value={port}>
                        Порт {port}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 sm:p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
                    <div className="flex items-start sm:items-center gap-2 text-yellow-400">
                      <AlertCircle size={18} className="sm:w-5 sm:h-5 flex-shrink-0 mt-0.5 sm:mt-0" />
                      <span className="text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">
                        Список натрек-портов не настроен в админ панели
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-slate-800 rounded-lg sm:rounded-xl p-3 sm:p-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Тариф:</span>
                  <span className="text-white font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">{tariff?.name}</span>
                </div>
                <div className="border-t border-slate-700 mt-2 sm:mt-3 pt-2 sm:pt-3 flex justify-between items-center">
                  <span className="text-white font-bold text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg">Цена:</span>
                  <span className="text-blue-400 font-bold text-[clamp(1.5rem,1.3rem+1vw,2.25rem)] sm:text-2xl">{tariff?.price || 0} ₽</span>
                </div>
              </div>
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
                )}?
              </p>
              
              {/* Выбор режима оплаты */}
              <div className="space-y-2">
                <p className="text-slate-400 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] sm:text-xs font-medium mb-2">Выберите способ оплаты:</p>
                <button
                  onClick={handlePayNow}
                  disabled={isLoading}
                  className="btn-icon-only-mobile w-full min-h-[44px] px-4 py-3 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-lg font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-manipulation"
                  aria-label="Оплатить сейчас"
                >
                  <Check size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
                  <span className="btn-text">Оплатить сейчас</span>
                </button>
                <button
                  onClick={handlePayLater}
                  disabled={isLoading}
                  className="btn-icon-only-mobile w-full min-h-[44px] px-4 py-3 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-manipulation"
                  aria-label="Оплатить позже, тест 24 часа"
                >
                  <Clock size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
                  <span className="btn-text">Оплатить позже (тест 24 часа)</span>
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

          {/* Кнопки действий - Mobile First */}
          {!confirmed && (
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-3 sm:pt-4">
              <button
                onClick={handleCancel}
                disabled={isLoading}
                className="btn-icon-only-mobile min-h-[44px] flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center touch-manipulation"
                aria-label="Отмена"
              >
                <span className="btn-text">Отмена</span>
              </button>
              <button
                onClick={handleConfirm}
                disabled={
                  isLoading || 
                  (isMulti && !selectedPort) ||
                  (isSuper && selectedDevices < 1)
                }
                className="btn-icon-only-mobile min-h-[44px] flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-manipulation"
                aria-label="Подтвердить"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="sm:w-5 sm:h-5 animate-spin flex-shrink-0" />
                    <span className="btn-text">Оформление...</span>
                  </>
                ) : (
                  <span className="btn-text">Подтвердить</span>
                )}
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
