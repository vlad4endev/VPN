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

/** Роли с доступом к разделу «Финансы»: Админ и Бухгалтер */
const FINANCES_ROLES = ['admin', 'accountant', 'бухгалтер']

/**
 * Варианты ролей пользователя для селектов (админка, карточка пользователя)
 * value сохраняется в БД, label — отображаемое имя
 */
export const USER_ROLE_OPTIONS = [
  { value: 'user', label: 'Пользователь' },
  { value: 'accountant', label: 'Бухгалтер' },
  { value: 'admin', label: 'Админ' },
]

/**
 * Подпись роли для отображения в интерфейсе
 * @param {string} [role]
 * @returns {string}
 */
export const getRoleLabel = (role) => {
  if (!role) return 'Пользователь'
  const norm = String(role).toLowerCase()
  const o = USER_ROLE_OPTIONS.find((r) => r.value === norm || r.value === role)
  if (o) return o.label
  if (norm === 'бухгалтер' || role === 'бухгалтер') return 'Бухгалтер'
  return role
}

/**
 * CSS-классы для бейджа роли (таблица пользователей, карточка)
 * @param {string} [role]
 * @returns {string}
 */
export const getRoleBadgeClass = (role) => {
  if (role === 'admin') return 'bg-purple-900/30 text-purple-300'
  if (role === 'accountant' || role === 'бухгалтер') return 'bg-emerald-900/30 text-emerald-300'
  return 'bg-slate-700 text-slate-300'
}

/**
 * Доступ к админ-панели только у роли admin
 * @param {string} [role]
 * @returns {boolean}
 */
export const canAccessAdmin = (role) => role === 'admin'

/**
 * Доступ к разделу «Финансы» у ролей Админ и Бухгалтер
 * @param {string} [role]
 * @returns {boolean}
 */
export const canAccessFinances = (role) =>
  Boolean(role && FINANCES_ROLES.includes(String(role).toLowerCase()))

