import logger from './logger.js'

/**
 * Копирование текста в буфер обмена
 * @param {string} text - Текст для копирования
 * @returns {Promise<void>}
 */
export const copyToClipboard = async (text) => {
  try {
    logger.debug('copyToClipboard', 'Копирование в буфер обмена', { textLength: text?.length || 0 })
    await navigator.clipboard.writeText(text)
    logger.info('copyToClipboard', 'Текст успешно скопирован в буфер обмена')
    return true
  } catch (err) {
    logger.error('copyToClipboard', 'Ошибка копирования в буфер обмена', { textLength: text?.length || 0 }, err)
    throw err
  }
}

