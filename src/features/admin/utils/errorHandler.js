/**
 * Централизованная обработка ошибок для Admin панели
 */

/**
 * Обрабатывает ошибки Firestore и возвращает понятное сообщение
 * @param {Error} error - Ошибка
 * @returns {string} Понятное сообщение об ошибке
 */
export function handleFirestoreError(error) {
  if (!error) {
    return 'Произошла неизвестная ошибка'
  }

  // Обработка специфичных ошибок Firestore
  if (error.code === 'permission-denied') {
    return 'Нет доступа к базе данных. Проверьте правила безопасности Firestore.'
  }

  if (error.code === 'unavailable') {
    return 'Сервис временно недоступен. Попробуйте позже.'
  }

  if (error.code === 'not-found') {
    return 'Запрашиваемые данные не найдены.'
  }

  if (error.code === 'already-exists') {
    return 'Данные уже существуют.'
  }

  if (error.code === 'failed-precondition') {
    return 'Операция не может быть выполнена в текущем состоянии.'
  }

  if (error.code === 'aborted') {
    return 'Операция была прервана. Попробуйте еще раз.'
  }

  if (error.code === 'deadline-exceeded') {
    return 'Операция заняла слишком много времени. Попробуйте еще раз.'
  }

  if (error.code === 'resource-exhausted') {
    return 'Превышен лимит ресурсов. Попробуйте позже.'
  }

  if (error.code === 'cancelled') {
    return 'Операция была отменена.'
  }

  // Обработка сетевых ошибок
  if (error.message && error.message.includes('network')) {
    return 'Проблема с сетью. Проверьте подключение к интернету.'
  }

  // Обработка ошибок валидации
  if (error.name === 'ValidationError') {
    return error.message || 'Ошибка валидации данных.'
  }

  // Общая обработка
  return error.message || 'Произошла ошибка при выполнении операции.'
}

/**
 * Логирует ошибку для отладки
 * @param {string} context - Контекст ошибки (например, 'Admin', 'UserCard')
 * @param {string} operation - Операция, при которой произошла ошибка
 * @param {Error} error - Ошибка
 * @param {Object} metadata - Дополнительные данные для логирования
 */
export function logError(context, operation, error, metadata = {}) {
  const errorInfo = {
    context,
    operation,
    error: {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    },
    metadata,
    timestamp: new Date().toISOString(),
  }

  console.error(`[${context}] Ошибка в ${operation}:`, errorInfo)

  // В продакшене можно отправлять ошибки в систему мониторинга
  // Например, Sentry, LogRocket и т.д.
  if (import.meta.env.PROD) {
    // TODO: Отправка в систему мониторинга
  }
}

/**
 * Создает обработчик ошибок для async функций
 * @param {Function} setError - Функция для установки ошибки
 * @param {string} context - Контекст ошибки
 * @param {string} operation - Операция
 * @returns {Function} Обработчик ошибок
 */
export function createErrorHandler(setError, context, operation) {
  return (error, metadata = {}) => {
    const userMessage = handleFirestoreError(error)
    logError(context, operation, error, metadata)
    setError(userMessage)
    return userMessage
  }
}

/**
 * Оборачивает async функцию с обработкой ошибок
 * @param {Function} asyncFn - Async функция
 * @param {Function} setError - Функция для установки ошибки
 * @param {string} context - Контекст ошибки
 * @param {string} operation - Операция
 * @returns {Function} Обернутая функция
 */
export function withErrorHandling(asyncFn, setError, context, operation) {
  return async (...args) => {
    try {
      return await asyncFn(...args)
    } catch (error) {
      const userMessage = handleFirestoreError(error)
      logError(context, operation, error, { args })
      setError(userMessage)
      throw error // Пробрасываем для дальнейшей обработки
    }
  }
}

