import { useQuery } from '@tanstack/react-query'
import { useFirebase } from './useFirebase.js'
import { getSubscriptionById, getActiveSubscriptionByUserId } from '../utils/subscriptionUtils.js'
import { getUserStatus } from '../utils/userStatus.js'

/**
 * Хук для получения статуса подписки пользователя
 * Автоматически загружает subscription и возвращает статус на основе subscription.status
 * 
 * @param {Object} user - Данные пользователя
 * @param {Object|null} clientStats - Опциональная статистика из 3x-ui
 * @returns {Object} { status, label, color, subscription, isLoading }
 */
export function useSubscriptionStatus(user, clientStats = null) {
  const { db } = useFirebase()
  
  // Загружаем subscription если есть subscriptionId или userId
  const { data: subscription, isLoading } = useQuery({
    queryKey: ['subscription', user?.subscriptionId, user?.id],
    queryFn: async () => {
      if (!db || !user) {
        return null
      }
      
      // Если есть subscriptionId, используем его напрямую (быстрее)
      if (user.subscriptionId) {
        return await getSubscriptionById(db, user.subscriptionId)
      }
      
      // Иначе пытаемся найти активную подписку по userId
      if (user.id) {
        return await getActiveSubscriptionByUserId(db, user.id)
      }
      
      return null
    },
    enabled: !!db && !!user && (!!user.subscriptionId || !!user.id),
    staleTime: 30 * 1000, // 30 секунд
  })
  
  // Вычисляем статус на основе subscription.status (единственный источник правды)
  const userStatus = getUserStatus(user, clientStats, subscription)
  
  return {
    status: userStatus.status,
    label: userStatus.label,
    color: userStatus.color,
    subscription,
    isLoading,
  }
}
