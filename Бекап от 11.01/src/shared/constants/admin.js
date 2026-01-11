/**
 * Константы для администраторов
 * Email админов загружаются из переменных окружения
 */

/**
 * Получает список email админов из переменных окружения
 * Формат: VITE_ADMIN_EMAILS=email1@example.com,email2@example.com
 * @returns {string[]} Массив нормализованных email адресов
 */
export const getAdminEmails = () => {
  const adminEmailsStr = import.meta.env.VITE_ADMIN_EMAILS || 'vladislav4endev@gmail.com'
  return adminEmailsStr
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0)
}

/**
 * Проверяет, является ли email админом
 * @param {string} email - Email для проверки
 * @returns {boolean} true если email является админом
 */
export const isAdminEmail = (email) => {
  if (!email) return false
  const normalizedEmail = email.trim().toLowerCase()
  const adminEmails = getAdminEmails()
  return adminEmails.includes(normalizedEmail)
}

