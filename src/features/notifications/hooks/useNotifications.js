import { useState, useEffect, useCallback } from 'react'
import { notificationsService } from '../services/notificationsService.js'
import notificationService from '../../../shared/services/notificationService.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Хук уведомлений: список, счётчик непрочитанных, пометить прочитанным, реальное время.
 * При появлении нового уведомления показывает браузерное push (если разрешено).
 */
export function useNotifications(userId) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)

  const unreadCount = list.filter((n) => !n.read).length

  const markAsRead = useCallback(
    async (notificationId) => {
      if (!notificationId) return
      await notificationsService.markAsRead(notificationId)
      setList((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      )
    },
    []
  )

  useEffect(() => {
    if (!userId) {
      setList([])
      setLoading(false)
      return
    }
    setLoading(true)
    const unsubscribe = notificationsService.subscribe(userId, (notifications) => {
      setList(notifications)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [userId])

  // Показывать браузерное уведомление только для новых непрочитанных (появившихся после предыдущего списка)
  const prevIdsRef = { current: new Set() }
  useEffect(() => {
    if (!userId || list.length === 0) return
    const instance = notificationService.getInstance()
    if (!instance.hasPermission()) return
    const currentIds = new Set(list.map((n) => n.id))
    list.forEach((n) => {
      if (n.read) return
      if (prevIdsRef.current.has(n.id)) return
      prevIdsRef.current.add(n.id)
      instance
        .showNotification(n.title, {
          body: n.body,
          tag: `notification-${n.id}`,
          data: { url: '/dashboard', type: n.type, id: n.id },
        })
        .catch(() => {})
    })
    prevIdsRef.current = currentIds
  }, [userId, list])

  return { list, unreadCount, loading, markAsRead }
}
