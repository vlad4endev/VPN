/**
 * Форматирование даты в читаемый формат
 * @param {number|string|Date} timestamp - Timestamp или дата
 * @returns {string} Отформатированная дата
 */
export const formatDate = (timestamp) => {
  if (!timestamp) return 'Не указано'
  const date = new Date(timestamp)
  return date.toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
