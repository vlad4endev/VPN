/**
 * Утилита для гарантированной функции
 * Используется для обеспечения, что функция всегда доступна, даже если она не передана
 * 
 * @param {Function|null|undefined} fn - Функция для проверки
 * @param {string} name - Имя функции для логирования
 * @param {Function|null} fallback - Кастомная fallback функция (опционально)
 * @returns {Function} Гарантированная функция
 * 
 * @example
 * const saveUser = ensureFunction(props.onSave, 'onSave');
 * await saveUser(userData); // Всегда вызовет функцию или fallback
 */
export const ensureFunction = (fn, name = 'unknown', fallback = null) => {
  if (typeof fn === 'function') {
    return fn
  }
  
  console.warn(`[Admin Warning]: Function ${name} is missing, using fallback.`, {
    functionName: name,
    receivedType: typeof fn,
    receivedValue: fn,
  })
  
  // Если передан кастомный fallback, используем его
  if (fallback && typeof fallback === 'function') {
    return fallback
  }
  
  // Дефолтный fallback - выбрасывает ошибку
  return async (...args) => {
    console.error(`Action ${name} failed: function not implemented`, {
      functionName: name,
      args,
    })
    throw new Error(`Function ${name} is not available`)
  }
}
