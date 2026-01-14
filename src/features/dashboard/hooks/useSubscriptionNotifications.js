import { useEffect, useRef } from 'react'
import notificationService from '../../../shared/services/notificationService.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Хук для проверки подписок и отправки уведомлений
 * @param {Object} currentUser - Текущий пользователь
 */
export function useSubscriptionNotifications(currentUser) {
  const notificationInstance = notificationService.getInstance()
  const lastNotificationRef = useRef({
    expiringSoon: null,
    expiringToday: null,
    expired: null,
  })

  useEffect(() => {
    if (!currentUser || !currentUser.id) {
      return
    }

    // Проверяем разрешение на уведомления
    if (!notificationInstance.hasPermission()) {
      logger.debug('SubscriptionNotifications', 'Нет разрешения на уведомления, пропускаем проверку')
      return
    }

    const checkSubscriptionAndNotify = async () => {
      try {
        const now = Date.now()
        const oneDayMs = 24 * 60 * 60 * 1000
        const oneHourMs = 60 * 60 * 1000

        // Получаем дату окончания подписки
        let expiryTime = null
        if (currentUser.expiresAt && currentUser.expiresAt > 0) {
          expiryTime = typeof currentUser.expiresAt === 'number' 
            ? currentUser.expiresAt 
            : new Date(currentUser.expiresAt).getTime()
        }

        // Если нет даты окончания, проверяем тестовый период
        if (!expiryTime && currentUser.testPeriodEndDate) {
          expiryTime = typeof currentUser.testPeriodEndDate === 'number'
            ? currentUser.testPeriodEndDate
            : new Date(currentUser.testPeriodEndDate).getTime()
        }

        if (!expiryTime || expiryTime <= 0) {
          // Нет активной подписки
          return
        }

        const tariffName = currentUser.tariffName || 'Ваша подписка'
        const timeUntilExpiry = expiryTime - now
        const daysUntilExpiry = Math.floor(timeUntilExpiry / oneDayMs)
        const hoursUntilExpiry = Math.floor(timeUntilExpiry / oneHourMs)

        // Уведомление за 1 день до окончания (от 24 до 25 часов)
        if (timeUntilExpiry > 0 && timeUntilExpiry <= oneDayMs + oneHourMs && timeUntilExpiry >= oneDayMs - oneHourMs) {
          const lastNotification = lastNotificationRef.current.expiringSoon
          const shouldNotify = !lastNotification || (now - lastNotification) > oneDayMs

          if (shouldNotify) {
            await notificationInstance.notifySubscriptionExpiringSoon(tariffName, expiryTime)
            lastNotificationRef.current.expiringSoon = now
            logger.info('SubscriptionNotifications', 'Отправлено уведомление: подписка истекает завтра', {
              userId: currentUser.id,
              expiryTime: new Date(expiryTime).toISOString()
            })
          }
        }

        // Уведомление в день окончания (от 0 до 24 часов до окончания)
        if (timeUntilExpiry > 0 && timeUntilExpiry <= oneDayMs && timeUntilExpiry > 0) {
          const lastNotification = lastNotificationRef.current.expiringToday
          const shouldNotify = !lastNotification || (now - lastNotification) > oneHourMs

          if (shouldNotify && daysUntilExpiry === 0) {
            await notificationInstance.notifySubscriptionExpiringToday(tariffName)
            lastNotificationRef.current.expiringToday = now
            logger.info('SubscriptionNotifications', 'Отправлено уведомление: подписка истекает сегодня', {
              userId: currentUser.id,
              hoursLeft: hoursUntilExpiry
            })
          }
        }

        // Уведомление когда подписка уже истекла
        if (timeUntilExpiry <= 0) {
          const lastNotification = lastNotificationRef.current.expired
          const shouldNotify = !lastNotification || (now - lastNotification) > oneDayMs

          if (shouldNotify) {
            await notificationInstance.notifySubscriptionExpired(tariffName)
            lastNotificationRef.current.expired = now
            logger.info('SubscriptionNotifications', 'Отправлено уведомление: подписка истекла', {
              userId: currentUser.id,
              expiredAt: new Date(expiryTime).toISOString()
            })
          }
        }
      } catch (error) {
        logger.error('SubscriptionNotifications', 'Ошибка при проверке подписки и отправке уведомлений', {
          userId: currentUser?.id
        }, error)
      }
    }

    // Проверяем сразу
    checkSubscriptionAndNotify()

    // Проверяем каждые 30 минут
    const interval = setInterval(checkSubscriptionAndNotify, 30 * 60 * 1000)

    return () => {
      clearInterval(interval)
    }
  }, [
    currentUser?.id,
    currentUser?.expiresAt,
    currentUser?.testPeriodEndDate,
    currentUser?.tariffName,
    notificationInstance
  ])
}
