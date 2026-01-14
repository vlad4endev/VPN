/**
 * Валидация имени пользователя
 * @param {string} name - Имя для валидации
 * @returns {string|null} Сообщение об ошибке или null если валидно
 */
export const validateName = (name) => {
  if (!name || name.trim() === '') {
    return 'Имя обязательно для заполнения'
  }
  
  if (name.trim().length < 2) {
    return 'Имя должно содержать минимум 2 символа'
  }
  
  if (name.length > 100) {
    return 'Имя слишком длинное (максимум 100 символов)'
  }
  
  // Проверяем, что имя содержит только буквы, пробелы и дефисы
  if (!/^[a-zA-Zа-яА-ЯёЁ\s-]+$/.test(name.trim())) {
    return 'Имя может содержать только буквы, пробелы и дефисы'
  }
  
  return null
}

