import { useState, useEffect } from 'react'
import { supabase, initError } from '../../lib/supabase/client.js'
import logger from '../utils/logger.js'

/**
 * Hook providing access to the Supabase client.
 * Keeps the same export shape as the old Firebase hook so downstream code compiles.
 */
export function useFirebase() {
  const [loading, setLoading] = useState(true)
  const [configError, setConfigError] = useState(null)

  useEffect(() => {
    logger.info('App', 'Инициализация приложения (Supabase)')
    if (initError) {
      setConfigError(initError)
      logger.error('App', 'Supabase не инициализирован', { error: initError })
    } else if (!supabase) {
      setConfigError('Supabase клиент не создан')
    } else {
      logger.info('App', 'Supabase инициализирован')
    }
    setLoading(false)
  }, [])

  return {
    app: null,
    auth: null,
    db: supabase,
    supabase,
    realtimeDb: null,
    firebaseInitError: initError,
    configError,
    loading,
  }
}
