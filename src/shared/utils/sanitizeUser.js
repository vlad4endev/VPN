import logger from './logger.js'

/**
 * Санитизация данных пользователя из localStorage
 * Защита от XSS и валидация структуры данных
 * 
 * @param {any} userData - Данные пользователя для санитизации
 * @returns {Object|null} Санитизированные данные пользователя или null если невалидны
 */
export const sanitizeUser = (userData) => {
  if (!userData || typeof userData !== 'object') {
    logger.warn('sanitizeUser', 'Данные пользователя не являются объектом', { type: typeof userData })
    return null
  }

  try {
    // Валидация обязательных полей
    if (!userData.id || typeof userData.id !== 'string') {
      logger.warn('sanitizeUser', 'Отсутствует или невалидный id пользователя')
      return null
    }

    if (!userData.email || typeof userData.email !== 'string') {
      logger.warn('sanitizeUser', 'Отсутствует или невалидный email пользователя')
      return null
    }

    // Санитизация строковых полей
    const sanitized = {
      id: String(userData.id).trim().substring(0, 128),
      email: String(userData.email).trim().toLowerCase().substring(0, 255),
      name: String(userData.name || '').trim().substring(0, 100),
      phone: String(userData.phone || '').trim().substring(0, 20),
      role: ['user', 'admin'].includes(userData.role) ? userData.role : 'user',
      plan: ['free', 'premium', 'super', 'multi'].includes(userData.plan) ? userData.plan : 'free',
      uuid: userData.uuid ? String(userData.uuid).trim().substring(0, 128) : '',
      tariffName: String(userData.tariffName || '').trim().substring(0, 100),
      tariffId: String(userData.tariffId || '').trim().substring(0, 128),
      photoURL: userData.photoURL ? String(userData.photoURL).trim().substring(0, 500) : null,
    }

    // Валидация дат
    if (userData.expiresAt) {
      const expiresAt = typeof userData.expiresAt === 'number' 
        ? userData.expiresAt 
        : new Date(userData.expiresAt).getTime()
      
      if (!isNaN(expiresAt) && expiresAt > 0) {
        sanitized.expiresAt = expiresAt
      } else {
        sanitized.expiresAt = null
      }
    } else {
      sanitized.expiresAt = null
    }

    if (userData.createdAt) {
      sanitized.createdAt = String(userData.createdAt).substring(0, 50)
    }

    if (userData.updatedAt) {
      sanitized.updatedAt = String(userData.updatedAt).substring(0, 50)
    }

    // Валидация email формата
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(sanitized.email)) {
      logger.warn('sanitizeUser', 'Email не соответствует формату', { email: sanitized.email })
      return null
    }

    logger.debug('sanitizeUser', 'Данные пользователя успешно санитизированы', { 
      id: sanitized.id, 
      email: sanitized.email 
    })

    return sanitized
  } catch (err) {
    logger.error('sanitizeUser', 'Ошибка при санитизации данных пользователя', null, err)
    return null
  }
}

/**
 * Безопасный парсинг пользователя из localStorage
 * @param {string} userStr - JSON строка из localStorage
 * @returns {Object|null} Санитизированные данные пользователя или null
 */
export const parseUserSafely = (userStr) => {
  if (!userStr || typeof userStr !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(userStr)
    return sanitizeUser(parsed)
  } catch (err) {
    logger.error('parseUserSafely', 'Ошибка парсинга JSON из localStorage', null, err)
    return null
  }
}

