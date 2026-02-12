import { useState, useCallback } from 'react'
import { getBindLink, unbindTelegram } from '../services/telegramService.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Хук для привязки/отвязки Telegram в профиле.
 * @param {Object} currentUser - текущий пользователь (должен содержать tgId)
 * @param {() => void} [onBoundChange] - вызывается после успешной привязки/отвязки (например, обновить пользователя)
 */
export function useTelegram(currentUser, onBoundChange) {
  const [loading, setLoading] = useState(false)
  const [bindLink, setBindLink] = useState(null)
  const [error, setError] = useState('')

  const isBound = Boolean(currentUser?.tgId && String(currentUser.tgId).trim())

  const getLink = useCallback(async () => {
    setError('')
    setLoading(true)
    setBindLink(null)
    try {
      const result = await getBindLink()
      if (result.success && result.link) {
        setBindLink(result.link)
        logger.info('Telegram', 'Ссылка для привязки получена', { expiresIn: result.expiresIn })
      } else {
        setError(result.error || 'Не удалось получить ссылку')
      }
    } catch (err) {
      setError(err.message || 'Ошибка запроса')
      logger.error('Telegram', 'getBindLink', null, err)
    } finally {
      setLoading(false)
    }
  }, [])

  const unbind = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const result = await unbindTelegram()
      if (result.success) {
        setBindLink(null)
        logger.info('Telegram', 'Telegram отвязан')
        if (typeof onBoundChange === 'function') onBoundChange()
      } else {
        setError(result.error || 'Не удалось отвязать')
      }
    } catch (err) {
      setError(err.message || 'Ошибка запроса')
      logger.error('Telegram', 'unbind', null, err)
    } finally {
      setLoading(false)
    }
  }, [onBoundChange])

  const clearLink = useCallback(() => {
    setBindLink(null)
    setError('')
  }, [])

  return {
    isBound,
    bindLink,
    loading,
    error,
    getLink,
    unbind,
    clearLink,
  }
}
