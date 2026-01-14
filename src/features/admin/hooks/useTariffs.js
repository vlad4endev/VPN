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

  // Сохранение тарифа
  const handleSaveTariff = useCallback(async (tariffData) => {
    // Проверяем, что это редактирование существующего тарифа SUPER или MULTI
    if (!editingTariff || !editingTariff.id || editingTariff.id.startsWith('default-')) {
      setError('Можно редактировать только существующие тарифы SUPER и MULTI')
      return
    }

    // Проверяем, что тариф - это SUPER или MULTI
    const plan = tariffData.plan?.toLowerCase()
    const name = tariffData.name?.toLowerCase()
    if (plan !== 'super' && plan !== 'multi' && name !== 'super' && name !== 'multi') {
      setError('Разрешены только тарифы SUPER и MULTI')
      return
    }

    try {
      await adminService.saveTariff(editingTariff.id, tariffData)
      setTariffs(prev => prev.map(t => t.id === editingTariff.id ? { ...t, ...tariffData } : t))
      setSuccess('Тариф сохранен')
      setEditingTariff(null)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      logger.error('Admin', 'Ошибка сохранения тарифа', { tariffId: editingTariff?.id }, err)
      setError('Ошибка сохранения тарифа')
    }
  }, [editingTariff, tariffs, setTariffs, setError, setSuccess])

  // Удаление тарифа
  const handleDeleteTariff = useCallback(async (tariffId) => {
    const tariff = tariffs.find(t => t.id === tariffId)
    if (!tariff) return

    // Проверяем, что это не SUPER или MULTI
    const plan = tariff.plan?.toLowerCase()
    const name = tariff.name?.toLowerCase()
    if (plan === 'super' || plan === 'multi' || name === 'super' || name === 'multi') {
      setError('Нельзя удалить тарифы SUPER и MULTI')
      setTimeout(() => setError(''), 3000)
      return
    }

    if (!window.confirm('Вы уверены, что хотите удалить этот тариф?')) {
      return
    }

    try {
      await adminService.deleteTariff(tariffId)
      setTariffs(prev => prev.filter(t => t.id !== tariffId))
      setSuccess('Тариф удален')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      logger.error('Admin', 'Ошибка удаления тарифа', { tariffId }, err)
      setError('Ошибка удаления тарифа')
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
  }
}

