/**
 * Форматирование трафика (байты в читаемый формат)
 * @param {number} bytes - Количество байт
 * @returns {string} Отформатированный размер трафика
 */
export const formatTraffic = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`
}

