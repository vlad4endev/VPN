/**
 * Утилиты нормализации денежных сумм.
 * Избегаем float-ошибок (0.1 + 0.2 !== 0.3) — работаем в рублях с фиксированной точностью.
 */

/**
 * Нормализует сумму до 2 знаков после запятой (рубли).
 * @param {number|string} amount - Сумма в рублях
 * @returns {number} Число с 2 знаками (для передачи в API)
 */
export function normalizeAmount(amount) {
  const num = Number(amount)
  if (Number.isNaN(num) || num < 0) return 0
  return Math.round(num * 100) / 100
}

/**
 * Форматирует сумму как строку для платёжных API (рубли, "X.XX").
 * @param {number|string} amount
 * @returns {string}
 */
export function formatAmountForApi(amount) {
  const n = normalizeAmount(amount)
  return n.toFixed(2)
}
