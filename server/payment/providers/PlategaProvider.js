/**
 * Провайдер Platega.io — создание платежей через REST API.
 * Platega не требует подписи в URL (авторизация через X-MerchantId, X-Secret).
 */

import axios from 'axios'
import { normalizeAmount, formatAmountForApi } from '../utils/amount.js'
import { buildRedirectUrl } from '../utils/url.js'

const PLATEGA_API_BASE = 'https://app.platega.io'
const PLATEGA_API_URL = `${PLATEGA_API_BASE}/transaction/process`

/** Коды методов: 2 = СБП QR, 10 = карты RUB, 13 = криптовалюта */
const DEFAULT_PAYMENT_METHOD = 2

const DEBUG = process.env.PAYMENT_DEBUG === 'true' || process.env.PAYMENT_DEBUG === '1'

function debugLog(msg, data = {}) {
  if (DEBUG) {
    const safe = { ...data }
    if (safe.secretKey !== undefined) safe.secretKey = '***'
    if (safe.merchantId !== undefined) safe.merchantId = safe.merchantId ? `${String(safe.merchantId).slice(0, 8)}...` : ''
    console.log(`[Platega DEBUG] ${msg}`, JSON.stringify(safe, null, 2))
  }
}

/**
 * @typedef {Object} PlategaPaymentParams
 * @property {string} merchantId
 * @property {string} secretKey
 * @property {number} amount - Сумма в рублях
 * @property {string} orderId
 * @property {string} userId
 * @property {string|null} tariffId
 * @property {Object|null} userData - { uuid, email, inboundId }
 * @property {string|null} baseUrl - URL приложения для return/failed
 */

/**
 * Создаёт платёж в Platega и возвращает ссылку на оплату.
 * @param {PlategaPaymentParams} params
 * @param {number} [paymentMethodOverride] - 2=СБП, 13=крипто
 * @returns {Promise<{ paymentUrl: string, transactionId?: string }>}
 */
export async function createPlategaPayment(params, paymentMethodOverride) {
  const {
    merchantId,
    secretKey,
    amount,
    orderId,
    userId,
    tariffId,
    userData,
    baseUrl,
  } = params

  const amountNormalized = normalizeAmount(amount)
  const amountForApi = formatAmountForApi(amount)

  const returnUrl = buildRedirectUrl(baseUrl, '/payment/success', orderId)
  const failedUrl = buildRedirectUrl(baseUrl, '/payment/fail', orderId)

  const paymentMethod = paymentMethodOverride != null
    ? Number(paymentMethodOverride)
    : (Number(process.env.PLATEGA_PAYMENT_METHOD) || DEFAULT_PAYMENT_METHOD)

  const payload = {
    paymentMethod,
    paymentDetails: {
      amount: amountForApi, // Строка "100.00" — критично для Platega (хеш/валидация на их стороне)
      currency: 'RUB',
    },
    description: `VPN тариф ${tariffId || 'подписка'}`,
    ...(returnUrl && { return: returnUrl }),
    ...(failedUrl && { failedUrl }),
    payload: JSON.stringify({
      userId,
      tariffId: tariffId || null,
      uuid: userData?.uuid || null,
      orderId,
    }),
  }

  debugLog('Payload перед отправкой (без секретов)', {
    paymentMethod: payload.paymentMethod,
    amount: payload.paymentDetails.amount,
    currency: payload.paymentDetails.currency,
    returnUrl,
    failedUrl,
    orderId,
    userId,
  })

  const plategaTimeoutMs = Number(process.env.PLATEGA_REQUEST_TIMEOUT_MS) || 30000

  let response
  try {
    response = await axios.post(PLATEGA_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-MerchantId': merchantId,
        'X-Secret': secretKey,
      },
      timeout: plategaTimeoutMs,
      validateStatus: () => true,
    })
  } catch (reqErr) {
    const code = reqErr.code || ''
    const msg = (reqErr.message || '').toLowerCase()
    const isTimeout = code === 'ECONNABORTED' || msg.includes('timeout')
    const isNetwork = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'ENETUNREACH'].includes(code)
    if (isTimeout || isNetwork) {
      console.warn('⚠️ Platega не отвечает:', { code, message: reqErr.message, orderId })
      throw new Error('Платёжная система временно не отвечает. Проверьте подключение к интернету и попробуйте позже.')
    }
    throw reqErr
  }

  function toUserMessage(raw) {
    const s = (raw && String(raw).trim()) || ''
    if (/providers are disabled|unhealthy/i.test(s)) {
      return 'Платёжный провайдер Platega временно недоступен или в кабинете app.platega.io отключены/недоступны способы оплаты.'
    }
    return s || `HTTP ${response.status}`
  }

  if (response.status !== 200 || !response.data) {
    console.warn('⚠️ Platega API ответ (ошибка):', { status: response.status, data: response.data, paymentMethod })
    throw new Error(toUserMessage(response.data?.message || response.data?.error))
  }

  const data = response.data
  if (data.redirect) {
    debugLog('Platega возвратил redirect', { hasRedirect: true, transactionId: data.transactionId })
    return { paymentUrl: data.redirect, transactionId: data.transactionId }
  }

  console.warn('⚠️ Platega API ответ (нет redirect):', { data, paymentMethod })
  throw new Error(toUserMessage(data.message || data.error || 'Нет ссылки на оплату в ответе Platega'))
}
