/**
 * Проверка подписи webhook YooMoney (SHA1).
 * Документация: https://yoomoney.ru/docs/wallet/using-api/notification-p2p-incoming
 *
 * Формула: sha1(
 *   notification_type + '&' +
 *   operation_id + '&' +
 *   amount + '&' +
 *   currency + '&' +
 *   datetime + '&' +
 *   sender + '&' +
 *   codepro + '&' +
 *   notification_secret + '&' +
 *   label
 * )
 */

import crypto from 'crypto'

const DEBUG = process.env.PAYMENT_DEBUG === 'true' || process.env.PAYMENT_DEBUG === '1'

/**
 * @param {Object} body - Тело webhook от YooMoney
 * @param {string} secretKey - notification_secret (yoomoneySecretKey)
 * @returns {{ valid: boolean, dataCheckString?: string, computedHash?: string }}
 */
export function verifyYooMoneyWebhookSignature(body, secretKey) {
  if (!body || !secretKey) {
    return { valid: false }
  }

  const notification_type = String(body.notification_type ?? '')
  const operation_id = String(body.operation_id ?? '')
  const amount = String(body.amount ?? '')
  const currency = String(body.currency ?? '')
  const datetime = String(body.datetime ?? '')
  const sender = String(body.sender ?? '')
  const codepro = String(body.codepro ?? '')
  const label = String(body.label ?? '')

  // Порядок полей строго по документации YooMoney
  const dataCheckString = [
    notification_type,
    operation_id,
    amount,
    currency,
    datetime,
    sender,
    codepro,
    secretKey,
    label,
  ].join('&')

  const stringToHash = [
    notification_type,
    operation_id,
    amount,
    currency,
    datetime,
    sender,
    codepro,
    '<secret>',
    label,
  ].join('&')

  const computedHash = crypto.createHash('sha1').update(dataCheckString).digest('hex')
  const receivedHash = String(body.sha1_hash ?? '').toLowerCase()

  const valid = computedHash === receivedHash

  if (DEBUG) {
    console.log('[YooMoney Webhook DEBUG] Строка для хеширования (secret заменён на <secret>):', stringToHash)
    console.log('[YooMoney Webhook DEBUG] computedHash:', computedHash, 'receivedHash:', receivedHash, 'valid:', valid)
  }

  return {
    valid,
    dataCheckString: DEBUG ? stringToHash : undefined,
    computedHash: DEBUG ? computedHash : undefined,
  }
}
