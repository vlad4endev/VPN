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
   * @param {Object} userData - Данные пользователя (uuid, email, inboundId) - опционально
   * @returns {Promise<Object>} Объект с paymentUrl и orderId
   */
  async generatePaymentLink(userId, amount, tariffId = null, paymentSettings = {}, userData = null) {
    try {
      logger.info('Payment', 'Генерация ссылки на оплату', { 
        userId, 
        amount, 
        tariffId,
        hasPaymentSettings: !!paymentSettings && Object.keys(paymentSettings).length > 0,
        hasUserData: !!userData,
        userData: userData
      })

      const requestBody = {
        userId,
        amount: Number(amount),
        tariffId,
        paymentSettings: paymentSettings || {},
      }

      // Добавляем данные пользователя, если они переданы
      if (userData && (userData.uuid || userData.email || userData.inboundId)) {
        requestBody.userData = {
          uuid: userData.uuid || null,
          email: userData.email || null,
          userId: userId,
          inboundId: userData.inboundId || null
        }
        logger.info('Payment', 'Данные пользователя добавлены в запрос', {
          hasUuid: !!userData.uuid,
          hasEmail: !!userData.email,
          hasInboundId: !!userData.inboundId
        })
      }

      const response = await fetch('/api/payment/generate-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
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
        
        const errorMessage = errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`
        
        // Специальная обработка для ошибки "No item to return was found"
        if (errorMessage.includes('No item to return') || errorMessage.includes('No item to return was found')) {
          throw new Error('Ошибка n8n workflow: workflow не вернул данные. Проверьте конфигурацию workflow в n8n и убедитесь, что узел "Respond to Webhook" правильно настроен.')
        }
        
        throw new Error(errorMessage)
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
        
        // Проверяем, является ли ответ HTML страницей ошибки
        // Bug fix: Используем case-insensitive проверку для консистентности с regex
        const responseTextLower = responseText.toLowerCase()
        const isHtml = responseTextLower.includes('<!doctype') || responseTextLower.includes('<html')
        
        if (isHtml) {
          // Извлекаем сообщение об ошибке из HTML тегов
          // Bug fix: Используем [^>]* для пропуска атрибутов тегов
          let errorMessage = null
          
          // Пытаемся извлечь из <pre> тега
          const preMatch = responseText.match(/<pre[^>]*>(.*?)<\/pre>/is)
          if (preMatch && preMatch[1]) {
            errorMessage = preMatch[1].trim()
          }
          
          // Если не нашли в <pre>, пытаемся извлечь из <title>
          if (!errorMessage) {
            const titleMatch = responseText.match(/<title[^>]*>(.*?)<\/title>/is)
            if (titleMatch && titleMatch[1]) {
              errorMessage = titleMatch[1].trim()
            }
          }
          
          // Если нашли сообщение, используем его, иначе возвращаем общее сообщение
          if (errorMessage) {
            throw new Error(`Ошибка сервера: ${errorMessage}`)
          }
        }
        
        throw new Error('Некорректный формат ответа от сервера')
      }

      logger.info('Payment', 'Получен ответ от сервера (parsed)', {
        hasData: !!data,
        dataKeys: data ? (Array.isArray(data) ? ['[array]'] : Object.keys(data)) : [],
        hasPaymentUrl: !!data?.paymentUrl,
        hasOrderId: !!data?.orderId,
        success: data?.success,
        hasError: !!data?.error,
        dataType: Array.isArray(data) ? 'array' : typeof data,
        isArray: Array.isArray(data),
        arrayLength: Array.isArray(data) ? data.length : 0,
        dataPreview: JSON.stringify(data).substring(0, 1000),
        fullData: data
      })

      // Обрабатываем случай, когда ответ - массив (n8n может возвращать массив)
      let paymentData = null
      let rawData = data
      
      if (Array.isArray(data)) {
        if (data.length === 0) {
          logger.error('Payment', 'Ответ от сервера - пустой массив', { data })
          throw new Error('Неполный ответ от сервера: получен пустой массив')
        }
        paymentData = data[0]
        rawData = paymentData
        logger.info('Payment', 'Ответ от сервера - массив, извлечен первый элемент', {
          arrayLength: data.length,
          hasPaymentUrl: !!paymentData?.paymentUrl,
          hasOrderId: !!paymentData?.orderId,
          hasStatus: !!paymentData?.status,
          hasStatusPay: !!paymentData?.statusPay,
          keys: paymentData ? Object.keys(paymentData) : []
        })
      } else {
        paymentData = data
      }

      // Проверяем на ошибки в ответе (даже если HTTP статус 200)
      // Проверяем как в объекте, так и в извлеченных данных из массива
      const errorMessage = rawData?.error || paymentData?.error || rawData?.message || paymentData?.message
      const hasError = rawData?.error || paymentData?.error || rawData?.success === false || paymentData?.success === false
      
      if (hasError) {
        logger.error('Payment', 'Ошибка в ответе от сервера', { 
          error: errorMessage, 
          success: rawData?.success ?? paymentData?.success,
          rawData,
          paymentData,
          fullData: data 
        })
        
        // Специальная обработка для ошибки "No item to return was found"
        if (errorMessage && (errorMessage.includes('No item to return') || errorMessage.includes('No item to return was found'))) {
          throw new Error('Ошибка n8n workflow: workflow не вернул данные. Проверьте конфигурацию workflow в n8n.')
        }
        
        throw new Error(errorMessage || 'Неизвестная ошибка от сервера')
      }

      // Проверяем, что paymentData существует
      if (!paymentData || typeof paymentData !== 'object') {
        logger.error('Payment', 'Неполный ответ от сервера: paymentData отсутствует или не является объектом', {
          paymentData,
          originalData: data,
          dataType: typeof data,
          isArray: Array.isArray(data)
        })
        throw new Error('Неполный ответ от сервера: данные отсутствуют или имеют неверный формат')
      }

      // Детальная проверка обязательных полей с информативным сообщением
      const requiredFields = ['paymentUrl']
      const optionalFields = ['orderId', 'amount', 'status', 'statusPay']
      
      logger.info('Payment', 'Проверка обязательных полей в ответе', {
        paymentDataKeys: Object.keys(paymentData),
        hasPaymentUrl: !!paymentData.paymentUrl,
        hasOrderId: !!paymentData.orderId,
        hasAmount: !!paymentData.amount,
        hasStatus: !!paymentData.status,
        hasStatusPay: !!paymentData.statusPay,
        paymentUrlType: typeof paymentData.paymentUrl,
        paymentUrlValue: paymentData.paymentUrl ? String(paymentData.paymentUrl).substring(0, 100) : null,
        fullPaymentData: paymentData
      })

      // Проверяем наличие обязательных полей
      const missingFields = requiredFields.filter(field => {
        const value = paymentData[field]
        return !value || (typeof value === 'string' && value.trim() === '')
      })

      if (missingFields.length > 0) {
        logger.error('Payment', 'Неполный ответ от сервера: отсутствуют обязательные поля', {
          missingFields,
          receivedFields: Object.keys(paymentData),
          paymentData: paymentData,
          originalData: data,
          paymentUrlCheck: {
            exists: !!paymentData.paymentUrl,
            type: typeof paymentData.paymentUrl,
            value: paymentData.paymentUrl,
            isEmpty: paymentData.paymentUrl === '' || paymentData.paymentUrl === null || paymentData.paymentUrl === undefined
          }
        })
        throw new Error(`Неполный ответ от сервера. Отсутствуют обязательные поля: ${missingFields.join(', ')}. Полученные поля: ${Object.keys(paymentData).join(', ')}`)
      }

      // Извлекаем orderId из paymentUrl, если он не передан в ответе
      if (!paymentData.orderId && paymentData.paymentUrl) {
        try {
          const url = new URL(paymentData.paymentUrl)
          const label = url.searchParams.get('label')
          if (label && label.startsWith('order_')) {
            paymentData.orderId = label
            logger.info('Payment', 'orderId извлечен из paymentUrl', {
              orderId: paymentData.orderId,
              label
            })
          }
        } catch (urlError) {
          logger.warn('Payment', 'Не удалось извлечь orderId из paymentUrl', {
            paymentUrl: paymentData.paymentUrl,
            error: urlError.message
          })
        }
      }

      // Если orderId все еще отсутствует, генерируем его из timestamp
      if (!paymentData.orderId) {
        paymentData.orderId = `order_${Date.now()}`
        logger.warn('Payment', 'orderId сгенерирован из timestamp', {
          orderId: paymentData.orderId
        })
      }

      logger.info('Payment', 'Ссылка на оплату успешно сгенерирована', {
        userId,
        orderId: paymentData.orderId,
        hasPaymentUrl: !!paymentData.paymentUrl,
        amount: paymentData.amount
      })

      return {
        success: true,
        paymentUrl: paymentData.paymentUrl,
        orderId: paymentData.orderId,
        amount: paymentData.amount || amount,
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
