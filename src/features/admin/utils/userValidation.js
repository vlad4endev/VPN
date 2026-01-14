/**
 * Утилиты для валидации данных пользователя
 */

/**
 * Валидирует UUID формат
 * @param {string} uuid - UUID для валидации
 * @returns {boolean} true если UUID валиден
 */
export function isValidUUID(uuid) {
  if (!uuid || typeof uuid !== 'string') return false
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid.trim())
}

/**
 * Валидирует email формат
 * @param {string} email - Email для валидации
 * @returns {boolean} true если email валиден
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email.trim())
}

/**
 * Валидирует номер телефона (базовая проверка)
 * @param {string} phone - Номер телефона для валидации
 * @returns {boolean} true если номер валиден
 */
export function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return true // Телефон опционален
  const phoneRegex = /^[\d\s\-\+\(\)]+$/
  return phoneRegex.test(phone.trim())
}

/**
 * Валидирует данные пользователя перед сохранением
 * @param {Object} user - Данные пользователя
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
export function validateUser(user) {
  const errors = []

  if (!user || typeof user !== 'object') {
    return { isValid: false, errors: ['Данные пользователя не предоставлены'] }
  }

  // Валидация обязательных полей
  if (!user.id || typeof user.id !== 'string') {
    errors.push('ID пользователя обязателен')
  }

  if (!user.email || !isValidEmail(user.email)) {
    errors.push('Email обязателен и должен быть валидным')
  }

  // Валидация UUID (если указан)
  if (user.uuid && !isValidUUID(user.uuid)) {
    errors.push('UUID должен быть в правильном формате')
  }

  // Валидация телефона (если указан)
  if (user.phone && !isValidPhone(user.phone)) {
    errors.push('Номер телефона должен быть в правильном формате')
  }

  // Валидация числовых полей
  if (user.trafficGB !== undefined && (typeof user.trafficGB !== 'number' || user.trafficGB < 0)) {
    errors.push('Лимит трафика должен быть неотрицательным числом')
  }

  if (user.devices !== undefined && (typeof user.devices !== 'number' || user.devices < 1)) {
    errors.push('Количество устройств должно быть не менее 1')
  }

  // Валидация даты истечения
  if (user.expiresAt !== undefined && user.expiresAt !== null) {
    // Принимаем и number, и string (ISO строка)
    const expiresAtValue = typeof user.expiresAt === 'string' 
      ? new Date(user.expiresAt).getTime() 
      : user.expiresAt
    
    if (typeof expiresAtValue !== 'number' || isNaN(expiresAtValue) || expiresAtValue < 0) {
      errors.push('Дата истечения должна быть валидной временной меткой')
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Нормализует данные пользователя перед сохранением
 * @param {Object} user - Данные пользователя
 * @returns {Object} Нормализованные данные
 */
export function normalizeUser(user) {
  if (!user || typeof user !== 'object') {
    throw new Error('Данные пользователя не предоставлены')
  }

  // Нормализация subId: строка (приоритет у subId, если нет - используем subid для обратной совместимости)
  let normalizedSubId = ''
  if (user.subId) {
    normalizedSubId = String(user.subId).trim()
  } else if (user.subid) {
    // Обратная совместимость: если subid - массив, берем первый элемент
    if (Array.isArray(user.subid) && user.subid.length > 0) {
      normalizedSubId = String(user.subid[0]).trim()
    } else if (typeof user.subid === 'string') {
      normalizedSubId = String(user.subid).trim()
    }
  }

  // Создаем копию объекта user без старого поля subid (если оно есть)
  // Это предотвращает дублирование данных при миграции со старого формата
  const { subid, ...userWithoutOldSubid } = user

  // Нормализуем основные поля и сохраняем все остальные поля из user
  return {
    // Сохраняем все поля из user (кроме старого subid), чтобы не потерять данные
    ...userWithoutOldSubid,
    // Нормализуем основные поля
    id: String(user.id || ''),
    email: String(user.email || '').trim().toLowerCase(),
    uuid: user.uuid ? String(user.uuid).trim() : '',
    name: user.name ? String(user.name).trim() : '',
    phone: user.phone ? String(user.phone).trim() : '',
    expiresAt: user.expiresAt != null 
      ? (typeof user.expiresAt === 'string' 
          ? new Date(user.expiresAt).getTime() 
          : Number(user.expiresAt)) 
      : null,
    trafficGB: user.trafficGB != null ? Number(user.trafficGB) || 0 : 0,
    devices: user.devices != null ? Number(user.devices) || 1 : 1,
    tariffId: user.tariffId ? String(user.tariffId) : null,
    plan: user.plan ? String(user.plan) : 'free',
    role: user.role ? String(user.role) : 'user',
    subId: normalizedSubId,
  }
}

