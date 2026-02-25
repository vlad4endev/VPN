import React, { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { X, Save, RefreshCw, Copy, CheckCircle2, XCircle, AlertCircle, Mail, User, Phone, Key, Calendar, HardDrive, Smartphone, Percent, Send, AtSign, ShieldOff, MessageSquare, Loader2, CreditCard, Activity, ChevronLeft } from 'lucide-react'
import { getUserStatus } from '../../../shared/utils/userStatus.js'
import { useSubscriptionStatus } from '../../../shared/hooks/useSubscriptionStatus.js'
import { USER_ROLE_OPTIONS, canAccessAdmin, canAccessFinances } from '../../../shared/constants/admin.js'
import { validateUser, normalizeUser } from '../utils/userValidation.js'
import { UserCardPropTypes } from './UserCard.propTypes.js'
import { useAdminContext } from '../context/AdminContext.jsx'
import { notificationsService } from '../../notifications/services/notificationsService.js'
import { NOTIFICATION_TYPES } from '../../notifications/constants.js'
import { notifyDiscountAssigned } from '../services/notifyDiscountService.js'
import { dashboardService } from '../../dashboard/services/dashboardService.js'
import { supportService } from '../../support/services/supportService.js'
import XUIService from '../../vpn/services/XUIService.js'

/** Проверка, что объект похож на статистику 3x-ui (есть хотя бы одно из полей). */
function hasStatsFields(obj) {
  return obj && typeof obj === 'object' && (
    obj.total != null || obj.up != null || obj.down != null || obj.expiryTime != null || obj.id != null
  )
}

/**
 * Извлекает объект статистики из ответа webhook/n8n/3x-ui (разные форматы).
 * 3x-ui часто возвращает { success, obj: { up, down, total, expiryTime } }.
 * @param {*} res — ответ getClientStats (response.data с бэкенда)
 * @returns {{ total?, up?, down?, expiryTime?, lastSeen? } | null}
 */
function normalizeClientStatsResponse(res) {
  if (res == null) return null
  const candidates = [
    res?.obj,
    res?.stats,
    res?.data,
    res?.result,
    res?.json,
    res?.body,
    res?.output,
    res,
  ].filter(Boolean)
  for (const raw of candidates) {
    if (Array.isArray(raw) && raw.length > 0) {
      const item = raw[0]
      const obj = item && typeof item === 'object' ? (item.json ?? item) : null
      if (hasStatsFields(obj)) return obj
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      if (hasStatsFields(raw)) return raw
      if (raw.obj != null && hasStatsFields(raw.obj)) return raw.obj
      if (raw.data != null) {
        const inner = Array.isArray(raw.data) ? raw.data[0] : raw.data
        const obj = inner && typeof inner === 'object' ? (inner.json ?? inner ?? inner.obj) : null
        if (hasStatsFields(obj)) return obj
        if (inner?.obj != null && hasStatsFields(inner.obj)) return inner.obj
      }
      if (raw.body && typeof raw.body === 'object' && hasStatsFields(raw.body)) return raw.body
    }
  }
  return null
}

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
  servers = [],
  formatDate,
}) => {
  // Получаем функции из контекста
  const { handleSaveUserCard, generateUUID, generateSubId } = useAdminContext()
  
  // Валидация пропсов в режиме разработки
  if (import.meta.env.DEV) {
    PropTypes.checkPropTypes(UserCardPropTypes, { user, onClose, onCopy, tariffs, servers, formatDate }, 'prop', 'UserCard')
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
  const [discountPercent, setDiscountPercent] = useState(() => (user?.discount != null ? Math.round(Number(user.discount) * 100) : 10))
  const [discountFrom, setDiscountFrom] = useState(() => {
    if (user?.discountValidFrom != null) {
      const ms = typeof user.discountValidFrom === 'number' ? user.discountValidFrom : new Date(user.discountValidFrom).getTime()
      return new Date(ms).toISOString().slice(0, 10)
    }
    return new Date().toISOString().slice(0, 10)
  })
  const [discountTo, setDiscountTo] = useState(() => {
    if (user?.discountValidTo != null) {
      const ms = typeof user.discountValidTo === 'number' ? user.discountValidTo : new Date(user.discountValidTo).getTime()
      return new Date(ms).toISOString().slice(0, 10)
    }
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [discountNotifyStatus, setDiscountNotifyStatus] = useState(null)
  const [sendNotificationOpen, setSendNotificationOpen] = useState(false)
  const [sendNotificationTemplates, setSendNotificationTemplates] = useState([])
  const [sendNotificationTemplateId, setSendNotificationTemplateId] = useState('')
  const [sendNotificationTitle, setSendNotificationTitle] = useState('')
  const [sendNotificationBody, setSendNotificationBody] = useState('')
  const [sendNotificationSending, setSendNotificationSending] = useState(false)
  const [sendNotificationError, setSendNotificationError] = useState(null)
  // История оплат и обращений, данные 3x-ui
  const [payments, setPayments] = useState([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [tickets, setTickets] = useState([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [clientStats3x, setClientStats3x] = useState(null)
  const [clientStats3xLoading, setClientStats3xLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('config')

  const userId = user?.id || editingUser?.id
  const totalPaymentsSum = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

  useEffect(() => {
    if (!userId) return
    setPaymentsLoading(true)
    dashboardService.loadPayments(userId).then(setPayments).catch(() => setPayments([])).finally(() => setPaymentsLoading(false))
  }, [userId])

  useEffect(() => {
    if (!userId) return
    setTicketsLoading(true)
    supportService.getTicketsByUser(userId).then(setTickets).catch(() => setTickets([])).finally(() => setTicketsLoading(false))
  }, [userId])

  const loadClientStats3x = useCallback(async () => {
    const u = editingUser || user
    if (!u?.uuid && !u?.email) {
      setSaveError('Нет UUID или email для запроса в 3x-ui')
      return
    }
    const subId = (u.subId || (u.subid && (Array.isArray(u.subid) ? u.subid[0] : u.subid)) || '').toString().trim()
    const tariffId = u.tariffId || u.tariff_id
    const tariff = tariffs.find(t => t.id === tariffId)
    const subscriptionName = tariff?.name || tariff?.plan || u.plan || ''

    // Серверы, привязанные к тарифу пользователя (tariffIds содержит tariffId)
    const serversForTariff = (servers || []).filter(
      s => (s.tariffIds || []).includes(tariffId)
    )
    // Данные сервера подписки: IP, порт, протокол и всё остальное
    const subscriptionServerData = serversForTariff.length > 0
      ? serversForTariff.map(s => ({
          ip: s.serverIP || '',
          port: s.serverPort != null ? Number(s.serverPort) : null,
          protocol: s.protocol || 'http',
          path: s.randompath || '',
          name: s.name || '',
          location: s.location || '',
          inboundId: s.xuiInboundId || '',
          username: s.xuiUsername || '',
        }))
      : null

    // URL подписки (из тарифа или дефолт) — для обратной совместимости
    const subscriptionServer = tariff?.subscriptionLink
      ? String(tariff.subscriptionLink).trim().replace(/\/$/, '')
      : (subId ? 'https://subs.skypath.fun:3458/vk198' : '')

    setClientStats3xLoading(true)
    setClientStats3x(null)
    const payload = {
      userId: u.id,
      tariffId: tariffId || undefined,
      email: u.email || u.login,
      uuid: u.uuid,
      clientId: u.uuid,
      subId: subId || undefined,
      subscriptionName: subscriptionName || undefined,
      subscriptionServer: subscriptionServer || undefined,
      subscriptionServerData: subscriptionServerData || undefined,
    }
    try {
      const xui = XUIService.getInstance()
      let stats = null
      let lastError = null

      // 1) Запрос статистики клиента (GET /panel/api/clients/{id}/stats)
      try {
        const res = await xui.getClientStats(payload)
        stats = normalizeClientStatsResponse(res)
        if (!stats) {
          const direct = await xui.getClientStatsDirect(payload)
          if (direct?.success && direct?.data) stats = direct.data
          else if (direct?.error) lastError = direct.error
        }
      } catch (e) {
        lastError = e.response?.data?.error || e.message || lastError
      }

      // 2) При наличии UUID — запрос трафика по UUID (GET /panel/api/inbounds/getClientTrafficsById/{uuid})
      if (u.uuid) {
        const trafficsRes = await xui.getClientTrafficsById({
          uuid: u.uuid,
          userId: u.id,
          tariffId: tariffId || undefined,
        })
        if (trafficsRes?.success && trafficsRes?.data != null) {
          const t = typeof trafficsRes.data === 'object' && trafficsRes.data.obj != null
            ? trafficsRes.data.obj
            : trafficsRes.data
          if (t && typeof t === 'object') {
            stats = {
              ...(stats || {}),
              up: t.up ?? stats?.up,
              down: t.down ?? stats?.down,
              total: t.total ?? stats?.total,
              expiryTime: t.expiryTime ?? stats?.expiryTime,
              lastSeen: t.lastSeen ?? stats?.lastSeen,
            }
          }
        } else if (trafficsRes?.error && !stats) {
          lastError = trafficsRes.error
        }
      }

      const hasAny = stats && (stats.up != null || stats.down != null || stats.total != null || stats.expiryTime != null)
      if (hasAny) {
        setClientStats3x(stats)
      } else {
        const msg = lastError && lastError.trim()
          ? lastError
          : 'Не удалось загрузить данные из 3x-ui. Проверьте, что XUI_HOST, XUI_USERNAME, XUI_PASSWORD заданы в proxy/бэкенде и клиент есть в панели по этому UUID.'
        setClientStats3x({ _error: msg })
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Ошибка запроса к 3x-ui'
      setClientStats3x({ _error: msg })
    } finally {
      setClientStats3xLoading(false)
    }
  }, [editingUser, user, tariffs, servers])

  const apply3xUiExpiryToCard = useCallback(() => {
    if (!clientStats3x?.expiryTime || !handleSaveUserCard) return
    const expiryMs = Number(clientStats3x.expiryTime) * 1000
    const updated = { ...editingUser, expiresAt: expiryMs }
    setEditingUser(updated)
    handleSaveUserCard(normalizeUser(updated)).catch(() => {})
  }, [clientStats3x, editingUser, handleSaveUserCard])

  useEffect(() => {
    if (sendNotificationOpen) {
      setSendNotificationError(null)
      notificationsService.getTemplates().then(setSendNotificationTemplates).catch(() => setSendNotificationTemplates([]))
    }
  }, [sendNotificationOpen])

  const handleSendNotification = useCallback(async () => {
    const uid = String(user?.id || editingUser?.id || '').trim()
    if (!uid) return
    const useTemplate = sendNotificationTemplateId && sendNotificationTemplates.find((t) => t.id === sendNotificationTemplateId)
    const title = useTemplate ? useTemplate.titleTemplate : sendNotificationTitle.trim()
    const body = useTemplate ? useTemplate.bodyTemplate : sendNotificationBody.trim()
    if (!title || !body) {
      setSendNotificationError('Укажите заголовок и текст или выберите шаблон')
      return
    }
    setSendNotificationSending(true)
    setSendNotificationError(null)
    try {
      await notificationsService.sendToOne(uid, {
        templateId: useTemplate ? useTemplate.id : undefined,
        title: useTemplate ? undefined : title,
        body: useTemplate ? undefined : body,
      })
      setSendNotificationOpen(false)
      setSendNotificationTemplateId('')
      setSendNotificationTitle('')
      setSendNotificationBody('')
    } catch (err) {
      setSendNotificationError(err.message || 'Ошибка отправки')
    } finally {
      setSendNotificationSending(false)
    }
  }, [user?.id, editingUser?.id, sendNotificationTemplateId, sendNotificationTitle, sendNotificationBody, sendNotificationTemplates])

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
      if (user.discount != null) setDiscountPercent(Math.round(Number(user.discount) * 100))
      if (user.discountValidFrom != null) {
        const ms = typeof user.discountValidFrom === 'number' ? user.discountValidFrom : new Date(user.discountValidFrom).getTime()
        setDiscountFrom(new Date(ms).toISOString().slice(0, 10))
      }
      if (user.discountValidTo != null) {
        const ms = typeof user.discountValidTo === 'number' ? user.discountValidTo : new Date(user.discountValidTo).getTime()
        setDiscountTo(new Date(ms).toISOString().slice(0, 10))
      }
    }
  }, [user?.id, user?.uuid, user?.name, user?.phone, user?.expiresAt, user?.trafficGB, user?.devices, user?.tariffId, user?.plan, user?.periodMonths, user?.paymentStatus, user?.testPeriodStartDate, user?.testPeriodEndDate, user?.natrockPort, user?.syncedWithN8nAt, user?.lastSyncChanges, user?.subId, user?.subid, user?.discount, user?.discountValidFrom, user?.discountValidTo, user?.language, tariffs, getTrafficLimit])

  // Загружаем подписку из коллекции subscriptions (по subscriptionId или по userId) для корректного статуса
  const { subscription, isLoading: subscriptionLoading } = useSubscriptionStatus(user)
  // Статус с учётом загруженной подписки (subscription.status — источник правды)
  const userStatus = getUserStatus(user || editingUser, null, subscription)

  // Уникальные ID для полей формы
  const fieldIds = {
    name: `user-card-name-${user.id}`,
    login: `user-card-login-${user.id}`,
    phone: `user-card-phone-${user.id}`,
    tgId: `user-card-tgid-${user.id}`,
    uuid: `user-card-uuid-${user.id}`,
    tariff: `user-card-tariff-${user.id}`,
    expiresAt: `user-card-expires-at-${user.id}`,
    periodMonths: `user-card-period-months-${user.id}`,
    subscriptionLink: `user-card-subscription-link-${user.id}`,
    trafficGB: `user-card-traffic-gb-${user.id}`,
    devices: `user-card-devices-${user.id}`,
    subId: `user-card-subid-${user.id}`,
    language: `user-card-language-${user.id}`,
  }

  const LANGUAGE_OPTIONS = [
    { value: '', label: '— не задан' },
    { value: 'ru', label: 'Русский' },
    { value: 'en', label: 'English' },
    { value: 'zh', label: '简体中文' },
    { value: 'hi', label: 'हिन्दी' },
    { value: 'ar', label: 'العربية' },
    { value: 'tg', label: 'Тоҷикӣ' },
    { value: 'uz', label: "O'zbekcha" },
    { value: 'kk', label: 'Қазақша' },
    { value: 'ky', label: 'Кыргызча' },
  ]

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

  const handleLoginChange = useCallback((e) => {
    handleFieldChange('login', (e.target.value || '').trim().toLowerCase())
  }, [handleFieldChange])

  const handleTgIdChange = useCallback((e) => {
    const raw = e.target.value || ''
    // Telegram user.id — число. Храним как строку из цифр (чтобы не ловить проблемы с JS number).
    const sanitized = String(raw).replace(/[^\d]/g, '')
    handleFieldChange('tgId', sanitized)
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

  const handleLanguageChange = useCallback((e) => {
    const value = (e.target.value || '').trim() || null
    handleFieldChange('language', value)
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

  const handlePeriodMonthsChange = useCallback((e) => {
    const raw = e.target.value
    const value = raw === '' ? null : Math.max(1, Math.min(120, parseInt(raw, 10) || 1))
    handleFieldChange('periodMonths', value)
  }, [handleFieldChange])

  const handleTestPeriodStartDateChange = useCallback((e) => {
    const value = e.target.value ? new Date(e.target.value).getTime() : null
    handleFieldChange('testPeriodStartDate', value)
  }, [handleFieldChange])

  const handleTestPeriodEndDateChange = useCallback((e) => {
    const value = e.target.value ? new Date(e.target.value).getTime() : null
    handleFieldChange('testPeriodEndDate', value)
  }, [handleFieldChange])

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
      // Подставляем текущие значения скидки из формы в сохраняемые данные (чтобы скидка сохранялась при нажатии «Сохранить изменения»)
      const percent = Math.min(100, Math.max(0, Number(discountPercent) || 0))
      const fromMs = discountFrom ? new Date(discountFrom).getTime() : null
      const toMs = discountTo ? new Date(discountTo).getTime() : null
      const withDiscount = {
        ...editingUser,
        discount: percent / 100,
        discountValidFrom: Number.isFinite(fromMs) ? fromMs : null,
        discountValidTo: Number.isFinite(toMs) ? toMs : null,
      }
      const normalizedUser = normalizeUser(withDiscount)
      
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
  }, [editingUser, discountPercent, discountFrom, discountTo, handleSaveUserCard])

  const assignDiscountAndNotify = useCallback(async () => {
    const percent = Math.min(100, Math.max(0, Number(discountPercent) || 0))
    const fromMs = new Date(discountFrom).getTime()
    const toMs = new Date(discountTo).getTime()
    if (isNaN(fromMs) || isNaN(toMs) || toMs < fromMs) {
      setDiscountNotifyStatus({ error: 'Укажите корректный период действия скидки' })
      return
    }
    setDiscountNotifyStatus(null)
    setIsSaving(true)
    try {
      const merged = {
        ...editingUser,
        discount: percent / 100,
        discountValidFrom: fromMs,
        discountValidTo: toMs,
      }
      const normalizedUser = normalizeUser(merged)
      await handleSaveUserCard(normalizedUser)
      setEditingUser(prev => ({ ...prev, ...normalizedUser }))
      const targetUserId = String(user?.id || editingUser?.id || normalizedUser?.id || '').trim()
      if (!targetUserId) {
        throw new Error('Не удалось определить ID пользователя для уведомления')
      }
      const fromStr = new Date(fromMs).toLocaleDateString()
      const toStr = new Date(toMs).toLocaleDateString()
      const notifTitle = 'Вам назначена персональная скидка'
      const notifBody = `Скидка ${percent}% действует с ${fromStr} по ${toStr}. При оплате подписки скидка применится автоматически.`
      await notificationsService.createOne({
        userId: targetUserId,
        type: NOTIFICATION_TYPES.personal_discount,
        title: notifTitle,
        body: notifBody,
        overview: `Скидка ${percent}% до ${toStr}`,
      })
      let telegramSent = false
      let telegramReason = null
      try {
        const result = await notifyDiscountAssigned({
          userId: targetUserId,
          percent,
          validFrom: fromMs,
          validTo: toMs,
        })
        telegramSent = result.sent
        telegramReason = result.reason || null
      } catch (err) {
        telegramReason = err?.message || 'Ошибка запроса к серверу'
      }
      setDiscountNotifyStatus({ success: true, telegramSent, telegramReason })
    } catch (err) {
      setDiscountNotifyStatus({ error: err.message || 'Не удалось назначить скидку' })
    } finally {
      setIsSaving(false)
    }
  }, [editingUser, discountPercent, discountFrom, discountTo, user.id, handleSaveUserCard])

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

  const tabs = [
    { id: 'config', label: 'Конфигурация', icon: Key },
    { id: 'subscription', label: 'Подписка', icon: CheckCircle2 },
    { id: 'payments', label: `Платежи (${payments.length})`, icon: CreditCard },
    { id: 'tickets', label: `Обращения (${tickets.length})`, icon: MessageSquare },
    { id: 'xui', label: '3x-ui', icon: Activity },
    { id: 'other', label: 'Прочее', icon: User },
  ]

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 rounded-xl shadow-2xl border border-slate-800 w-full max-w-5xl max-h-[90vh] min-h-0 flex flex-col my-4 mx-auto overflow-hidden">
        {/* Шапка: назад, имя, статус, email, действия */}
        <div className="flex-shrink-0 bg-slate-900 border-b border-slate-800 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors shrink-0"
              aria-label="Закрыть"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-100 truncate">
                  {editingUser.name || editingUser.email || 'Клиент'}
                </h2>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${
                  userStatus.status === 'active' ? 'bg-emerald-900/50 text-emerald-300' :
                  userStatus.status === 'expired' || userStatus.status === 'unpaid' ? 'bg-red-900/50 text-red-300' :
                  userStatus.status === 'test_period' ? 'bg-amber-900/50 text-amber-300' :
                  'bg-slate-700 text-slate-400'
                }`}>
                  {userStatus.status === 'active' && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {(userStatus.status === 'expired' || userStatus.status === 'unpaid') && <XCircle className="w-3.5 h-3.5" />}
                  {userStatus.label}
                </span>
              </div>
              <p className="text-slate-400 text-sm mt-0.5 truncate">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSendNotificationOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium transition-colors"
              title="Отправить уведомление"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="max-sm:hidden">Уведомление</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {saveError && (
          <div className="flex-shrink-0 mx-4 mt-2 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
            {saveError}
          </div>
        )}

        {/* Две колонки: левая — контакты и статистика, правая — вкладки */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Левая колонка — контакты и статистика */}
          <aside className="hidden sm:flex flex-col w-64 lg:w-72 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 overflow-y-auto">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Контакты
              </h3>
              <div className="space-y-2">
                <button type="button" onClick={() => onCopy?.(editingUser.email || '')} className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-slate-800/80 border border-slate-700 hover:border-slate-600 text-left transition-colors group">
                  <Mail className="w-4 h-4 text-slate-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-500">Email</p>
                    <p className="text-sm text-slate-200 truncate">{editingUser.email || '—'}</p>
                  </div>
                  <Copy className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 shrink-0" />
                </button>
                <button type="button" onClick={() => onCopy?.(editingUser.phone || '')} className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-slate-800/80 border border-slate-700 hover:border-slate-600 text-left transition-colors group">
                  <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-500">Телефон</p>
                    <p className="text-sm text-slate-200 truncate">{editingUser.phone || '—'}</p>
                  </div>
                  <Copy className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 shrink-0" />
                </button>
                <button type="button" onClick={() => onCopy?.(editingUser.tgId || '')} className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-slate-800/80 border border-slate-700 hover:border-slate-600 text-left transition-colors group">
                  <Send className="w-4 h-4 text-slate-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-500">Telegram</p>
                    <p className="text-sm text-slate-200 truncate">{editingUser.tgId ? `ID ${editingUser.tgId}` : '—'}</p>
                  </div>
                  <Copy className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 shrink-0" />
                </button>
                <div className="w-full flex flex-col gap-1.5">
                    <label htmlFor={fieldIds.language} className="text-xs text-slate-500">Язык (для ИИ и рассылок)</label>
                    <select
                      id={fieldIds.language}
                      value={editingUser.language || ''}
                      onChange={handleLanguageChange}
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {LANGUAGE_OPTIONS.map((opt) => (
                        <option key={opt.value || '_empty'} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                <div className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-slate-800/80 border border-slate-700">
                  <AtSign className="w-4 h-4 text-slate-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-500">Логин</p>
                    <p className="text-sm text-slate-200 truncate">{editingUser.login || editingUser.email || '—'}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Статистика</h3>
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700">
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5" /> Всего оплат
                  </p>
                  <p className="text-lg font-semibold text-slate-200 mt-0.5">
                    {paymentsLoading ? '…' : `${totalPaymentsSum.toLocaleString('ru-RU')} ₽`}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700">
                    <p className="text-xs text-slate-500">Платежей</p>
                    <p className="text-base font-medium text-slate-200">{payments.length}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700">
                    <p className="text-xs text-slate-500">Обращений</p>
                    <p className="text-base font-medium text-slate-200">{tickets.length}</p>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Правая колонка — вкладки и контент */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <div className="flex-shrink-0 border-b border-slate-800 px-2 sm:px-4 overflow-x-auto">
              <nav className="flex gap-0.5" role="tablist">
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === id}
                    onClick={() => setActiveTab(id)}
                    className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      activeTab === id
                        ? 'text-sky-400 border-sky-500'
                        : 'text-slate-400 border-transparent hover:text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </button>
                ))}
              </nav>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {activeTab === 'config' && (
          <>
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Key className="w-5 h-5" />
              Конфигурация
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <button onClick={handleGenerateUUID} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-2" title="Сгенерировать UUID" type="button">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  {(editingUser.uuid || user?.uuid) && (
                    <button onClick={() => onCopy?.(editingUser.uuid || user?.uuid || '')} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors flex items-center gap-2" title="Копировать UUID" type="button">
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label htmlFor={fieldIds.subId} className="block text-slate-300 text-sm font-medium mb-2">SubID</label>
                <div className="flex items-center gap-2">
                  <input
                    id={fieldIds.subId}
                    name="subId"
                    type="text"
                    value={editingUser.subId || ''}
                    onChange={handleSubIdChange}
                    className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="7vyrlrvx1aiwylh1"
                  />
                  <button onClick={handleGenerateSubId} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-2" title="Сгенерировать subId" type="button">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  {editingUser.subId && (
                    <button onClick={() => onCopy?.(editingUser.subId || '')} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors flex items-center gap-2" title="Копировать subId" type="button">
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={fieldIds.subscriptionLink} className="block text-slate-300 text-sm font-medium mb-2">Ссылка подписки (3x-ui)</label>
                <div className="flex items-center gap-2">
                  {subscriptionLink ? (
                    <>
                      <input
                        id={fieldIds.subscriptionLink}
                        readOnly
                        value={subscriptionLink}
                        className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono text-xs"
                      />
                      <button onClick={() => onCopy?.(subscriptionLink)} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors flex items-center gap-2" title="Копировать" type="button">
                        <Copy className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <span className="text-slate-500 text-sm">Сгенерируйте subId для ссылки</span>
                  )}
                </div>
              </div>
              <div>
                <label htmlFor={fieldIds.tariff} className="block text-slate-300 text-sm font-medium mb-2">Тариф</label>
                <select
                  id={fieldIds.tariff}
                  value={editingUser.tariffId || ''}
                  onChange={handleTariffChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Выберите тариф</option>
                  {tariffs.filter(t => t.active).map(tariff => (
                    <option key={tariff.id} value={tariff.id}>{tariff.name} ({tariff.plan}) — {tariff.price} ₽</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={fieldIds.trafficGB} className="block text-slate-300 text-sm font-medium mb-2">Лимит трафика (GB)</label>
                <input
                  id={fieldIds.trafficGB}
                  type="number"
                  min="0"
                  value={editingUser.trafficGB || 0}
                  onChange={handleTrafficGBChange}
                  className={`w-full px-4 py-2 bg-slate-900 border rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.trafficGB ? 'border-red-500' : 'border-slate-700'}`}
                />
              </div>
              <div>
                <label htmlFor={fieldIds.devices} className="block text-slate-300 text-sm font-medium mb-2">Лимит устройств</label>
                <input
                  id={fieldIds.devices}
                  type="number"
                  min="1"
                  value={editingUser.devices || 1}
                  onChange={handleDevicesChange}
                  className={`w-full px-4 py-2 bg-slate-900 border rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.devices ? 'border-red-500' : 'border-slate-700'}`}
                />
              </div>
            </div>
          </div>
          </>
              )}

              {activeTab === 'subscription' && (
          <div className="space-y-5">
          {/* Подписка */}
          <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
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
            </div>
          </div>

          {/* Дополнительная информация о подписке от n8n */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Дополнительная информация о подписке
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Период оплаты — редактируемое поле */}
              <div>
                <label htmlFor={fieldIds.periodMonths} className="block text-slate-300 text-sm font-medium mb-2">Период оплаты</label>
                <input
                  id={fieldIds.periodMonths}
                  name="periodMonths"
                  type="number"
                  min={1}
                  max={120}
                  placeholder="Месяцев"
                  value={editingUser.periodMonths ?? ''}
                  onChange={handlePeriodMonthsChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {editingUser.periodMonths != null && (
                  <p className="text-slate-500 text-xs mt-1">
                    {editingUser.periodMonths} {editingUser.periodMonths === 1 ? 'месяц' : editingUser.periodMonths < 5 ? 'месяца' : 'месяцев'}
                  </p>
                )}
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
              
              {/* Тестовый период — редактируемые поля */}
              <div>
                <label htmlFor={`user-card-test-period-start-${user.id}`} className="block text-slate-300 text-sm font-medium mb-2">Начало тестового периода</label>
                <input
                  id={`user-card-test-period-start-${user.id}`}
                  name="testPeriodStartDate"
                  type="datetime-local"
                  value={editingUser.testPeriodStartDate ? new Date(editingUser.testPeriodStartDate).toISOString().slice(0, 16) : ''}
                  onChange={handleTestPeriodStartDateChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {editingUser.testPeriodStartDate && (
                  <p className="text-slate-500 text-xs mt-1">
                    {formatDate?.(editingUser.testPeriodStartDate) || new Date(editingUser.testPeriodStartDate).toLocaleString()}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor={`user-card-test-period-end-${user.id}`} className="block text-slate-300 text-sm font-medium mb-2">Окончание тестового периода</label>
                <input
                  id={`user-card-test-period-end-${user.id}`}
                  name="testPeriodEndDate"
                  type="datetime-local"
                  value={editingUser.testPeriodEndDate ? new Date(editingUser.testPeriodEndDate).toISOString().slice(0, 16) : ''}
                  onChange={handleTestPeriodEndDateChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {editingUser.testPeriodEndDate && (
                  <p className="text-slate-500 text-xs mt-1">
                    {formatDate?.(editingUser.testPeriodEndDate) || new Date(editingUser.testPeriodEndDate).toLocaleString()}
                  </p>
                )}
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
          </div>
              )}

              {activeTab === 'payments' && (
          <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              История оплат
            </h3>
            {paymentsLoading ? (
              <div className="flex items-center justify-center py-6 gap-2 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Загрузка...</span>
              </div>
            ) : payments.length === 0 ? (
              <p className="text-slate-500 text-sm py-4">Нет платежей</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-600">
                      <th className="py-2 px-2 font-medium">Дата</th>
                      <th className="py-2 px-2 font-medium">Сумма</th>
                      <th className="py-2 px-2 font-medium">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.slice(0, 20).map((p) => (
                      <tr key={p.id} className="border-b border-slate-700/50">
                        <td className="py-2 px-2 text-slate-300">
                          {p.createdAt ? (formatDate ? formatDate(new Date(p.createdAt).getTime(), 'short') : new Date(p.createdAt).toLocaleString()) : '—'}
                        </td>
                        <td className="py-2 px-2 text-slate-300">{p.amount != null ? `${Number(p.amount)} ₽` : '—'}</td>
                        <td className="py-2 px-2">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            (p.status || '').toLowerCase() === 'completed' ? 'bg-green-900/40 text-green-300' :
                            (p.status || '').toLowerCase() === 'pending' ? 'bg-amber-900/40 text-amber-300' :
                            'bg-slate-700 text-slate-400'
                          }`}>
                            {p.status || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {payments.length > 20 && (
              <p className="text-slate-500 text-xs mt-2">Показаны последние 20 из {payments.length}</p>
            )}
          </div>
              )}

              {activeTab === 'tickets' && (
          <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Обращения в тех поддержку
            </h3>
            {ticketsLoading ? (
              <div className="flex items-center justify-center py-6 gap-2 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Загрузка...</span>
              </div>
            ) : tickets.length === 0 ? (
              <p className="text-slate-500 text-sm py-4">Нет обращений</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {tickets.slice(0, 15).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-2 px-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                    <span className="text-slate-300 text-sm truncate flex-1" title={t.subject}>{t.subject || 'Без темы'}</span>
                    <span className="text-slate-500 text-xs shrink-0">
                      {t.updatedAt ? (formatDate ? formatDate(new Date(t.updatedAt).getTime(), 'short') : new Date(t.updatedAt).toLocaleDateString()) : ''}
                    </span>
                    <span className={`shrink-0 px-2 py-0.5 rounded text-xs ${
                      t.status === 'closed' ? 'bg-slate-700 text-slate-400' :
                      t.status === 'answered' ? 'bg-blue-900/40 text-blue-300' : 'bg-amber-900/40 text-amber-300'
                    }`}>
                      {t.status === 'open' ? 'Открыт' : t.status === 'answered' ? 'Отвечен' : t.status === 'closed' ? 'Закрыт' : t.status || '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {tickets.length > 15 && (
              <p className="text-slate-500 text-xs mt-2">Показаны последние 15 из {tickets.length}</p>
            )}
          </div>
              )}

              {activeTab === 'xui' && (
          <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Данные с 3x-ui
            </h3>

            {clientStats3x?._error && (
              <p className="text-amber-400 text-sm mb-3">{clientStats3x._error}</p>
            )}

            {clientStats3x && !clientStats3x._error && (
              <>
                <div className="space-y-3 mb-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                  {clientStats3x.expiryTime != null && (
                    <div>
                      <span className="text-slate-500 text-sm block">Дата окончания в панели 3x-ui</span>
                      <span className="text-slate-200 font-medium">
                        {new Date(Number(clientStats3x.expiryTime) * 1000).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })}
                      </span>
                    </div>
                  )}
                  {clientStats3x.total != null && (
                    <div>
                      <span className="text-slate-500 text-sm block">Лимит трафика</span>
                      <span className="text-slate-200">{(Number(clientStats3x.total) / (1024 ** 3)).toFixed(2)} GB</span>
                    </div>
                  )}
                  {(clientStats3x.up != null || clientStats3x.down != null) && (
                    <div>
                      <span className="text-slate-500 text-sm block">Использовано трафика</span>
                      <span className="text-slate-200">
                        {((Number(clientStats3x.up || 0) + Number(clientStats3x.down || 0)) / (1024 ** 3)).toFixed(2)} GB
                      </span>
                    </div>
                  )}
                  {clientStats3x.total != null && (clientStats3x.up != null || clientStats3x.down != null) && (
                    <div>
                      <span className="text-slate-500 text-sm block">Остаток трафика</span>
                      <span className="text-slate-200">
                        {Math.max(0, (Number(clientStats3x.total) - (Number(clientStats3x.up || 0) + Number(clientStats3x.down || 0))) / (1024 ** 3)).toFixed(2)} GB
                      </span>
                    </div>
                  )}
                  {clientStats3x.lastSeen != null && (
                    <div>
                      <span className="text-slate-500 text-sm block">Последняя активность в сети</span>
                      <span className="text-slate-200">
                        {(() => {
                          const t = Number(clientStats3x.lastSeen)
                          const ms = t < 1e12 ? t * 1000 : t
                          return new Date(ms).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
                        })()}
                      </span>
                    </div>
                  )}
                </div>

                {clientStats3x.expiryTime != null && (() => {
                  const expiry3xMs = Number(clientStats3x.expiryTime) * 1000
                  const cardExpiryMs = editingUser?.expiresAt ? Number(editingUser.expiresAt) : null
                  const diff = cardExpiryMs != null ? Math.abs(expiry3xMs - cardExpiryMs) : Infinity
                  const differs = diff > 60 * 1000
                  return differs ? (
                    <div className="mb-4 p-3 bg-amber-900/20 border border-amber-700/50 rounded-lg">
                      <p className="text-amber-200 text-sm mb-2">
                        В панели 3x-ui указана другая дата окончания, чем в карточке подписки. Обновите дату в карточке по данным панели.
                      </p>
                      <p className="text-slate-400 text-xs mb-2">
                        В карточке: {cardExpiryMs ? (formatDate ? formatDate(cardExpiryMs, 'short') : new Date(cardExpiryMs).toLocaleString('ru-RU')) : 'не указано'}
                      </p>
                      <button
                        type="button"
                        onClick={apply3xUiExpiryToCard}
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-50"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Обновить дату окончания в карточке по данным 3x-ui
                      </button>
                    </div>
                  ) : null
                })()}
              </>
            )}

            {!clientStats3x && !clientStats3xLoading && !clientStats3x?._error && (
              <p className="text-slate-500 text-sm mb-4">Нажмите кнопку ниже, чтобы загрузить данные из панели 3x-ui.</p>
            )}
            {clientStats3x && !clientStats3x._error && Object.keys(clientStats3x).filter(k => !k.startsWith('_')).length === 0 && (
              <p className="text-slate-500 text-sm mb-4">Панель вернула пустой ответ. Проверьте, что клиент есть в 3x-ui по этому UUID/email.</p>
            )}

            <button
              type="button"
              onClick={loadClientStats3x}
              disabled={clientStats3xLoading || (!(editingUser?.uuid || user?.uuid) && !(editingUser?.email || user?.email))}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {clientStats3xLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {clientStats3xLoading ? 'Загрузка...' : 'Загрузить данные из 3x-ui'}
            </button>
          </div>
              )}

              {activeTab === 'other' && (
          <div className="space-y-5">
          {/* Редактирование контактов и прочее */}
          <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <User className="w-5 h-5" />
              Редактирование профиля
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor={fieldIds.login} className="block text-slate-300 text-sm font-medium mb-2">Логин</label>
                <input id={fieldIds.login} name="login" type="text" value={editingUser.login || ''} onChange={handleLoginChange} className={`w-full px-4 py-2 bg-slate-900 border rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.login ? 'border-red-500' : 'border-slate-700'}`} placeholder="уникальный логин" />
              </div>
              <div>
                <label htmlFor={fieldIds.name} className="block text-slate-300 text-sm font-medium mb-2">Имя</label>
                <input id={fieldIds.name} name="name" type="text" value={editingUser.name || ''} onChange={handleNameChange} className={`w-full px-4 py-2 bg-slate-900 border rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.name ? 'border-red-500' : 'border-slate-700'}`} placeholder="Имя" />
              </div>
              <div>
                <label htmlFor={fieldIds.phone} className="block text-slate-300 text-sm font-medium mb-2">Телефон</label>
                <input id={fieldIds.phone} name="phone" type="tel" value={editingUser.phone || ''} onChange={handlePhoneChange} className={`w-full px-4 py-2 bg-slate-900 border rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.phone ? 'border-red-500' : 'border-slate-700'}`} placeholder="+7 …" />
              </div>
              <div>
                <label htmlFor={fieldIds.tgId} className="block text-slate-300 text-sm font-medium mb-2">Telegram ID</label>
                <input id={fieldIds.tgId} name="tgId" type="text" inputMode="numeric" value={editingUser.tgId || ''} onChange={handleTgIdChange} className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="123456789" />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-slate-300 text-sm font-medium mb-2">Сессия Telegram Mini App</label>
              <div className="flex flex-wrap items-center gap-2">
                {(user?.telegramSessionToken || editingUser?.telegramSessionToken) ? (
                  <>
                    <span className="font-mono text-slate-400 text-xs">••••••••{(user?.telegramSessionToken || editingUser?.telegramSessionToken).slice(-8)}</span>
                    <button type="button" onClick={async () => { setEditingUser(prev => ({ ...prev, telegramSessionToken: null, telegramSessionTokenExpiresAt: null })); if (handleSaveUserCard) await handleSaveUserCard(normalizeUser({ ...editingUser, telegramSessionToken: null, telegramSessionTokenExpiresAt: null })) }} className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-amber-900/50 hover:bg-amber-800/50 text-amber-200 text-xs"> <ShieldOff className="w-3.5 h-3.5" /> Отозвать </button>
                  </>
                ) : (
                  <span className="text-slate-500 text-xs">Нет активной сессии</span>
                )}
              </div>
            </div>
          </div>

          {/* Персональная скидка */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Percent className="w-5 h-5" />
              Персональная скидка
            </h3>
            {(editingUser.discount != null && editingUser.discountValidFrom != null && editingUser.discountValidTo != null) && (
              <div className="mb-4 p-3 bg-slate-900 rounded border border-slate-600 text-slate-300 text-sm">
                Текущая скидка: <strong>{Math.round((editingUser.discount ?? 0) * 100)}%</strong>
                {' — '}
                с {formatDate?.(editingUser.discountValidFrom) ?? new Date(editingUser.discountValidFrom).toLocaleDateString()} по {formatDate?.(editingUser.discountValidTo) ?? new Date(editingUser.discountValidTo).toLocaleDateString()}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label htmlFor={`user-card-discount-percent-${user.id}`} className="block text-slate-300 text-sm font-medium mb-2">Скидка, %</label>
                <input
                  id={`user-card-discount-percent-${user.id}`}
                  type="number"
                  min={1}
                  max={100}
                  value={discountPercent}
                  onChange={e => setDiscountPercent(Number(e.target.value) || 0)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor={`user-card-discount-from-${user.id}`} className="block text-slate-300 text-sm font-medium mb-2">Действует с</label>
                <input
                  id={`user-card-discount-from-${user.id}`}
                  type="date"
                  value={discountFrom}
                  onChange={e => setDiscountFrom(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor={`user-card-discount-to-${user.id}`} className="block text-slate-300 text-sm font-medium mb-2">Действует по</label>
                <input
                  id={`user-card-discount-to-${user.id}`}
                  type="date"
                  value={discountTo}
                  onChange={e => setDiscountTo(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {discountNotifyStatus?.error && (
              <p className="text-red-400 text-sm mb-2">{discountNotifyStatus.error}</p>
            )}
            {discountNotifyStatus?.success && (
              <p className="text-green-400 text-sm mb-2">
                Скидка назначена, уведомление отправлено пользователю.
                {discountNotifyStatus.telegramSent && ' Сообщение в Telegram доставлено.'}
                {!discountNotifyStatus.telegramSent && discountNotifyStatus.telegramReason && (
                  <span className="block mt-1 text-amber-400">В Telegram не отправлено: {discountNotifyStatus.telegramReason}</span>
                )}
              </p>
            )}
            <button
              type="button"
              onClick={assignDiscountAndNotify}
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              {isSaving ? 'Сохранение...' : 'Назначить и уведомить'}
            </button>
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
              {(user.serviceStartDate != null || user.createdAt) && (
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Дата регистрации</label>
                  <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-400 text-sm">
                    {formatDate?.(user.serviceStartDate ?? user.createdAt) || new Date(user.serviceStartDate ?? user.createdAt).toLocaleString()}
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

      {/* Модалка: отправить уведомление пользователю */}
      {sendNotificationOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setSendNotificationOpen(false)}>
          <div className="bg-slate-900 rounded-xl border border-slate-700 shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Отправить уведомление
              </h3>
              <button type="button" onClick={() => setSendNotificationOpen(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Шаблон (опционально)</label>
                <select
                  value={sendNotificationTemplateId}
                  onChange={(e) => setSendNotificationTemplateId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                >
                  <option value="">— Свой текст —</option>
                  {sendNotificationTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              {!sendNotificationTemplateId && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Заголовок</label>
                    <input
                      type="text"
                      value={sendNotificationTitle}
                      onChange={(e) => setSendNotificationTitle(e.target.value)}
                      placeholder="Заголовок"
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Текст</label>
                    <textarea
                      value={sendNotificationBody}
                      onChange={(e) => setSendNotificationBody(e.target.value)}
                      rows={3}
                      placeholder="Текст уведомления"
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 resize-y"
                    />
                  </div>
                </>
              )}
              {sendNotificationError && (
                <p className="text-sm text-red-400">{sendNotificationError}</p>
              )}
            </div>
            <div className="p-4 border-t border-slate-700 flex justify-end gap-2">
              <button type="button" onClick={() => setSendNotificationOpen(false)} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600">
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSendNotification}
                disabled={sendNotificationSending || (!sendNotificationTemplateId && (!sendNotificationTitle.trim() || !sendNotificationBody.trim()))}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {sendNotificationSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Отправить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// PropTypes
UserCard.propTypes = UserCardPropTypes

export default UserCard

