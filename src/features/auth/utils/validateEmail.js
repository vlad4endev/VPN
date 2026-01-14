/**
 * Валидация email адреса
 * @param {string} email - Email для валидации
 * @returns {string|null} Сообщение об ошибке или null если валидно
 */
export const validateEmail = (email) => {
  if (!email || email.trim() === '') {
    return 'Email обязателен для заполнения'
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return 'Введите корректный email адрес'
  }
  
  if (email.length > 255) {
    return 'Email слишком длинный (максимум 255 символов)'
  }
  
  return null
}

