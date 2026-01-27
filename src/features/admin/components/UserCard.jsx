import React, { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { X, Save, RefreshCw, Copy, CheckCircle2, XCircle, AlertCircle, Mail, User, Phone, Key, Calendar, HardDrive, Smartphone, Link2 } from 'lucide-react'
import { getUserStatus } from '../../../shared/utils/userStatus.js'
import { USER_ROLE_OPTIONS, canAccessAdmin, canAccessFinances } from '../../../shared/constants/admin.js'
import { validateUser, normalizeUser } from '../utils/userValidation.js'
import { UserCardPropTypes } from './UserCard.propTypes.js'
import { useAdminContext } from '../context/AdminContext.jsx'

/**
 * Улучшенная карточка пользователя для редактирования админом
 * 
 * Улучшения:
 * - PropTypes для валидации пропсов
 * - Валидация данных перед сохранением
 * - Улучшенная обработка ошибок
 * - Оптимистичные обновления
 * - Лучшая структура кода
 * - Использование Context API для получения функций
 * 
 * @param {Object} props - Пропсы компонента
 * @param {Object} props.user - Данные пользователя
 * @param {Function} props.onClose - Функция закрытия карточки
 * @param {Function} props.onCopy - Функция копирования в буфер обмена
 * @param {Array} props.tariffs - Список тарифов
 * @param {Function} props.formatDate - Функция форматирования даты
 */
const UserCard = ({
  user,
  onClose,
  onCopy,
  tariffs = [],
  formatDate,
}) => {
  // Получаем функции из контекста
  const { handleSaveUserCard, generateUUID, generateSubId } = useAdminContext()
  
  // Валидация пропсов в режиме разработки
  if (import.meta.env.DEV) {
    PropTypes.checkPropTypes(UserCardPropTypes, { user, onClose, onCopy, tariffs, formatDate }, 'prop', 'UserCard')
  }

  if (!user) {
    console.warn('UserCard: user prop не предоставлен')
    return null
  }

  // Локальное состояние для редактирования
  const [editingUser, setEditingUser] = useState(() => ({ ...user }))
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState(null)

  // Функция для определения лимита трафика на основе тарифа и статуса оплаты
  // Определяем до useEffect, чтобы она была доступна при инициализации
  const getTrafficLimit = useCallback((tariff, paymentStatus) => {
    // Если тестовый период - всегда 3 GB
    if (paymentStatus === 'test_period') {
      return 3
    }
    
    // Если статус оплаты "paid" или не указан, берем из тарифа
    if (!tariff) {
      return 0
    }
    
    const plan = tariff.plan?.toLowerCase()
    const name = tariff.name?.toLowerCase()
    const isSuper = plan === 'super' || name === 'super'
    const isMulti = plan === 'multi' || name === 'multi'
    
    // SUPER тариф - 300 GB
    if (isSuper) {
      return 300
    }
    
    // MULTI тариф - 0 (безлимит)
    if (isMulti) {
      return 0
    }
    
    // Для других тарифов берем из тарифа или 0
    return tariff.trafficGB || 0
  }, [])

  // Обновляем editingUser при изменении user prop
  // ВАЖНО: Всегда используем актуальные данные из user prop для синхронизации
  useEffect(() => {
    if (user) {
      // Используем subId (строка), приоритет у subId, если нет - используем subid (для обратной совместимости)
      const normalizedSubId = user.subId 
        ? String(user.subId).trim() 
        : (user.subid 
          ? (Array.isArray(user.subid) && user.subid.length > 0 
              ? String(user.subid[0]).trim() 
              : String(user.subid).trim())
          : '')
      
      // Нормализуем UUID - всегда берем из актуальных данных user
      const normalizedUUID = user.uuid ? String(user.uuid).trim() : ''
      
      console.log('UserCard: Загрузка пользователя в форму редактирования', {
        userId: user.id,
        email: user.email,
        uuidFromUser: user.uuid,
        normalizedUUID: normalizedUUID,
        subIdFromUser: user.subId,
        subidFromUser: user.subid,
        normalizedSubId: normalizedSubId,
      })
      
      setEditingUser(prev => {
        // Обновляем только если данные действительно изменились
        const newEditingUser = { 
          ...user,
          subId: normalizedSubId,
          uuid: normalizedUUID || prev.uuid || '' // Сохраняем текущий UUID если новый пустой (пользователь может редактировать)
        }
        
        // Если UUID изменился в user, обновляем его
        if (normalizedUUID && normalizedUUID !== prev.uuid) {
          newEditingUser.uuid = normalizedUUID
        }
        
        // Автоматически корректируем лимит трафика на основе тарифа и статуса оплаты
        if (user.tariffId || user.paymentStatus) {
          const tariffId = user.tariffId
          const selectedTariff = tariffId ? tariffs.find(t => t.id === tariffId) : null
          const paymentStatus = user.paymentStatus || ''
          const correctTrafficGB = getTrafficLimit(selectedTariff, paymentStatus)
          
          // Обновляем только если текущий лимит не соответствует правильному
          // Это позволяет сохранить ручные изменения, если они были сделаны
          if (user.trafficGB !== correctTrafficGB && (user.paymentStatus === 'paid' || user.paymentStatus === 'test_period')) {
            newEditingUser.trafficGB = correctTrafficGB
          }
        }
        
        return newEditingUser
      })
      setErrors({})
      setSaveError(null)
    }
  }, [user?.id, user?.uuid, user?.name, user?.phone, user?.expiresAt, user?.trafficGB, user?.devices, user?.tariffId, user?.plan, user?.periodMonths, user?.paymentStatus, user?.testPeriodStartDate, user?.testPeriodEndDate, user?.natrockPort, user?.syncedWithN8nAt, user?.lastSyncChanges, user?.subId, user?.subid, tariffs, getTrafficLimit])

  // Вычисляем статус на основе актуальных данных пользователя (user prop)
  // Это гарантирует, что статус всегда соответствует реальным данным из Firestore
  const userStatus = getUserStatus(user || editingUser)

  // Уникальные ID для полей формы
  const fieldIds = {
    name: `user-card-name-${user.id}`,
    phone: `user-card-phone-${user.id}`,
    uuid: `user-card-uuid-${user.id}`,
    tariff: `user-card-tariff-${user.id}`,
    expiresAt: `user-card-expires-at-${user.id}`,
    subscriptionLink: `user-card-subscription-link-${user.id}`,
    trafficGB: `user-card-traffic-gb-${user.id}`,
    devices: `user-card-devices-${user.id}`,
    subId: `user-card-subid-${user.id}`,
  }

  // Обработчик изменений полей с валидацией
  const handleFieldChange = useCallback((field, value) => {
    setEditingUser(prev => {
      const updated = { ...prev, [field]: value }
      
      // Валидация в реальном времени (опционально)
      if (import.meta.env.DEV) {
        const validation = validateUser(updated)
        if (!validation.isValid && validation.errors.length > 0) {
          // Можно показывать предупреждения, но не блокировать редактирование
          console.warn(`UserCard: Предупреждение валидации для поля ${field}:`, validation.errors)
        }
      }
      
      return updated
    })
    
    // Очищаем ошибку поля при изменении
    if (errors[field]) {
      setErrors(prev => {
        const updated = { ...prev }
        delete updated[field]
        return updated
      })
    }
  }, [errors])

  // Обработчики изменений полей
  const handleUUIDChange = useCallback((e) => {
    handleFieldChange('uuid', e.target.value.trim())
  }, [handleFieldChange])

  const handleNameChange = useCallback((e) => {
    handleFieldChange('name', e.target.value)
  }, [handleFieldChange])

  const handlePhoneChange = useCallback((e) => {
    handleFieldChange('phone', e.target.value)
  }, [handleFieldChange])

  const handleTariffChange = useCallback((e) => {
    const tariffId = e.target.value
    const selectedTariff = tariffs.find(t => t.id === tariffId)
    if (selectedTariff) {
      setEditingUser(prev => {
        const paymentStatus = prev.paymentStatus || ''
        const trafficGB = getTrafficLimit(selectedTariff, paymentStatus)
        
        return {
          ...prev,
          plan: selectedTariff.plan,
          tariffId: tariffId,
          devices: selectedTariff.devices || prev.devices || 1,
          trafficGB: trafficGB,
        }
      })
    } else {
      setEditingUser(prev => ({
        ...prev,
        plan: 'free',
        tariffId: null,
        trafficGB: prev.paymentStatus === 'test_period' ? 3 : 0,
      }))
    }
  }, [tariffs, getTrafficLimit])

  const handleDevicesChange = useCallback((e) => {
    handleFieldChange('devices', Number(e.target.value) || 1)
  }, [handleFieldChange])

  const handleTrafficGBChange = useCallback((e) => {
    handleFieldChange('trafficGB', Number(e.target.value) || 0)
  }, [handleFieldChange])

  const handleExpiresAtChange = useCallback((e) => {
    const value = e.target.value ? new Date(e.target.value).getTime() : null
    handleFieldChange('expiresAt', value)
  }, [handleFieldChange])

  // Обработчик для работы с subId (строка)
  const handleSubIdChange = useCallback((e) => {
    handleFieldChange('subId', e.target.value)
  }, [handleFieldChange])

  const handlePaymentStatusChange = useCallback((e) => {
    const value = e.target.value
    
    setEditingUser(prev => {
      // Определяем тариф для расчета лимита трафика
      const tariffId = prev.tariffId
      const selectedTariff = tariffId ? tariffs.find(t => t.id === tariffId) : null
      
      // Вычисляем новый лимит трафика на основе статуса оплаты и тарифа
      const trafficGB = getTrafficLimit(selectedTariff, value)
      
      return {
        ...prev,
        paymentStatus: value,
        trafficGB: trafficGB,
      }
    })
  }, [tariffs, getTrafficLimit])

  const handleRoleChange = useCallback((e) => {
    const value = e.target.value
    handleFieldChange('role', value)
  }, [handleFieldChange])

  // Генерация UUID из контекста
  const handleGenerateUUID = useCallback(() => {
    if (!generateUUID || typeof generateUUID !== 'function') {
      console.error('UserCard: generateUUID не доступен из контекста')
      setSaveError('Функция генерации UUID не доступна')
      return
    }

    try {
      const newUUID = generateUUID()
      if (newUUID) {
        handleFieldChange('uuid', newUUID)
      } else {
        setSaveError('Не удалось сгенерировать UUID')
      }
    } catch (err) {
      console.error('UserCard: Ошибка генерации UUID:', err)
      setSaveError('Ошибка генерации UUID: ' + (err.message || 'Неизвестная ошибка'))
    }
  }, [generateUUID, handleFieldChange])

  // Генерация subId из контекста
  const handleGenerateSubId = useCallback(() => {
    if (!generateSubId || typeof generateSubId !== 'function') {
      console.error('UserCard: generateSubId не доступен из контекста')
      setSaveError('Функция генерации subId не доступна')
      return
    }

    try {
      const newSubId = generateSubId()
      if (newSubId) {
        // Применяем subId к editingUser - он будет сохранен при сохранении карточки
        handleFieldChange('subId', newSubId)
        console.log('UserCard: subId сгенерирован и применен', { subId: newSubId })
      } else {
        setSaveError('Не удалось сгенерировать subId')
      }
    } catch (err) {
      console.error('UserCard: Ошибка генерации subId:', err)
      setSaveError('Ошибка генерации subId: ' + (err.message || 'Неизвестная ошибка'))
    }
  }, [generateSubId, handleFieldChange])

  // Сохранение с валидацией (использует функцию из контекста)
  const handleSave = useCallback(async () => {
    // Проверка наличия функции сохранения из контекста
    if (!handleSaveUserCard || typeof handleSaveUserCard !== 'function') {
      const errorMsg = 'Функция сохранения не доступна из контекста'
      console.error('❌ UserCard:', errorMsg, {
        hasHandleSaveUserCard: !!handleSaveUserCard,
        handleSaveUserCardType: typeof handleSaveUserCard,
      })
      setSaveError(errorMsg)
      return
    }

    setIsSaving(true)
    setSaveError(null)
    setErrors({})

    try {
      // Нормализуем данные перед сохранением (normalizeUser уже обрабатывает subId правильно)
      const normalizedUser = normalizeUser(editingUser)
      
      // Валидация после нормализации (чтобы все поля были в правильном формате)
      const validation = validateUser(normalizedUser)
      if (!validation.isValid) {
        setSaveError(validation.errors.join(', '))
        // Помечаем поля с ошибками
        const fieldErrors = {}
        validation.errors.forEach(error => {
          // Можно улучшить, сопоставляя ошибки с полями
          if (error.includes('UUID')) fieldErrors.uuid = error
          if (error.includes('Email')) fieldErrors.email = error
          if (error.includes('телефон')) fieldErrors.phone = error
          if (error.includes('трафик')) fieldErrors.trafficGB = error
          if (error.includes('устройств')) fieldErrors.devices = error
        })
        setErrors(fieldErrors)
        setIsSaving(false)
        return
      }
      
      console.log('UserCard: Сохранение пользователя', {
        id: normalizedUser.id,
        fields: Object.keys(normalizedUser),
        subId: normalizedUser.subId,
        hasHandleSaveUserCard: !!handleSaveUserCard,
        handleSaveUserCardType: typeof handleSaveUserCard,
      })

      await handleSaveUserCard(normalizedUser)
      
      // Успешное сохранение - ошибки очищены автоматически
      console.log('UserCard: Пользователь успешно сохранен', {
        savedSubId: normalizedUser.subId
      })
    } catch (err) {
      console.error('UserCard: Ошибка сохранения:', err)
      setSaveError(err.message || 'Ошибка сохранения данных пользователя')
      throw err // Пробрасываем для обработки в родительском компоненте
    } finally {
      setIsSaving(false)
    }
  }, [editingUser, handleSaveUserCard])

  // Формируем ссылку на подписку
  // Приоритет: 1) subscriptionLink из тарифа, 2) subscriptionLink из данных пользователя, 3) формируем на основе subId, 4) vpnLink
  const subscriptionLink = (() => {
    const subId = editingUser.subId && String(editingUser.subId).trim() !== '' 
      ? String(editingUser.subId).trim() 
      : null
    
    // Сначала проверяем ссылку из тарифа (если есть tariffId и subId)
    if (editingUser.tariffId && subId && tariffs.length > 0) {
      const tariff = tariffs.find(t => t.id === editingUser.tariffId)
      if (tariff && tariff.subscriptionLink && String(tariff.subscriptionLink).trim() !== '') {
        // Убираем завершающий слэш, если есть, и добавляем subId
        const baseLink = String(tariff.subscriptionLink).trim().replace(/\/$/, '')
        return `${baseLink}/${subId}`
      }
    }
    
    // Затем проверяем сохраненную ссылку подписки из данных пользователя
    if (editingUser.subscriptionLink && String(editingUser.subscriptionLink).trim() !== '') {
      return String(editingUser.subscriptionLink).trim()
    }
    
    // Если есть subId, формируем ссылку по стандарту 3x-ui (дефолтная)
    if (subId) {
      return `https://subs.skypath.fun:3458/vk198/${subId}`
    }
    
    // Fallback на vpnLink
    if (editingUser.vpnLink && String(editingUser.vpnLink).trim() !== '') {
      return String(editingUser.vpnLink).trim()
    }
    
    return null
  })()

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 rounded-xl shadow-2xl border border-slate-800 w-full max-w-4xl max-h-[90vh] overflow-y-auto m-2 sm:m-4">
        {/* Заголовок */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-4 sm:p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-slate-200 flex items-center gap-2">
              <User className="w-6 h-6" />
              Карточка пользователя
            </h2>
            <p className="text-slate-400 text-sm mt-1">{user.email}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
            aria-label="Закрыть карточку"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Сообщение об ошибке */}
        {saveError && (
          <div className="mx-6 mt-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">
            {saveError}
          </div>
        )}

        {/* Контент */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Основная информация */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Основная информация
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Email</label>
                <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200">
                  {editingUser.email}
                </div>
                <p className="text-slate-500 text-xs mt-1">Email нельзя изменить</p>
              </div>
              <div>
                <label htmlFor={fieldIds.name} className="block text-slate-300 text-sm font-medium mb-2">
                  Имя {errors.name && <span className="text-red-400 text-xs">({errors.name})</span>}
                </label>
                <input
                  id={fieldIds.name}
                  name="name"
                  type="text"
                  value={editingUser.name || ''}
                  onChange={handleNameChange}
                  className={`w-full px-4 py-2 bg-slate-900 border rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.name ? 'border-red-500' : 'border-slate-700'
                  }`}
                  placeholder="Имя пользователя"
                />
              </div>
              <div>
                <label htmlFor={fieldIds.phone} className="block text-slate-300 text-sm font-medium mb-2">
                  Номер телефона {errors.phone && <span className="text-red-400 text-xs">({errors.phone})</span>}
                </label>
                <input
                  id={fieldIds.phone}
                  name="phone"
                  type="tel"
                  value={editingUser.phone || ''}
                  onChange={handlePhoneChange}
                  className={`w-full px-4 py-2 bg-slate-900 border rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.phone ? 'border-red-500' : 'border-slate-700'
                  }`}
                  placeholder="+7 (999) 123-45-67"
                />
              </div>
              <div>
                <label htmlFor={fieldIds.uuid} className="block text-slate-300 text-sm font-medium mb-2">
                  UUID {errors.uuid && <span className="text-red-400 text-xs">({errors.uuid})</span>}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id={fieldIds.uuid}
                    name="uuid"
                    type="text"
                    value={editingUser.uuid || user?.uuid || ''}
                    onChange={handleUUIDChange}
                    className={`flex-1 px-4 py-2 bg-slate-900 border rounded text-slate-200 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.uuid ? 'border-red-500' : 'border-slate-700'
                    }`}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                  <button
                    onClick={handleGenerateUUID}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-2"
                    title="Сгенерировать новый UUID"
                    type="button"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  {(editingUser.uuid || user?.uuid) && (
                    <button
                      onClick={() => onCopy?.(editingUser.uuid || user?.uuid || '')}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors flex items-center gap-2"
                      title="Копировать UUID"
                      type="button"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {user?.uuid && (
                  <p className="text-slate-500 text-xs mt-1">
                    Актуальный UUID из базы данных: {user.uuid}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Подписка */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Подписка
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Статус подписки</label>
                <div className="flex items-center gap-2">
                  <div className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium ${
                    userStatus.status === 'active' ? 'bg-green-900/30 text-green-400' :
                    userStatus.status === 'expired' ? 'bg-red-900/30 text-red-400' :
                    userStatus.status === 'unpaid' ? 'bg-red-900/30 text-red-400' :
                    userStatus.status === 'test_period' ? 'bg-yellow-900/30 text-yellow-400' :
                    userStatus.status === 'inactive' ? 'bg-orange-900/30 text-orange-400' :
                    userStatus.status === 'no-subscription' ? 'bg-slate-700 text-slate-400' :
                    'bg-slate-700 text-slate-400'
                  }`}>
                    {userStatus.status === 'active' && <CheckCircle2 className="w-4 h-4" />}
                    {(userStatus.status === 'expired' || userStatus.status === 'unpaid') && <XCircle className="w-4 h-4" />}
                    {(userStatus.status === 'no-key' || userStatus.status === 'no-subscription') && <AlertCircle className="w-4 h-4" />}
                    {userStatus.status === 'test_period' && <AlertCircle className="w-4 h-4" />}
                    {userStatus.status === 'inactive' && <AlertCircle className="w-4 h-4" />}
                    {userStatus.label}
                  </div>
                </div>
                <p className="text-slate-500 text-xs mt-1">
                  {userStatus.status === 'no-key' && 'Добавьте UUID для активации'}
                  {userStatus.status === 'no-subscription' && 'У пользователя нет активной подписки'}
                  {userStatus.status === 'expired' && 'Установите дату окончания в будущем'}
                  {userStatus.status === 'unpaid' && 'Подписка не оплачена'}
                  {userStatus.status === 'inactive' && 'Подписка неактивна'}
                  {userStatus.status === 'active' && 'Подписка активна'}
                  {userStatus.status === 'test_period' && 'Активен тестовый период'}
                </p>
              </div>
              <div>
                <label htmlFor={fieldIds.tariff} className="block text-slate-300 text-sm font-medium mb-2">Тариф</label>
                <select
                  id={fieldIds.tariff}
                  name="tariff"
                  value={editingUser.tariffId || ''}
                  onChange={handleTariffChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Выберите тариф</option>
                  {tariffs.filter(t => t.active).map(tariff => (
                    <option key={tariff.id} value={tariff.id}>
                      {tariff.name} ({tariff.plan}) - {tariff.price} ₽
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={fieldIds.expiresAt} className="block text-slate-300 text-sm font-medium mb-2">Срок окончания подписки</label>
                <input
                  id={fieldIds.expiresAt}
                  name="expiresAt"
                  type="datetime-local"
                  value={editingUser.expiresAt ? new Date(editingUser.expiresAt).toISOString().slice(0, 16) : ''}
                  onChange={handleExpiresAtChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {editingUser.expiresAt && (
                  <p className="text-slate-500 text-xs mt-1">
                    {formatDate?.(editingUser.expiresAt) || new Date(editingUser.expiresAt).toLocaleString()}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor={fieldIds.subscriptionLink} className="block text-slate-300 text-sm font-medium mb-2">Ссылка подписки на 3x-ui</label>
                <div className="flex items-center gap-2">
                  {subscriptionLink ? (
                    <>
                      <input
                        id={fieldIds.subscriptionLink}
                        name="subscriptionLink"
                        type="text"
                        value={subscriptionLink}
                        readOnly
                        className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono text-xs focus:outline-none"
                      />
                      <button
                        onClick={() => onCopy?.(subscriptionLink)}
                        className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors flex items-center gap-2"
                        title="Копировать ссылку"
                        type="button"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <div className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-500 text-sm">
                      {editingUser.subId ? 'Сгенерируйте subId или укажите subscriptionLink' : 'Сгенерируйте subId для получения ссылки подписки'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Лимиты */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <HardDrive className="w-5 h-5" />
              Лимиты
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor={fieldIds.trafficGB} className="block text-slate-300 text-sm font-medium mb-2 flex items-center gap-2">
                  <HardDrive className="w-4 h-4" />
                  Лимит трафика (GB) {errors.trafficGB && <span className="text-red-400 text-xs">({errors.trafficGB})</span>}
                </label>
                <input
                  id={fieldIds.trafficGB}
                  name="trafficGB"
                  type="number"
                  min="0"
                  value={editingUser.trafficGB || 0}
                  onChange={handleTrafficGBChange}
                  className={`w-full px-4 py-2 bg-slate-900 border rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.trafficGB ? 'border-red-500' : 'border-slate-700'
                  }`}
                  placeholder="0 = безлимит"
                />
                <p className="text-slate-500 text-xs mt-1">
                  {editingUser.trafficGB === 0 ? 'Безлимит' : `${editingUser.trafficGB} GB`}
                  {editingUser.paymentStatus === 'test_period' && (
                    <span className="block text-yellow-400 mt-1">Тестовый период: 3 GB</span>
                  )}
                  {editingUser.paymentStatus === 'paid' && editingUser.tariffId && (() => {
                    const tariff = tariffs.find(t => t.id === editingUser.tariffId)
                    const plan = tariff?.plan?.toLowerCase() || ''
                    const name = tariff?.name?.toLowerCase() || ''
                    if (plan === 'super' || name === 'super') {
                      return <span className="block text-green-400 mt-1">SUPER тариф: 300 GB</span>
                    }
                    if (plan === 'multi' || name === 'multi') {
                      return <span className="block text-green-400 mt-1">MULTI тариф: безлимит</span>
                    }
                    return null
                  })()}
                </p>
              </div>
              <div>
                <label htmlFor={fieldIds.devices} className="block text-slate-300 text-sm font-medium mb-2 flex items-center gap-2">
                  <Smartphone className="w-4 h-4" />
                  Лимит устройств {errors.devices && <span className="text-red-400 text-xs">({errors.devices})</span>}
                </label>
                <input
                  id={fieldIds.devices}
                  name="devices"
                  type="number"
                  min="1"
                  value={editingUser.devices || 1}
                  onChange={handleDevicesChange}
                  className={`w-full px-4 py-2 bg-slate-900 border rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.devices ? 'border-red-500' : 'border-slate-700'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* SubID */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              SubID
            </h3>
            <div>
              <label htmlFor={fieldIds.subId} className="block text-slate-300 text-sm font-medium mb-2">
                SubID пользователя
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={fieldIds.subId}
                  name="subId"
                  type="text"
                  value={editingUser.subId || ''}
                  onChange={handleSubIdChange}
                  className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Введите SubID (например: 7vyrlrvx1aiwylh1)"
                />
                <button
                  onClick={handleGenerateSubId}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-2"
                  title="Сгенерировать новый subId"
                  type="button"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                {editingUser.subId && (
                  <button
                    onClick={() => onCopy?.(editingUser.subId || '')}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors flex items-center gap-2"
                    title="Копировать subId"
                    type="button"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-slate-500 text-xs mt-2">
                SubID используется для формирования ссылки на подписку в формате 3x-ui. При генерации новый subId будет применен и сохранен для этого пользователя.
              </p>
            </div>
          </div>

          {/* Дополнительная информация о подписке от n8n */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Дополнительная информация о подписке
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Период оплаты - всегда показываем */}
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Период оплаты</label>
                <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200">
                  {editingUser.periodMonths ? (
                    `${editingUser.periodMonths} ${editingUser.periodMonths === 1 ? 'месяц' : editingUser.periodMonths < 5 ? 'месяца' : 'месяцев'}`
                  ) : (
                    <span className="text-slate-500">Не указан</span>
                  )}
                </div>
              </div>
              
              {/* Статус оплаты - редактируемое поле */}
              <div>
                <label htmlFor={`user-card-payment-status-${user.id}`} className="block text-slate-300 text-sm font-medium mb-2">Статус оплаты</label>
                <select
                  id={`user-card-payment-status-${user.id}`}
                  name="paymentStatus"
                  value={editingUser.paymentStatus || ''}
                  onChange={handlePaymentStatusChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Не указан</option>
                  <option value="paid">Оплачено</option>
                  <option value="test_period">Тестовый период</option>
                  <option value="unpaid">Не оплачено</option>
                </select>
                {editingUser.paymentStatus && (
                  <p className="text-slate-500 text-xs mt-1">
                    {editingUser.paymentStatus === 'paid' ? 'Подписка оплачена' :
                     editingUser.paymentStatus === 'test_period' ? 'Активен тестовый период' :
                     editingUser.paymentStatus === 'unpaid' ? 'Подписка не оплачена' :
                     editingUser.paymentStatus}
                  </p>
                )}
              </div>
              
              {/* Тестовый период - всегда показываем */}
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Начало тестового периода</label>
                <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-400 text-sm">
                  {editingUser.testPeriodStartDate ? (
                    formatDate?.(editingUser.testPeriodStartDate) || new Date(editingUser.testPeriodStartDate).toLocaleString()
                  ) : (
                    <span className="text-slate-500">Не указано</span>
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Окончание тестового периода</label>
                <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-400 text-sm">
                  {editingUser.testPeriodEndDate ? (
                    formatDate?.(editingUser.testPeriodEndDate) || new Date(editingUser.testPeriodEndDate).toLocaleString()
                  ) : (
                    <span className="text-slate-500">Не указано</span>
                  )}
                </div>
              </div>
              
              {/* NatRock порт (для Multi тарифа) */}
              {editingUser.natrockPort && (
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">NatRock порт</label>
                  <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200">
                    {editingUser.natrockPort}
                  </div>
                </div>
              )}
              
              {/* Дата синхронизации с n8n */}
              {editingUser.syncedWithN8nAt && (
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Последняя синхронизация с n8n</label>
                  <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-400 text-sm">
                    {formatDate?.(editingUser.syncedWithN8nAt) || new Date(editingUser.syncedWithN8nAt).toLocaleString()}
                  </div>
                  {editingUser.lastSyncChanges && editingUser.lastSyncChanges.length > 0 && (
                    <p className="text-slate-500 text-xs mt-1">
                      Обновлено полей: {editingUser.lastSyncChanges.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Базовая информация */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <User className="w-5 h-5" />
              Дополнительная информация
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor={`user-card-role-${user.id}`} className="block text-slate-300 text-sm font-medium mb-2">Роль</label>
                <select
                  id={`user-card-role-${user.id}`}
                  name="role"
                  value={editingUser.role === 'бухгалтер' ? 'accountant' : (editingUser.role || 'user')}
                  onChange={handleRoleChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {USER_ROLE_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                {canAccessAdmin(editingUser.role) && (
                  <p className="text-blue-400 text-xs mt-1">
                    Доступ к админ-панели и финансам
                  </p>
                )}
                {(editingUser.role === 'accountant' || editingUser.role === 'бухгалтер') && !canAccessAdmin(editingUser.role) && (
                  <p className="text-emerald-400 text-xs mt-1">
                    Доступ только к разделу «Финансы»
                  </p>
                )}
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">План</label>
                <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200">
                  {editingUser.plan === 'premium' ? 'Премиум' : editingUser.plan || 'Бесплатный'}
                </div>
              </div>
              {user.createdAt && (
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Дата регистрации</label>
                  <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-400 text-sm">
                    {formatDate?.(user.createdAt) || new Date(user.createdAt).toLocaleString()}
                  </div>
                </div>
              )}
              {user.updatedAt && (
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Последнее обновление</label>
                  <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-400 text-sm">
                    {formatDate?.(user.updatedAt) || new Date(user.updatedAt).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Футер с кнопками */}
        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 p-4 sm:p-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors w-full sm:w-auto"
            type="button"
            disabled={isSaving}
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
            type="button"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Сохранение...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Сохранить изменения
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// PropTypes
UserCard.propTypes = UserCardPropTypes

export default UserCard

