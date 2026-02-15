import { useState, useEffect, useCallback, useRef } from 'react'
import { notificationsService } from '../services/notificationsService.js'
import notificationService from '../../../shared/services/notificationService.js'
import { registerAndSubscribe } from '../../support/services/pushSubscribeService.js'
import { auth } from '../../../lib/firebase/config.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Хук уведомлений: список, счётчик непрочитанных, пометить прочитанным, реальное время.
 * При появлении нового уведомления показывает браузерное push (если разрешено).
 * Регистрирует Web Push подписку для доставки рассылок и уведомлений о подписке в фоне (вкладка закрыта).
 */
export function useNotifications(userId) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const pushSubscribedRef = useRef(false)

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

  // Web Push для фоновых уведомлений (рассылка, подписка активирована). Один раз при наличии userId и разрешения.
  useEffect(() => {
    if (!userId || pushSubscribedRef.current) return
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return
    const getToken = () => (auth?.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null))
    registerAndSubscribe(getToken).then((ok) => {
      if (ok) pushSubscribedRef.current = true
    })
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
