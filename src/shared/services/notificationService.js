import logger from '../utils/logger.js'

/**
 * Сервис для работы с браузерными push-уведомлениями
 */
class NotificationService {
  constructor() {
    this.permission = null
    this.checkPermission()
  }

  /**
   * Проверка текущего статуса разрешений
   */
  checkPermission() {
    if (!('Notification' in window)) {
      logger.warn('Notification', 'Браузер не поддерживает уведомления')
      this.permission = 'unsupported'
      return 'unsupported'
    }

    this.permission = Notification.permission
    logger.debug('Notification', 'Текущий статус разрешений', { permission: this.permission })
    return this.permission
  }

  /**
   * Запрос разрешения на уведомления
   * @returns {Promise<string>} Статус разрешения
   */
  async requestPermission() {
    if (!('Notification' in window)) {
      logger.warn('Notification', 'Браузер не поддерживает уведомления')
      return 'unsupported'
    }

    if (Notification.permission === 'granted') {
      this.permission = 'granted'
      logger.info('Notification', 'Разрешение на уведомления уже предоставлено')
      return 'granted'
    }

    if (Notification.permission === 'denied') {
      this.permission = 'denied'
      logger.warn('Notification', 'Разрешение на уведомления отклонено пользователем')
      return 'denied'
    }

    try {
      const permission = await Notification.requestPermission()
      this.permission = permission
      
      if (permission === 'granted') {
        logger.info('Notification', 'Разрешение на уведомления предоставлено')
      } else {
        logger.info('Notification', 'Разрешение на уведомления отклонено', { permission })
      }
      
      return permission
    } catch (error) {
      logger.error('Notification', 'Ошибка при запросе разрешения', null, error)
      return 'denied'
    }
  }

  /**
   * Проверка, есть ли разрешение на уведомления
   * @returns {boolean}
   */
  hasPermission() {
    return this.checkPermission() === 'granted'
  }

  /**
   * Отправка уведомления
   * @param {string} title - Заголовок уведомления
   * @param {Object} options - Опции уведомления (body, icon, badge, tag, data)
   * @returns {Notification|null} Объект уведомления или null
   */
  async showNotification(title, options = {}) {
    if (!this.hasPermission()) {
      logger.warn('Notification', 'Нет разрешения на уведомления', { 
        permission: this.permission,
        title 
      })
      return null
    }

    try {
      const defaultOptions = {
        body: '',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'vpn-notification',
        requireInteraction: false,
        silent: false,
        ...options
      }

      // Проверяем, есть ли активная вкладка
      // Если вкладка активна, показываем уведомление с requireInteraction: false
      // Если вкладка неактивна, показываем обычное уведомление
      const isPageVisible = !document.hidden
      if (isPageVisible) {
        defaultOptions.requireInteraction = false
      }

      const notification = new Notification(title, defaultOptions)

      // Обработка клика по уведомлению
      notification.onclick = (event) => {
        event.preventDefault()
        window.focus()
        notification.close()
        
        // Если это уведомление об оплате подписки, отправляем кастомное событие для открытия модального окна
        if (options.data && options.data.type && 
            (options.data.type === 'subscription-expiring-soon' || 
             options.data.type === 'subscription-expiring-today' || 
             options.data.type === 'subscription-expired')) {
          // Отправляем кастомное событие для открытия окна оплаты
          window.dispatchEvent(new CustomEvent('openPaymentModal', {
            detail: {
              type: options.data.type,
              url: options.data.url
            }
          }))
          logger.info('Notification', 'Отправлено событие для открытия окна оплаты', {
            type: options.data.type
          })
        } else if (options.data && options.data.url) {
          // Для других уведомлений просто переходим на URL
          window.location.href = options.data.url
        }
      }

      // Автоматическое закрытие через 5 секунд (если не requireInteraction)
      if (!defaultOptions.requireInteraction) {
        setTimeout(() => {
          notification.close()
        }, 5000)
      }

      logger.info('Notification', 'Уведомление отправлено', { 
        title,
        tag: defaultOptions.tag,
        isPageVisible
      })

      return notification
    } catch (error) {
      logger.error('Notification', 'Ошибка при отправке уведомления', { title }, error)
      return null
    }
  }

  /**
   * Уведомление о необходимости оплаты тарифа
   * @param {string} tariffName - Название тарифа
   * @param {string} expiryDate - Дата окончания
   */
  async notifySubscriptionExpiringSoon(tariffName, expiryDate) {
    const title = 'Пора оплатить подписку'
    const body = `Ваша подписка "${tariffName}" скоро истечет. Оплатите тариф, чтобы продолжить пользоваться VPN без перерывов.`
    
    return await this.showNotification(title, {
      body,
      tag: 'subscription-expiring-soon',
      requireInteraction: true,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: {
        url: '/dashboard?tab=subscription',
        type: 'subscription-expiring-soon',
        action: 'open_payment'
      }
    })
  }

  /**
   * Уведомление о необходимости оплаты тарифа (сегодня последний день)
   * @param {string} tariffName - Название тарифа
   */
  async notifySubscriptionExpiringToday(tariffName) {
    const title = 'Срочно: оплатите подписку'
    const body = `Ваша подписка "${tariffName}" истекает сегодня! Оплатите тариф сейчас, чтобы не потерять доступ к VPN.`
    
    return await this.showNotification(title, {
      body,
      tag: 'subscription-expiring-today',
      requireInteraction: true,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: {
        url: '/dashboard?tab=subscription',
        type: 'subscription-expiring-today',
        action: 'open_payment'
      }
    })
  }

  /**
   * Уведомление об окончании подписки - срочно оплатить
   * @param {string} tariffName - Название тарифа
   */
  async notifySubscriptionExpired(tariffName) {
    const title = 'Подписка истекла - оплатите сейчас'
    const body = `Ваша подписка "${tariffName}" истекла. Оплатите тариф, чтобы восстановить доступ к VPN.`
    
    return await this.showNotification(title, {
      body,
      tag: 'subscription-expired',
      requireInteraction: true,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: {
        url: '/dashboard?tab=subscription',
        type: 'subscription-expired',
        action: 'open_payment'
      }
    })
  }

  /**
   * Уведомление об успешной оплате
   * @param {string} tariffName - Название тарифа
   * @param {number} amount - Сумма оплаты
   */
  async notifyPaymentSuccess(tariffName, amount) {
    const title = 'Оплата успешна'
    const body = `Ваша подписка "${tariffName}" успешно активирована. Сумма: ${amount} ₽.`
    
    return await this.showNotification(title, {
      body,
      tag: 'payment-success',
      requireInteraction: false,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: {
        url: '/dashboard?tab=subscription',
        type: 'payment-success'
      }
    })
  }

  /**
   * Уведомление о неуспешной оплате
   * @param {string} reason - Причина неудачи
   */
  async notifyPaymentFailed(reason = '') {
    const title = 'Оплата не прошла'
    const body = reason 
      ? `Оплата не прошла: ${reason}. Попробуйте еще раз или обратитесь в поддержку.`
      : 'Оплата не прошла. Попробуйте еще раз или обратитесь в поддержку.'
    
    return await this.showNotification(title, {
      body,
      tag: 'payment-failed',
      requireInteraction: true,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: {
        url: '/dashboard?tab=subscription',
        type: 'payment-failed'
      }
    })
  }

  /**
   * Форматирование даты для отображения
   * @param {string|number|Date} date - Дата
   * @returns {string} Отформатированная дата
   */
  formatDate(date) {
    if (!date) return ''
    
    const dateObj = typeof date === 'number' 
      ? new Date(date) 
      : new Date(date)
    
    if (isNaN(dateObj.getTime())) return ''
    
    return dateObj.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  /**
   * Закрытие всех уведомлений с определенным тегом
   * @param {string} tag - Тег уведомлений
   */
  closeNotificationsByTag(tag) {
    // Браузерные уведомления закрываются автоматически или по клику
    // Этот метод можно использовать для логирования
    logger.debug('Notification', 'Закрытие уведомлений по тегу', { tag })
  }
}

// Singleton instance
let instance = null

export default {
  getInstance() {
    if (!instance) {
      instance = new NotificationService()
    }
    return instance
  },
}
