import logger from '../../../shared/utils/logger.js'

/**
 * Сервис для работы с платежами через YooMoney
 */
class PaymentService {
  /**
   * Генерация ссылки на оплату
   * @param {string} userId - ID пользователя
   * @param {number} amount - Сумма платежа
   * @param {string} tariffId - ID тарифа (опционально)
   * @param {Object} paymentSettings - Настройки платежной системы (yoomoneyWallet, yoomoneySecretKey)
   * @returns {Promise<Object>} Объект с paymentUrl и orderId
   */
  async generatePaymentLink(userId, amount, tariffId = null, paymentSettings = {}) {
    try {
      logger.info('Payment', 'Генерация ссылки на оплату', { 
        userId, 
        amount, 
        tariffId,
        hasPaymentSettings: !!paymentSettings && Object.keys(paymentSettings).length > 0
      })

      const response = await fetch('/api/payment/generate-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          amount: Number(amount),
          tariffId,
          paymentSettings: paymentSettings || {},
        }),
      })

      // Получаем текст ответа для диагностики
      const responseText = await response.text()
      logger.info('Payment', 'Получен ответ от сервера (raw)', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        responseText: responseText.substring(0, 1000)
      })

      if (!response.ok) {
        let errorData = {}
        try {
          errorData = JSON.parse(responseText)
        } catch (e) {
          errorData = { error: responseText || `HTTP ${response.status}: ${response.statusText}` }
        }
        logger.error('Payment', 'Ошибка HTTP от сервера', {
          status: response.status,
          errorData,
          responseText: responseText.substring(0, 500)
        })
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      // Парсим JSON ответ
      let data = null
      try {
        data = JSON.parse(responseText)
      } catch (e) {
        logger.error('Payment', 'Ошибка парсинга JSON ответа', {
          responseText: responseText.substring(0, 500),
          parseError: e.message
        })
        throw new Error('Некорректный формат ответа от сервера')
      }

      logger.info('Payment', 'Получен ответ от сервера (parsed)', {
        hasData: !!data,
        dataKeys: data ? Object.keys(data) : [],
        hasPaymentUrl: !!data?.paymentUrl,
        hasOrderId: !!data?.orderId,
        dataType: Array.isArray(data) ? 'array' : typeof data,
        dataPreview: JSON.stringify(data).substring(0, 1000),
        fullData: data
      })

      if (data.error) {
        logger.error('Payment', 'Ошибка в ответе от сервера', { error: data.error, fullData: data })
        throw new Error(data.error)
      }

      // Обрабатываем случай, когда ответ - массив
      let paymentData = data
      if (Array.isArray(data) && data.length > 0) {
        paymentData = data[0]
        logger.info('Payment', 'Ответ от сервера - массив, извлечен первый элемент', {
          hasPaymentUrl: !!paymentData?.paymentUrl,
          hasOrderId: !!paymentData?.orderId
        })
      }

      if (!paymentData.paymentUrl || !paymentData.orderId) {
        logger.error('Payment', 'Неполные данные от сервера', {
          receivedData: paymentData,
          originalData: data,
          hasPaymentUrl: !!paymentData?.paymentUrl,
          hasOrderId: !!paymentData?.orderId,
          allKeys: paymentData ? Object.keys(paymentData) : []
        })
        throw new Error('Неполные данные от сервера: отсутствует paymentUrl или orderId')
      }

      logger.info('Payment', 'Ссылка на оплату успешно сгенерирована', {
        userId,
        orderId: data.orderId,
        hasPaymentUrl: !!data.paymentUrl,
      })

      return {
        success: true,
        paymentUrl: paymentData.paymentUrl,
        orderId: paymentData.orderId,
        amount: paymentData.amount || paymentData.amount,
      }
    } catch (error) {
      logger.error('Payment', 'Ошибка генерации ссылки на оплату', { userId, amount, tariffId }, error)
      throw error
    }
  }

  /**
   * Проверка статуса платежа
   * @param {string} orderId - ID заказа
   * @returns {Promise<Object>} Статус платежа
   */
  async checkPaymentStatus(orderId) {
    try {
      logger.info('Payment', 'Проверка статуса платежа', { orderId })

      // TODO: Реализовать проверку статуса через API
      // Пока возвращаем заглушку
      return {
        success: true,
        status: 'pending',
        orderId,
      }
    } catch (error) {
      logger.error('Payment', 'Ошибка проверки статуса платежа', { orderId }, error)
      throw error
    }
  }
}

// Singleton instance
let instance = null

export default {
  getInstance() {
    if (!instance) {
      instance = new PaymentService()
    }
    return instance
  },
}
