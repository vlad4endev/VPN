import { useEffect, useRef } from 'react'
import notificationService from '../../../shared/services/notificationService.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Хук для проверки подписок и отправки уведомлений
 * @param {Object} currentUser - Текущий пользователь
 */
export function useSubscriptionNotifications(currentUser) {
  // ВАЖНО: Все хуки должны вызываться всегда, в одном и том же порядке
  // Нельзя делать ранний return до вызова всех хуков - это нарушает правила хуков React
  
  // Отслеживаем время последнего уведомления для ограничения частоты (не чаще 2 раз в день)
  const lastNotificationTimeRef = useRef(null)

  useEffect(() => {
    // Проверяем наличие currentUser внутри useEffect
    if (!currentUser || !currentUser.id) {
      return
    }

    // Получаем экземпляр notificationService внутри useEffect
    const notificationInstance = notificationService.getInstance()

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
        const twelveHoursMs = 12 * 60 * 60 * 1000

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
        
        // Определяем время суток (утро: 6-12, вечер: 18-24)
        const currentHour = new Date(now).getHours()
        const isMorning = currentHour >= 6 && currentHour < 12
        const isEvening = currentHour >= 18 && currentHour < 24

        // Проверяем, нужно ли отправлять уведомление (два раза в день)
        // Отправляем если:
        // 1. Подписка истекает через 7 дней или меньше ИЛИ уже истекла
        // 2. Сейчас утро (6-12) или вечер (18-24)
        // 3. Последнее уведомление было больше 12 часов назад
        
        const shouldNotifyByTime = (isMorning || isEvening)
        const shouldNotifyByExpiry = timeUntilExpiry <= 7 * oneDayMs || timeUntilExpiry <= 0
        
        if (!shouldNotifyByTime || !shouldNotifyByExpiry) {
          return
        }

        // Проверяем, не отправляли ли мы уведомление в последние 12 часов
        const lastNotificationTime = lastNotificationTimeRef.current
        const shouldNotify = !lastNotificationTime || (now - lastNotificationTime) > twelveHoursMs

        if (!shouldNotify) {
          return
        }

        // Определяем тип уведомления в зависимости от времени до окончания
        if (timeUntilExpiry <= 0) {
          // Подписка уже истекла
          await notificationInstance.notifySubscriptionExpired(tariffName)
          lastNotificationTimeRef.current = now
          logger.info('SubscriptionNotifications', 'Отправлено уведомление: подписка истекла', {
            userId: currentUser.id,
            expiredAt: new Date(expiryTime).toISOString(),
            timeOfDay: isMorning ? 'morning' : 'evening'
          })
        } else if (daysUntilExpiry === 0) {
          // Подписка истекает сегодня
          await notificationInstance.notifySubscriptionExpiringToday(tariffName)
          lastNotificationTimeRef.current = now
          logger.info('SubscriptionNotifications', 'Отправлено уведомление: подписка истекает сегодня', {
            userId: currentUser.id,
            timeOfDay: isMorning ? 'morning' : 'evening'
          })
        } else if (daysUntilExpiry <= 7) {
          // Подписка истекает в ближайшие 7 дней
          await notificationInstance.notifySubscriptionExpiringSoon(tariffName, expiryTime)
          lastNotificationTimeRef.current = now
          logger.info('SubscriptionNotifications', 'Отправлено уведомление: нужно оплатить подписку', {
            userId: currentUser.id,
            daysUntilExpiry,
            expiryTime: new Date(expiryTime).toISOString(),
            timeOfDay: isMorning ? 'morning' : 'evening'
          })
        }
      } catch (error) {
        logger.error('SubscriptionNotifications', 'Ошибка при проверке подписки и отправке уведомлений', {
          userId: currentUser?.id
        }, error)
      }
    }

    // Функция для расчета следующего времени проверки (утро или вечер)
    const getNextCheckTime = () => {
      const now = new Date()
      const currentHour = now.getHours()
      let nextCheck = new Date(now)
      
      if (currentHour < 6) {
        // До 6 утра - проверяем в 6 утра
        nextCheck.setHours(6, 0, 0, 0)
      } else if (currentHour < 12) {
        // Утро (6-12) - уже прошло, следующая проверка в 18:00
        nextCheck.setHours(18, 0, 0, 0)
      } else if (currentHour < 18) {
        // День (12-18) - следующая проверка в 18:00
        nextCheck.setHours(18, 0, 0, 0)
      } else {
        // Вечер (18-24) - уже прошло, следующая проверка завтра в 6:00
        nextCheck.setDate(nextCheck.getDate() + 1)
        nextCheck.setHours(6, 0, 0, 0)
      }
      
      return nextCheck.getTime() - now.getTime()
    }

    // Проверяем сразу, если сейчас утро или вечер
    const currentHour = new Date().getHours()
    if ((currentHour >= 6 && currentHour < 12) || (currentHour >= 18 && currentHour < 24)) {
      checkSubscriptionAndNotify()
    }

    // Устанавливаем таймер на следующую проверку (утро или вечер)
    const scheduleNextCheck = () => {
      const delay = getNextCheckTime()
      setTimeout(() => {
        checkSubscriptionAndNotify()
        // После проверки планируем следующую
        scheduleNextCheck()
      }, delay)
    }
    
    scheduleNextCheck()

    // Дополнительно проверяем каждый час на случай пропуска основного таймера
    const hourlyCheck = setInterval(() => {
      const currentHour = new Date().getHours()
      if ((currentHour >= 6 && currentHour < 12) || (currentHour >= 18 && currentHour < 24)) {
        checkSubscriptionAndNotify()
      }
    }, 60 * 60 * 1000)

    return () => {
      clearInterval(hourlyCheck)
    }
  }, [
    currentUser?.id,
    currentUser?.expiresAt,
    currentUser?.testPeriodEndDate,
    currentUser?.tariffName
  ])
}
