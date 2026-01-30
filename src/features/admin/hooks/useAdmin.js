import { useMemo } from 'react'
import { useUsers } from './useUsers.js'
import { useServers } from './useServers.js'
import { useTariffs } from './useTariffs.js'
import { useSettings } from './useSettings.js'
import { useReviews } from './useReviews.js'

/**
 * Главный хук для управления Admin панелью
 * Координирует работу всех под-хуков
 * 
 * @param {Object} params - Параметры
 * @param {Object} params.currentUser - Текущий пользователь (должен быть админом)
 * @param {Array} params.users - Список пользователей
 * @param {Function} params.setUsers - Функция для обновления списка пользователей
 * @param {Function} params.setCurrentUser - Функция для обновления текущего пользователя
 * @param {Array} params.tariffs - Список тарифов
 * @param {Function} params.setTariffs - Функция для обновления списка тарифов
 * @param {Function} params.setError - Функция для установки ошибки
 * @param {Function} params.setSuccess - Функция для установки сообщения об успехе
 * @returns {Object} Объект с состоянием и методами Admin панели
 */
export function useAdmin({
  currentUser,
  users,
  setUsers,
  setCurrentUser,
  tariffs,
  setTariffs,
  setError,
  setSuccess,
  adminTab = 'users', // Принимаем из пропсов, если передано
  setAdminTab = () => {}, // Принимаем из пропсов, если передано
}) {
  // Состояние активной вкладки - теперь принимается из пропсов
  // const [adminTab, setAdminTab] = useState('users') // Убрано для исправления ошибки

  // Хуки для различных частей Admin панели
  const settingsHook = useSettings(currentUser, setError, setSuccess)
  const serversHook = useServers(
    currentUser,
    settingsHook.servers,
    (newServers) => {
      settingsHook.setServers(newServers)
      settingsHook.setSettings(prev => prev ? { ...prev, servers: newServers } : null)
    },
    settingsHook.settings,
    settingsHook.setSettings,
    setError,
    setSuccess
  )

  const usersHook = useUsers(
    currentUser,
    users,
    setUsers,
    setCurrentUser,
    settingsHook.settings,
    setError,
    setSuccess
  )

  const tariffsHook = useTariffs(tariffs, setTariffs, setError, setSuccess)
  const reviewsHook = useReviews(currentUser, setError, setSuccess)

  // Создаем стабильные функции с fallback, используя useMemo для обновления при изменении
  const safeHandleSaveUserCard = useMemo(() => {
    if (usersHook?.handleSaveUserCard && typeof usersHook.handleSaveUserCard === 'function') {
      return usersHook.handleSaveUserCard
    }
    if (import.meta.env.DEV) {
      console.warn('⚠️ useAdmin: handleSaveUserCard не определен, используется fallback')
    }
    // Fallback функция
    return async (updatedUser) => {
      console.error('❌ useAdmin: handleSaveUserCard не определен в usersHook!', {
        usersHookKeys: usersHook ? Object.keys(usersHook) : 'usersHook is null',
        updatedUser
      })
      throw new Error('Функция сохранения пользователя не доступна')
    }
  }, [usersHook?.handleSaveUserCard])
  
  const safeGenerateUUID = useMemo(() => {
    if (usersHook.generateUUID && typeof usersHook.generateUUID === 'function') {
      return usersHook.generateUUID
    }
    // Fallback функция
    return () => {
      console.error('❌ useAdmin: generateUUID не определен в usersHook!', {
        usersHookKeys: Object.keys(usersHook),
      })
      return ''
    }
  }, [usersHook.generateUUID])

  const safeGenerateSubId = useMemo(() => {
    if (usersHook.generateSubId && typeof usersHook.generateSubId === 'function') {
      return usersHook.generateSubId
    }
    // Fallback функция
    return () => {
      console.error('❌ useAdmin: generateSubId не определен в usersHook!', {
        usersHookKeys: Object.keys(usersHook),
      })
      return ''
    }
  }, [usersHook.generateSubId])

  return {
    // Состояние вкладки управляется в AdminProviderWrapper, не возвращаем его здесь
    // adminTab и setAdminTab передаются как пропсы, но не возвращаются
    
    // Настройки
    settings: settingsHook.settings,
    settingsLoading: settingsHook.settingsLoading,
    loadSettings: settingsHook.loadSettings,
    handleSaveSettings: settingsHook.handleSaveSettings,
    
    // Серверы
    servers: settingsHook.servers,
    editingServer: serversHook.editingServer,
    testingServerId: serversHook.testingServerId,
    setEditingServer: serversHook.setEditingServer,
    handleAddServer: serversHook.handleAddServer,
    handleSaveServer: serversHook.handleSaveServer,
    handleDeleteServer: serversHook.handleDeleteServer,
    handleTestServerSession: serversHook.handleTestServerSession,
    handleServerNameChange: serversHook.handleServerNameChange,
    handleServerIPChange: serversHook.handleServerIPChange,
    handleServerPortChange: serversHook.handleServerPortChange,
    handleServerProtocolChange: serversHook.handleServerProtocolChange,
    handleServerRandompathChange: serversHook.handleServerRandompathChange,
    handleServerXuiUsernameChange: serversHook.handleServerXuiUsernameChange,
    handleServerXuiPasswordChange: serversHook.handleServerXuiPasswordChange,
    handleServerXuiInboundIdChange: serversHook.handleServerXuiInboundIdChange,
    handleServerLocationChange: serversHook.handleServerLocationChange,
    handleServerActiveChange: serversHook.handleServerActiveChange,
    handleServerTariffChange: serversHook.handleServerTariffChange,
    
    // Пользователи
    editingUser: usersHook.editingUser,
    usersLoading: usersHook.loading,
    setEditingUser: usersHook.setEditingUser,
    loadUsers: usersHook.loadUsers,
    handleUpdateUser: usersHook.handleUpdateUser,
    handleDeleteUser: usersHook.handleDeleteUser,
    handleSaveUserCard: safeHandleSaveUserCard,
    generateUUID: safeGenerateUUID,
    generateSubId: safeGenerateSubId,
    
    // Тарифы
    editingTariff: tariffsHook.editingTariff,
    setEditingTariff: tariffsHook.setEditingTariff,
    loadTariffs: tariffsHook.loadTariffs,
    handleSaveTariff: tariffsHook.handleSaveTariff,
    handleDeleteTariff: tariffsHook.handleDeleteTariff,
    handleTariffNameChange: tariffsHook.handleTariffNameChange,
    handleTariffPlanChange: tariffsHook.handleTariffPlanChange,
    handleTariffPriceChange: tariffsHook.handleTariffPriceChange,
    handleTariffDevicesChange: tariffsHook.handleTariffDevicesChange,
    handleTariffTrafficGBChange: tariffsHook.handleTariffTrafficGBChange,
    handleTariffDurationDaysChange: tariffsHook.handleTariffDurationDaysChange,
    handleTariffActiveChange: tariffsHook.handleTariffActiveChange,
    handleTariffSubscriptionLinkChange: tariffsHook.handleTariffSubscriptionLinkChange,

    // Отзывы пользователей
    reviews: reviewsHook.reviews,
    reviewsLoading: reviewsHook.reviewsLoading,
    loadReviews: reviewsHook.loadReviews,
    handleApproveReview: reviewsHook.handleApproveReview,
    handleRejectReview: reviewsHook.handleRejectReview,
  }
}

