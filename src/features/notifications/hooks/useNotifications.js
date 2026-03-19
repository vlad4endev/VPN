import { useState, useEffect, useCallback, useRef } from 'react'
import { notificationsService } from '../services/notificationsService.js'
import notificationService from '../../../shared/services/notificationService.js'
import { registerAndSubscribe } from '../../support/services/pushSubscribeService.js'
import { supabase } from '../../../lib/supabase/client.js'
import logger from '../../../shared/utils/logger.js'

export function useNotifications(userId) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const pushSubscribedRef = useRef(false)

  useEffect(() => {
    pushSubscribedRef.current = false
  }, [userId])

  const unreadCount = list.filter((n) => !n.read).length

  const markAsRead = useCallback(async (notificationId) => {
    if (!notificationId) return
    await notificationsService.markAsRead(notificationId)
    setList((prev) => prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)))
  }, [])

  useEffect(() => {
    if (!userId) {
      setList([])
      setLoading(false)
      return
    }
    setList([])
    setLoading(true)
    const unsubscribe = notificationsService.subscribe(userId, (notifications) => {
      setList(notifications)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [userId])

  useEffect(() => {
    if (!userId || pushSubscribedRef.current) return
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return
    const getToken = async () => {
      if (!supabase) return null
      const { data, error } = await supabase.auth.getSession()
      if (error) return null
      return data?.session?.access_token || null
    }
    registerAndSubscribe(getToken)
      .then((ok) => {
        if (ok) pushSubscribedRef.current = true
      })
      .catch((err) => {
        logger.warn('useNotifications', 'Push subscribe failed', { message: err?.message })
      })
  }, [userId])

  const prevIdsRef = useRef(new Set())
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
        .catch((err) => console.warn('useNotifications:', err?.message))
    })
    prevIdsRef.current = currentIds
  }, [userId, list])

  return { list, unreadCount, loading, markAsRead }
}
