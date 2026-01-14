/**
 * Валидация пароля
 * @param {string} password - Пароль для валидации
 * @param {boolean} isRegister - Флаг регистрации (более строгие требования)
 * @returns {string|null} Сообщение об ошибке или null если валидно
 */
export const validatePassword = (password, isRegister = false) => {
  if (!password || password.trim() === '') {
    return 'Пароль обязателен для заполнения'
  }
  
  if (password.length < 6) {
    return 'Пароль должен содержать минимум 6 символов'
  }
  
  if (password.length > 128) {
    return 'Пароль слишком длинный (максимум 128 символов)'
  }
  
  if (isRegister) {
    // Дополнительные проверки для регистрации
    if (!/[A-Za-z]/.test(password)) {
      return 'Пароль должен содержать хотя бы одну букву'
    }
    
    if (!/[0-9]/.test(password)) {
      return 'Пароль должен содержать хотя бы одну цифру'
    }
  }
  
  return null
}

