/**
 * Unit-тесты для модуля server/payment/
 * Запуск: npm test (из корня проекта)
 */

import { jest } from '@jest/globals'
import crypto from 'crypto'
import { normalizeAmount, formatAmountForApi } from '../utils/amount.js'
import { buildRedirectUrl, appendQueryParam } from '../utils/url.js'
import { verifyYooMoneyWebhookSignature } from '../webhook/verifyYooMoney.js'
import { generateOrderId } from '../utils/orderId.js'

// =============================================================================
// 1. UTILS — amount.js
// =============================================================================

describe('utils/amount', () => {

  describe('normalizeAmount', () => {
    it('возвращает 0 для 0', () => {
      expect(normalizeAmount(0)).toBe(0)
    })

    it('сохраняет 0.01 без изменений', () => {
      expect(normalizeAmount(0.01)).toBe(0.01)
    })

    it('округляет 0.999 до 1', () => {
      const result = normalizeAmount(0.999)
      expect(result).toBe(1)
      expect(Number(result.toFixed(2))).toBe(1)
    })

    it('нормализует 100.5', () => {
      expect(normalizeAmount(100.5)).toBe(100.5)
    })

    it('избегает ошибок плавающей запятой — результат всегда до 2 знаков', () => {
      // 0.1 + 0.2 в IEEE754 = 0.30000000000000004
      const problematic = 0.1 + 0.2
      expect(normalizeAmount(problematic)).toBe(0.3)
    })

    it('принимает строки и конвертирует в число', () => {
      expect(normalizeAmount('19.99')).toBe(19.99)
    })

    it('возвращает 0 для NaN и отрицательных', () => {
      expect(normalizeAmount(NaN)).toBe(0)
      expect(normalizeAmount(-5)).toBe(0)
    })
  })

  describe('formatAmountForApi', () => {
    it('возвращает строку с 2 знаками после запятой', () => {
      expect(formatAmountForApi(100)).toBe('100.00')
      expect(formatAmountForApi(0.01)).toBe('0.01')
      expect(formatAmountForApi(0.999)).toBe('1.00')
    })
  })
})

// =============================================================================
// 2. UTILS — url.js (формирование returnUrl/failedUrl)
// =============================================================================

describe('utils/url', () => {
  describe('buildRedirectUrl', () => {
    it('кодирует orderId через encodeURIComponent', () => {
      const orderId = 'vpn_123_order?id=1&x=2'
      const url = buildRedirectUrl('https://app.example.com', '/payment/success', orderId)
      expect(url).toContain('orderId=')
      expect(url).toContain(encodeURIComponent(orderId))
      expect(decodeURIComponent(new URL(url).searchParams.get('orderId'))).toBe(orderId)
    })

    it('корректно формирует URL без лишних слешей', () => {
      const url = buildRedirectUrl('https://app.example.com/', '/payment/success', 'order_1')
      expect(url).toBe('https://app.example.com/payment/success?orderId=order_1')
    })

    it('возвращает null при пустом baseUrl', () => {
      expect(buildRedirectUrl('', '/payment/success', 'order_1')).toBeNull()
      expect(buildRedirectUrl(null, '/payment/success', 'order_1')).toBeNull()
    })
  })

  describe('appendQueryParam', () => {
    it('кодирует параметры через encodeURIComponent', () => {
      const base = 'https://example.com/path'
      const result = appendQueryParam(base, 'orderId', 'vpn_1&x=2')
      expect(result).toContain(encodeURIComponent('vpn_1&x=2'))
    })
  })
})

// =============================================================================
// 3. PROVIDERS — PlategaProvider.js (с мокированием axios)
// =============================================================================

const mockAxiosPost = jest.fn()

jest.unstable_mockModule('axios', () => ({
  default: {
    post: (...args) => mockAxiosPost(...args),
  },
}))

describe('providers/PlategaProvider', () => {
  beforeEach(() => {
    mockAxiosPost.mockReset()
  })

  it('формирует returnUrl и failedUrl с encodeURIComponent orderId', async () => {
    mockAxiosPost.mockResolvedValue({
      status: 200,
      data: { redirect: 'https://platega.io/pay/xxx', transactionId: 'tx-123' },
    })

    const { createPlategaPayment } = await import('../providers/PlategaProvider.js')

    const orderId = 'vpn_123_test&special=chars'
    await createPlategaPayment(
      {
        merchantId: 'merchant-1',
        secretKey: 'secret-1',
        amount: 100,
        orderId,
        userId: 'user-1',
        tariffId: 'tariff-1',
        userData: null,
        baseUrl: 'https://app.test.com',
      },
      2
    )

    expect(mockAxiosPost).toHaveBeenCalledTimes(1)
    const [url, payload, config] = mockAxiosPost.mock.calls[0]

    expect(payload.return).toContain('orderId=')
    expect(payload.return).toContain(encodeURIComponent(orderId))
    expect(payload.failedUrl).toContain(encodeURIComponent(orderId))
  })

  it('передаёт amount как строку "100.00" (критично для Platega)', async () => {
    mockAxiosPost.mockResolvedValue({
      status: 200,
      data: { redirect: 'https://platega.io/pay/yyy', transactionId: 'tx-456' },
    })

    const { createPlategaPayment } = await import('../providers/PlategaProvider.js')

    await createPlategaPayment(
      {
        merchantId: 'm',
        secretKey: 's',
        amount: 99.999,
        orderId: 'order_1',
        userId: 'u',
        tariffId: null,
        userData: null,
        baseUrl: 'https://x.com',
      },
      2
    )

    const payload = mockAxiosPost.mock.calls[0][1]
    expect(payload.paymentDetails.amount).toBe('100.00')
  })

  it('изменение amount приводит к другому payload', async () => {
    mockAxiosPost.mockResolvedValue({
      status: 200,
      data: { redirect: 'https://platega.io/pay/1', transactionId: 't1' },
    })

    const { createPlategaPayment } = await import('../providers/PlategaProvider.js')
    const baseParams = {
      merchantId: 'm',
      secretKey: 's',
      orderId: 'order_1',
      userId: 'u',
      tariffId: null,
      userData: null,
      baseUrl: 'https://x.com',
    }

    await createPlategaPayment({ ...baseParams, amount: 100 }, 2)
    const payload1 = mockAxiosPost.mock.calls[0][1]

    mockAxiosPost.mockClear()
    mockAxiosPost.mockResolvedValue({
      status: 200,
      data: { redirect: 'https://platega.io/pay/2', transactionId: 't2' },
    })
    await createPlategaPayment({ ...baseParams, amount: 200 }, 2)
    const payload2 = mockAxiosPost.mock.calls[0][1]

    expect(payload1.paymentDetails.amount).toBe('100.00')
    expect(payload2.paymentDetails.amount).toBe('200.00')
  })

  it('изменение orderId меняет returnUrl и payload', async () => {
    mockAxiosPost.mockResolvedValue({
      status: 200,
      data: { redirect: 'https://platega.io/pay/1', transactionId: 't1' },
    })

    const { createPlategaPayment } = await import('../providers/PlategaProvider.js')
    const baseParams = {
      merchantId: 'm',
      secretKey: 's',
      amount: 100,
      userId: 'u',
      tariffId: null,
      userData: null,
      baseUrl: 'https://x.com',
    }

    await createPlategaPayment({ ...baseParams, orderId: 'order_A' }, 2)
    const returnA = mockAxiosPost.mock.calls[0][1].return

    mockAxiosPost.mockClear()
    mockAxiosPost.mockResolvedValue({
      status: 200,
      data: { redirect: 'https://platega.io/pay/2', transactionId: 't2' },
    })
    await createPlategaPayment({ ...baseParams, orderId: 'order_B' }, 2)
    const returnB = mockAxiosPost.mock.calls[0][1].return

    expect(returnA).not.toBe(returnB)
    expect(returnA).toContain('order_A')
    expect(returnB).toContain('order_B')
  })

  // --- Требования пользователя: подпись, сумма, URL, security ---

  it('КОРРЕКТНОСТЬ PAYLOAD: amount "100.00", order_id "test_1" — предсказуемая структура (Platega использует X-MerchantId/X-Secret, не подпись)', async () => {
    mockAxiosPost.mockResolvedValue({
      status: 200,
      data: { redirect: 'https://platega.io/pay/ok', transactionId: 'tx' },
    })

    const { createPlategaPayment } = await import('../providers/PlategaProvider.js')
    await createPlategaPayment(
      {
        merchantId: 'merchant-1',
        secretKey: 'secret-key',
        amount: 100,
        orderId: 'test_1',
        userId: 'user-1',
        tariffId: 'tariff-1',
        userData: null,
        baseUrl: 'https://app.example.com',
      },
      2
    )

    const [, payload] = mockAxiosPost.mock.calls[0]
    expect(payload.paymentDetails.amount).toBe('100.00')
    expect(payload.paymentDetails.currency).toBe('RUB')
    expect(JSON.parse(payload.payload).orderId).toBe('test_1')

    // Детерминированность: SHA256 от канонического представления payload (для регрессии)
    const canonical = JSON.stringify({
      amount: payload.paymentDetails.amount,
      orderId: 'test_1',
    })
    const expectedHash = crypto.createHash('sha256').update(canonical).digest('hex')
    expect(expectedHash).toBe(
      crypto.createHash('sha256').update(JSON.stringify({ amount: '100.00', orderId: 'test_1' })).digest('hex')
    )
  })

  it('ОБРАБОТКА СУММЫ: число 100 превращается в строку "100.00" перед отправкой', async () => {
    mockAxiosPost.mockResolvedValue({
      status: 200,
      data: { redirect: 'https://platega.io/pay/x', transactionId: 't' },
    })

    const { createPlategaPayment } = await import('../providers/PlategaProvider.js')
    await createPlategaPayment(
      {
        merchantId: 'm',
        secretKey: 's',
        amount: 100,
        orderId: 'order_1',
        userId: 'u',
        tariffId: null,
        userData: null,
        baseUrl: 'https://x.com',
      },
      2
    )

    const payload = mockAxiosPost.mock.calls[0][1]
    expect(typeof payload.paymentDetails.amount).toBe('string')
    expect(payload.paymentDetails.amount).toBe('100.00')
  })

  it('URL ENCODING: description с кириллицей и пробелами — payload валиден, returnUrl не "разваливается"', async () => {
    mockAxiosPost.mockResolvedValue({
      status: 200,
      data: { redirect: 'https://platega.io/pay/ok', transactionId: 'tx' },
    })

    const { createPlategaPayment } = await import('../providers/PlategaProvider.js')
    const orderIdWithSpecial = 'vpn_123_заказ с пробелами'

    await createPlategaPayment(
      {
        merchantId: 'm',
        secretKey: 's',
        amount: 50,
        orderId: orderIdWithSpecial,
        userId: 'u',
        tariffId: 'тариф-супер',
        userData: null,
        baseUrl: 'https://app.example.com',
      },
      2
    )

    const [, payload] = mockAxiosPost.mock.calls[0]

    expect(payload.description).toContain('тариф')
    expect(() => JSON.stringify(payload)).not.toThrow()

    expect(payload.return).toBeTruthy()
    expect(() => new URL(payload.return)).not.toThrow()
    expect(decodeURIComponent(new URL(payload.return).searchParams.get('orderId'))).toBe(orderIdWithSpecial)
  })

  it('SECURITY: secretKey НЕ попадает в console.log при PAYMENT_DEBUG=true', async () => {
    const secretKey = 'my-super-secret-key-xyz-12345'
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

    const originalDebug = process.env.PAYMENT_DEBUG
    process.env.PAYMENT_DEBUG = 'true'

    jest.resetModules()
    mockAxiosPost.mockResolvedValue({
      status: 200,
      data: { redirect: 'https://platega.io/pay/ok', transactionId: 'tx' },
    })

    jest.unstable_mockModule('axios', () => ({
      default: { post: (...args) => mockAxiosPost(...args) },
    }))
    const { createPlategaPayment } = await import('../providers/PlategaProvider.js')
    await createPlategaPayment(
      {
        merchantId: 'merchant-1',
        secretKey,
        amount: 100,
        orderId: 'order_1',
        userId: 'u',
        tariffId: null,
        userData: null,
        baseUrl: 'https://x.com',
      },
      2
    )

    const allLogArgs = consoleSpy.mock.calls.flatMap((c) => c.map((a) => String(a)))
    const hasSecret = allLogArgs.some((s) => s.includes(secretKey))

    expect(hasSecret).toBe(false)

    consoleSpy.mockRestore()
    process.env.PAYMENT_DEBUG = originalDebug
  })
})

// =============================================================================
// 4. WEBHOOK — verifyYooMoney.js
// =============================================================================

describe('webhook/verifyYooMoney', () => {
  function buildValidBody(secret) {
    const notification_type = 'p2p-incoming'
    const operation_id = '12345678'
    const amount = '150.00'
    const currency = '643'
    const datetime = '2024-01-15T12:00:00.000Z'
    const sender = '410017383938322'
    const codepro = 'false'
    const label = 'order_1705320000000'

    const dataCheckString = [
      notification_type,
      operation_id,
      amount,
      currency,
      datetime,
      sender,
      codepro,
      secret,
      label,
    ].join('&')
    const sha1_hash = crypto.createHash('sha1').update(dataCheckString).digest('hex')

    return {
      notification_type,
      operation_id,
      amount,
      currency,
      datetime,
      sender,
      codepro,
      label,
      sha1_hash,
    }
  }

  it('возвращает valid: true при валидном секрете и корректном body', () => {
    const secret = 'my-secret-key'
    const body = buildValidBody(secret)
    const { valid } = verifyYooMoneyWebhookSignature(body, secret)
    expect(valid).toBe(true)
  })

  it('возвращает valid: false при неверном секрете', () => {
    const secret = 'correct-secret'
    const body = buildValidBody(secret)
    const { valid } = verifyYooMoneyWebhookSignature(body, 'wrong-secret')
    expect(valid).toBe(false)
  })

  it('изменение одного символа в секрете кардинально меняет результат', () => {
    const secret = 'abc123'
    const body = buildValidBody(secret)
    const { valid: validOriginal } = verifyYooMoneyWebhookSignature(body, secret)
    const { valid: validTampered } = verifyYooMoneyWebhookSignature(body, 'abc124')
    expect(validOriginal).toBe(true)
    expect(validTampered).toBe(false)
  })

  it('изменение любого поля в body делает подпись невалидной', () => {
    const secret = 'my-secret'
    const body = buildValidBody(secret)

    const { valid: validAmount } = verifyYooMoneyWebhookSignature(
      { ...body, amount: '150.01' },
      secret
    )
    expect(validAmount).toBe(false)

    const { valid: validLabel } = verifyYooMoneyWebhookSignature(
      { ...body, label: 'order_other' },
      secret
    )
    expect(validLabel).toBe(false)
  })

  it('не падает с ошибкой при отсутствующих полях в body', () => {
    expect(() => verifyYooMoneyWebhookSignature({}, 'secret')).not.toThrow()
    const { valid } = verifyYooMoneyWebhookSignature({}, 'secret')
    expect(valid).toBe(false)

    expect(() => verifyYooMoneyWebhookSignature({ notification_type: 'p2p-incoming' }, 'secret')).not.toThrow()
    const { valid: validPartial } = verifyYooMoneyWebhookSignature(
      { notification_type: 'p2p-incoming' },
      'secret'
    )
    expect(validPartial).toBe(false)
  })

  it('возвращает valid: false при null/undefined body или secret', () => {
    expect(verifyYooMoneyWebhookSignature(null, 'secret').valid).toBe(false)
    expect(verifyYooMoneyWebhookSignature({}, null).valid).toBe(false)
    expect(verifyYooMoneyWebhookSignature({}, '').valid).toBe(false)
  })
})

// =============================================================================
// 5. UTILS — orderId.js
// =============================================================================

describe('utils/orderId', () => {
  it('генерирует уникальные orderId', () => {
    const ids = new Set()
    for (let i = 0; i < 100; i++) {
      ids.add(generateOrderId())
    }
    expect(ids.size).toBe(100)
  })

  it('начинается с префикса vpn_', () => {
    expect(generateOrderId()).toMatch(/^vpn_/)
  })
})
