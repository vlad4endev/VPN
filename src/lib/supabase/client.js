import { createClient } from '@supabase/supabase-js'
import logger from '../../shared/utils/logger.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabase = null
let initError = null

if (supabaseUrl && supabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'vpn-supabase-auth',
      },
    })
    logger.info('Supabase', 'Клиент инициализирован', { url: supabaseUrl })
  } catch (err) {
    initError = err.message
    logger.error('Supabase', 'Ошибка инициализации', null, err)
  }
} else {
  initError = 'VITE_SUPABASE_URL или VITE_SUPABASE_ANON_KEY не заданы'
  logger.warn('Supabase', initError)
}

export { supabase, initError }

export function getSupabase() {
  return supabase
}
