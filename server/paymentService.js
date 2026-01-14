/**
 * Модуль для работы с ЮMoney API
 * 
 * ВАЖНО: Этот модуль только создает платеж и сохраняет данные.
 * Проверка статуса оплаты будет выполняться в n8n через operation-history API.
 * 
 * Документация ЮMoney API:
 * https://yoomoney.ru/docs/wallet/using-api/request-payment
 */

import axios from 'axios'
import { savePayment } from './storage.js'

// Конфигурация из переменных окружения
const YOOMONEY_CLIENT_ID = process.env.YOOMONEY_CLIENT_ID || ''
const YOOMONEY_ACCESS_TOKEN = process.env.YOOMONEY_ACCESS_TOKEN || ''
const YOOMONEY_WALLET = process.env.YOOMONEY_WALLET || process.env.YOOMONEY_RECEIVER || ''

// Базовый URL API ЮMoney
const YOOMONEY_API_URL = 'https://yoomoney.ru/api'

/**
 * Создать платеж через ЮMoney API
 * 
 * @param {string} orderId - Уникальный идентификатор заказа
 * @param {number} amount - Сумма платежа в рублях
 * @param {Object} options - Дополнительные опции
 * @param {string} options.description - Описание платежа
 * @param {string} options.userId - ID пользователя (для сохранения в storage)
 * @param {string} options.tariffId - ID тарифа (для сохранения в storage)
 * @returns {Promise<Object>} Объект с paymentURL и данными платежа
 * 
 * @throws {Error} Если не удалось создать платеж
 */
export async function createPayment(orderId, amount, options = {}) {
  const { description = 'Оплата VPN подписки', userId, tariffId } = options

  // Валидация входных данных
  if (!orderId || !orderId.trim()) {
    throw new Error('orderId обязателен для создания платежа')
  }

  if (!amount || amount <= 0) {
    throw new Error('amount должен быть больше 0')
  }

  if (!YOOMONEY_ACCESS_TOKEN) {
    throw new Error('YOOMONEY_ACCESS_TOKEN не настроен в переменных окружения')
  }

  if (!YOOMONEY_WALLET) {
    throw new Error('YOOMONEY_WALLET не настроен в переменных окружения')
  }

  console.log(`💳 Creating payment: orderId=${orderId}, amount=${amount}`)

  try {
    // Формируем запрос к ЮMoney API
    // Используем request-payment для создания платежа
    const requestData = {
      pattern_id: 'p2p', // Шаблон для переводов между кошельками
      to: YOOMONEY_WALLET, // Номер кошелька получателя
      amount: amount.toString(), // Сумма (строка)
      label: orderId, // Метка платежа (используем orderId)
      message: description, // Сообщение для получателя
      // Дополнительные параметры для возврата пользователя после оплаты
      success_url: options.successUrl || undefined,
      fail_url: options.failUrl || undefined
    }

    // Убираем undefined значения
    Object.keys(requestData).forEach(key => {
      if (requestData[key] === undefined) {
        delete requestData[key]
      }
    })

    console.log('📤 Request to YooMoney API:', {
      url: `${YOOMONEY_API_URL}/request-payment`,
      pattern_id: requestData.pattern_id,
      to: requestData.to,
      amount: requestData.amount,
      label: requestData.label
    })

    // Выполняем запрос к ЮMoney API
    const response = await axios.post(
      `${YOOMONEY_API_URL}/request-payment`,
      requestData,
      {
        headers: {
          'Authorization': `Bearer ${YOOMONEY_ACCESS_TOKEN}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        // Преобразуем данные в form-urlencoded формат
        transformRequest: [(data) => {
          return Object.keys(data)
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
            .join('&')
        }]
      }
    )

    console.log('✅ YooMoney API response:', {
      status: response.status,
      hasRequestId: !!response.data?.request_id,
      hasPaymentUrl: !!response.data?.payment_url
    })

    // Проверяем ответ
    if (!response.data || !response.data.request_id) {
      throw new Error('Неверный ответ от ЮMoney API: отсутствует request_id')
    }

    const { request_id, payment_url } = response.data

    // Сохраняем платеж в storage со статусом 'pending'
    const payment = savePayment(
      orderId,
      orderId, // label = orderId (для поиска в operation-history)
      'pending',
      {
        requestId: request_id,
        amount,
        description,
        userId,
        tariffId,
        paymentUrl: payment_url
      }
    )

    console.log(`✅ Payment created successfully: ${orderId}`)
    console.log(`   Payment URL: ${payment_url}`)
    console.log(`   Request ID: ${request_id}`)
    console.log(`   Label: ${orderId} (для поиска в operation-history)`)

    return {
      success: true,
      orderId,
      label: orderId,
      requestId: request_id,
      paymentURL: payment_url,
      amount,
      status: 'pending',
      payment // Полные данные сохраненного платежа
    }
  } catch (error) {
    console.error('❌ Error creating payment:', {
      orderId,
      amount,
      errorMessage: error.message,
      errorResponse: error.response?.data,
      errorStatus: error.response?.status
    })

    // Обрабатываем различные типы ошибок
    if (error.response) {
      // Ошибка от API ЮMoney
      const errorData = error.response.data
      const errorMessage = errorData?.error_description || errorData?.error || error.message
      throw new Error(`Ошибка ЮMoney API: ${errorMessage}`)
    } else if (error.request) {
      // Запрос не дошел до сервера
      throw new Error('Не удалось подключиться к ЮMoney API')
    } else {
      // Другая ошибка
      throw error
    }
  }
}

/**
 * Получить информацию о платеже
 * @param {string} orderId - Уникальный идентификатор заказа
 * @returns {Object|null} Данные платежа
 */
export function getPaymentInfo(orderId) {
  // Используем динамический import для избежания circular dependency
  return import('./storage.js').then(({ getPayment }) => getPayment(orderId))
}
