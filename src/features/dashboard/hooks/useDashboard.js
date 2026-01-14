import { useState } from 'react'
import { usePayments } from './usePayments.js'
import { useProfile } from './useProfile.js'
import { useSubscription } from './useSubscription.js'

/**
 * Главный хук для управления Dashboard
 * Координирует работу всех под-хуков
 * 
 * @param {Object} params - Параметры
 * @param {Object} params.currentUser - Текущий пользователь
 * @param {Function} params.setCurrentUser - Функция для обновления текущего пользователя
 * @param {Function} params.setUsers - Функция для обновления списка пользователей (для админа)
 * @param {Array} params.tariffs - Список тарифов
 * @param {Function} params.setError - Функция для установки ошибки
 * @param {Function} params.setSuccess - Функция для установки сообщения об успехе
 * @param {Function} params.onLogout - Функция для выхода
 * @returns {Object} Объект с состоянием и методами Dashboard
 */
export function useDashboard({
  currentUser,
  setCurrentUser,
  setUsers,
  tariffs,
  setError,
  setSuccess,
  onLogout,
}) {
  // Состояние активной вкладки
  const [dashboardTab, setDashboardTab] = useState('subscription') // 'subscription' | 'profile' | 'payments'

  // Хуки для различных частей Dashboard
  const payments = usePayments(currentUser, dashboardTab)
  const profile = useProfile(currentUser, setCurrentUser, setUsers, setError, setSuccess)
  const subscription = useSubscription(
    currentUser,
    setCurrentUser,
    setUsers,
    tariffs,
    setError,
    setSuccess
  )

  return {
    // Состояние вкладки
    dashboardTab,
    setDashboardTab,
    
    // Платежи
    payments: payments.payments,
    paymentsLoading: payments.paymentsLoading,
    loadPayments: payments.loadPayments,
    
    // Профиль
    editingProfile: profile.editingProfile,
    profileData: profile.profileData,
    setEditingProfile: profile.setEditingProfile,
    handleProfileNameChange: profile.handleProfileNameChange,
    handleProfilePhoneChange: profile.handleProfilePhoneChange,
    handleUpdateProfile: profile.handleUpdateProfile,
    handleDeleteAccount: () => profile.handleDeleteAccount(onLogout),
    
    // Подписки
    selectedTariff: subscription.selectedTariff,
    creatingSubscription: subscription.creatingSubscription,
    setSelectedTariff: subscription.setSelectedTariff,
    handleCreateSubscription: subscription.handleCreateSubscription,
    handleRenewSubscription: subscription.handleRenewSubscription,
    handleGetKey: subscription.handleGetKey,
  }
}

