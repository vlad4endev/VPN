/**
 * Генерация уникального orderId для платежей.
 * Избегаем коллизий при одновременных запросах.
 */

import crypto from 'crypto'

const PREFIX = 'vpn_'

/**
 * Генерирует уникальный orderId.
 * Формат: vpn_{timestamp}_{randomHex} для минимизации коллизий.
 * @returns {string}
 */
export function generateOrderId() {
  const ts = Date.now()
  const rnd = crypto.randomBytes(4).toString('hex')
  return `${PREFIX}${ts}_${rnd}`
}
