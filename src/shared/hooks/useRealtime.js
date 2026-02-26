import { useState, useEffect, useRef } from 'react'
import { ref, onValue, off } from 'firebase/database'
import { realtimeDb } from '../../lib/firebase/config.js'
import logger from '../utils/logger.js'

/**
 * Подписка на путь Firebase Realtime Database с автоматической отпиской при размонтировании.
 * Работает только если в .env задан VITE_FIREBASE_DATABASE_URL.
 *
 * @param {string|null|undefined} path - путь в Realtime DB (например 'presence/online', 'notifications/userId')
 * @param {Object} [options] - опции
 * @param {boolean} [options.enabled=true] - подписываться только когда true
 * @returns {{ data: any, loading: boolean, error: Error|null, isConnected: boolean }}
 */
export function useRealtime(path, options = {}) {
  const { enabled = true } = options
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const unsubscribeRef = useRef(null)

  useEffect(() => {
    if (!realtimeDb || !path || typeof path !== 'string' || !path.trim() || enabled === false) {
      setLoading(false)
      setData(null)
      setError(realtimeDb ? null : new Error('Realtime Database не настроен'))
      return
    }

    const pathTrimmed = path.trim()
    setLoading(true)
    setError(null)

    const dbRef = ref(realtimeDb, pathTrimmed)
    const unsubscribe = onValue(
      dbRef,
      (snapshot) => {
        setIsConnected(true)
        const val = snapshot.val()
        setData(val)
        setLoading(false)
      },
      (err) => {
        logger.warn('useRealtime', 'Ошибка подписки', { path: pathTrimmed }, err)
        setError(err)
        setLoading(false)
      }
    )
    unsubscribeRef.current = unsubscribe

    return () => {
      off(dbRef)
      unsubscribeRef.current = null
      setIsConnected(false)
    }
  }, [path, enabled])

  return { data, loading, error, isConnected }
}

/**
 * Записать значение в путь Realtime Database (вспомогательно; для записи лучше использовать сервис с правилами доступа).
 * @param {string} path - путь
 * @param {any} value - значение (сериализуется в JSON)
 */
export async function setRealtimeValue(path, value) {
  if (!realtimeDb) throw new Error('Realtime Database не настроен')
  const { set } = await import('firebase/database')
  const dbRef = ref(realtimeDb, path.trim())
  await set(dbRef, value)
}

/**
 * Обновить несколько ключей по пути (merge, не перезаписывает весь узел).
 * @param {string} path - путь
 * @param {Object} updates - объект с полями для обновления
 */
export async function updateRealtime(path, updates) {
  if (!realtimeDb) throw new Error('Realtime Database не настроен')
  const { update } = await import('firebase/database')
  const r = ref(realtimeDb, path.trim())
  const patch = {}
  for (const [key, val] of Object.entries(updates)) {
    patch[key] = val
  }
  await update(r, patch)
}
