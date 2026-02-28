import { useState, useCallback } from 'react'
import { adminService } from '../services/adminService.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Custom hook для управления тарифами (только для админа)
 * 
 * @param {Array} tariffs - Список тарифов
 * @param {Function} setTariffs - Функция для обновления списка тарифов
 * @param {Function} setError - Функция для установки ошибки
 * @param {Function} setSuccess - Функция для установки сообщения об успехе
 * @returns {Object} Объект с состоянием и методами для работы с тарифами
 */
export function useTariffs(tariffs, setTariffs, setError, setSuccess) {
  const [editingTariff, setEditingTariff] = useState(null)

  // Загрузка тарифов
  const loadTariffs = useCallback(async () => {
    try {
      const tariffsList = await adminService.loadTariffs()
      setTariffs(tariffsList)
    } catch (err) {
      logger.error('Admin', 'Ошибка загрузки тарифов', null, err)
      setError('Ошибка загрузки тарифов')
    }
  }, [setTariffs, setError])

  // Сохранение или создание тарифа
  const handleSaveTariff = useCallback(async (tariffData) => {
    if (!editingTariff) return

    const isNew = !editingTariff.id || editingTariff.id.startsWith('default-')
    const name = (tariffData.name || '').trim()
    const plan = (tariffData.plan || '').trim().toLowerCase()

    if (!name) {
      setError('Введите название тарифа')
      return
    }

    try {
      if (isNew) {
        const configs = Array.isArray(tariffData.linkedTariffConfigs) ? tariffData.linkedTariffConfigs : []
        const linkedIds = configs.length ? configs.map(c => c.tariffId) : (Array.isArray(tariffData.linkedTariffIds) ? tariffData.linkedTariffIds : [])
        const created = await adminService.createTariff({
          name: tariffData.name,
          plan: plan || name.toLowerCase().replace(/\s+/g, '_'),
          price: Number(tariffData.price) || 0,
          devices: Number(tariffData.devices) || 1,
          trafficGB: Number(tariffData.trafficGB) ?? 0,
          durationDays: Number(tariffData.durationDays) || 30,
          active: tariffData.active !== false,
          subscriptionLink: tariffData.subscriptionLink || '',
          linkedTariffIds: linkedIds,
          linkedTariffConfigs: configs,
        })
        setTariffs(prev => [...prev, created])
        setSuccess('Тариф создан')
      } else {
        const configs = Array.isArray(tariffData.linkedTariffConfigs) ? tariffData.linkedTariffConfigs : []
        const linkedIds = configs.length ? configs.map(c => c.tariffId) : (Array.isArray(tariffData.linkedTariffIds) ? tariffData.linkedTariffIds : [])
        await adminService.saveTariff(editingTariff.id, { ...tariffData, linkedTariffIds: linkedIds, linkedTariffConfigs: configs })
        setTariffs(prev => prev.map(t => t.id === editingTariff.id ? { ...t, ...tariffData, linkedTariffIds: linkedIds, linkedTariffConfigs: configs } : t))
        setSuccess('Тариф сохранен')
      }
      setEditingTariff(null)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      logger.error('Admin', isNew ? 'Ошибка создания тарифа' : 'Ошибка сохранения тарифа', { tariffId: editingTariff?.id }, err)
      setError(isNew ? 'Ошибка создания тарифа' : 'Ошибка сохранения тарифа')
    }
  }, [editingTariff, setTariffs, setError, setSuccess])

  // Полное удаление тарифа (любого): очистка привязок у пользователей/платежей/серверов и удаление документа
  const handleDeleteTariff = useCallback(async (tariffId) => {
    const tariff = tariffs.find(t => t.id === tariffId)
    if (!tariff) return

    if (!window.confirm(`Удалить тариф «${tariff.name || tariff.plan || tariffId}» полностью? У пользователей и платежей с этим тарифом привязка будет сброшена, из настроек серверов тариф будет убран.`)) {
      return
    }

    try {
      const result = await adminService.deleteTariff(tariffId)
      setTariffs(prev => prev.filter(t => t.id !== tariffId))
      const msg = result.remappedUsers > 0 || result.remappedPayments > 0
        ? `Тариф удален. Переназначено пользователей: ${result.remappedUsers}, платежей: ${result.remappedPayments}.`
        : 'Тариф удален.'
      setSuccess(msg)
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      logger.error('Admin', 'Ошибка удаления тарифа', { tariffId }, err)
      setError(err?.message || 'Ошибка удаления тарифа')
    }
  }, [tariffs, setTariffs, setError, setSuccess])

  // Обработчики для полей тарифа
  const handleTariffNameChange = useCallback((e) => {
    const newValue = e.target.value
    setEditingTariff(prev => prev ? { ...prev, name: newValue } : null)
  }, [])

  const handleTariffPlanChange = useCallback((e) => {
    const newValue = e.target.value
    setEditingTariff(prev => prev ? { ...prev, plan: newValue } : null)
  }, [])

  const handleTariffPriceChange = useCallback((e) => {
    const newValue = Number(e.target.value) || 0
    setEditingTariff(prev => prev ? { ...prev, price: newValue } : null)
  }, [])

  const handleTariffDevicesChange = useCallback((e) => {
    const newValue = Number(e.target.value) || 1
    setEditingTariff(prev => prev ? { ...prev, devices: newValue } : null)
  }, [])

  const handleTariffTrafficGBChange = useCallback((e) => {
    const newValue = Number(e.target.value) || 0
    setEditingTariff(prev => prev ? { ...prev, trafficGB: newValue } : null)
  }, [])

  const handleTariffDurationDaysChange = useCallback((e) => {
    const newValue = Number(e.target.value) || 30
    setEditingTariff(prev => prev ? { ...prev, durationDays: newValue } : null)
  }, [])

  const handleTariffActiveChange = useCallback((e) => {
    const newValue = e.target.checked
    setEditingTariff(prev => prev ? { ...prev, active: newValue } : null)
  }, [])

  const handleTariffSubscriptionLinkChange = useCallback((e) => {
    const newValue = e.target.value
    setEditingTariff(prev => prev ? { ...prev, subscriptionLink: newValue } : null)
  }, [])

  const handleTariffLinkedTariffIdsChange = useCallback((linkedTariffIds) => {
    setEditingTariff(prev => prev ? { ...prev, linkedTariffIds: Array.isArray(linkedTariffIds) ? linkedTariffIds : [] } : null)
  }, [])

  /** Добавить тариф в объединённые: подтягиваются ссылка подписки, устройства и трафик из выбранного тарифа. Цена — общая (у основного тарифа). */
  const handleAddLinkedTariff = useCallback((tariff) => {
    if (!tariff?.id) return
    setEditingTariff(prev => {
      if (!prev) return null
      const configs = Array.isArray(prev.linkedTariffConfigs) ? [...prev.linkedTariffConfigs] : []
      if (configs.some(c => c.tariffId === tariff.id)) return prev
      const planKey = (tariff.plan || tariff.name || '').toLowerCase()
      configs.push({
        tariffId: tariff.id,
        subscriptionLink: (tariff.subscriptionLink || '').trim() || '',
        devices: Number(tariff.devices) || 1,
        trafficGB: Number(tariff.trafficGB) ?? 0,
        plan: planKey || undefined,
      })
      return { ...prev, linkedTariffConfigs: configs, linkedTariffIds: configs.map(c => c.tariffId) }
    })
  }, [])

  const handleRemoveLinkedTariff = useCallback((tariffId) => {
    setEditingTariff(prev => {
      if (!prev) return null
      const configs = (Array.isArray(prev.linkedTariffConfigs) ? prev.linkedTariffConfigs : []).filter(c => c.tariffId !== tariffId)
      return { ...prev, linkedTariffConfigs: configs, linkedTariffIds: configs.map(c => c.tariffId) }
    })
  }, [])

  const handleUpdateLinkedTariffConfig = useCallback((tariffId, patch) => {
    setEditingTariff(prev => {
      if (!prev || !Array.isArray(prev.linkedTariffConfigs)) return prev
      const configs = prev.linkedTariffConfigs.map(c =>
        c.tariffId === tariffId
          ? {
              ...c,
              ...(patch.subscriptionLink !== undefined && { subscriptionLink: String(patch.subscriptionLink).trim() }),
              ...(patch.devices !== undefined && { devices: Number(patch.devices) || 1 }),
              ...(patch.trafficGB !== undefined && { trafficGB: Number(patch.trafficGB) ?? 0 }),
            }
          : c
      )
      return { ...prev, linkedTariffConfigs: configs }
    })
  }, [])

  const handleDeduplicateTariffs = useCallback(async () => {
    if (!window.confirm('Объединить все дубли тарифов? Останется по одному тарифу на каждую одинаковую комбинацию (название, план, цена, устройства, трафик, срок). Пользователи и платежи будут привязаны к оставшимся тарифам.')) return
    try {
      const result = await adminService.deduplicateTariffs()
      await loadTariffs()
      setSuccess(`Удалено дублей: ${result.deleted}, осталось тарифов: ${result.kept}. Переназначено пользователей: ${result.remappedUsers}, платежей: ${result.remappedPayments}.`)
      setTimeout(() => setSuccess(''), 5000)
    } catch (err) {
      logger.error('Admin', 'Ошибка удаления дублей тарифов', null, err)
      setError(err?.message || 'Ошибка удаления дублей тарифов')
    }
  }, [loadTariffs, setError, setSuccess])

  return {
    editingTariff,
    setEditingTariff,
    loadTariffs,
    handleSaveTariff,
    handleDeleteTariff,
    handleTariffNameChange,
    handleTariffPlanChange,
    handleTariffPriceChange,
    handleTariffDevicesChange,
    handleTariffTrafficGBChange,
    handleTariffDurationDaysChange,
    handleTariffActiveChange,
    handleTariffSubscriptionLinkChange,
    handleTariffLinkedTariffIdsChange,
    handleAddLinkedTariff,
    handleRemoveLinkedTariff,
    handleUpdateLinkedTariffConfig,
    handleDeduplicateTariffs,
  }
}

