/**
 * PaymentService — фасад для генерации платёжных ссылок.
 * Clean Architecture: инкапсулирует логику провайдера (Platega).
 */

import { generateOrderId } from './utils/orderId.js'
import { createPlategaPayment } from './providers/PlategaProvider.js'

const PLATEGA_PAYMENT_METHOD_DEFAULT = 2

/**
 * @typedef {Object} OrderData
 * @property {string} userId
 * @property {number} amount - Сумма в рублях
 * @property {string|null} tariffId
 * @property {Object|null} userData - { uuid, email, inboundId }
 * @property {string|null} baseUrl
 * @property {string} [orderId] - Если не передан — генерируется
 */

/**
 * @typedef {Object} GenerateLinkResult
 * @property {string} paymentUrl
 * @property {string} orderId
 * @property {string|null} [transactionId]
 */

/**
 * Генерирует ссылку на оплату.
 * @param {OrderData} orderData
 * @param {Object} credentials - { merchantId, secretKey }
 * @returns {Promise<GenerateLinkResult>}
 */
export async function generatePaymentLink(orderData, credentials) {
  const { merchantId, secretKey } = credentials || {}
  if (!merchantId || !secretKey) {
    return { paymentUrl: '', orderId: orderData.orderId || generateOrderId() }
  }

  const orderId = orderData.orderId || generateOrderId()
  const baseUrl = (orderData.baseUrl || process.env.PUBLIC_URL || process.env.FRONTEND_URL || '')
    .toString()
    .trim()
    .replace(/\/+$/, '') || null

  const params = {
    merchantId,
    secretKey,
    amount: orderData.amount,
    orderId,
    userId: orderData.userId,
    tariffId: orderData.tariffId || null,
    userData: orderData.userData || null,
    baseUrl,
  }

  const primaryMethod = Number(process.env.PLATEGA_PAYMENT_METHOD) || PLATEGA_PAYMENT_METHOD_DEFAULT
  const fallbackMethod = primaryMethod === 2 ? 13 : 2

  let lastError = null
  for (const method of [primaryMethod, fallbackMethod]) {
    if (method === fallbackMethod && primaryMethod === fallbackMethod) continue
    try {
      const result = await createPlategaPayment(params, method)
      return {
        paymentUrl: result.paymentUrl || '',
        orderId,
        transactionId: result.transactionId || null,
      }
    } catch (err) {
      lastError = err
      const msg = (err.message || '').toLowerCase()
      const isProvidersDisabled = msg.includes('providers are disabled') || msg.includes('отключены')
      if (isProvidersDisabled && method === primaryMethod) {
        console.warn(`⚠️ Platega: метод ${primaryMethod} недоступен, пробуем ${fallbackMethod}`)
        continue
      }
      throw err
    }
  }

  if (lastError) throw lastError
  return { paymentUrl: '', orderId }
}
