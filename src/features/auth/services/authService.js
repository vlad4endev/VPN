import { supabase } from '../../../lib/supabase/client.js'
import { APP_ID } from '../../../shared/constants/app.js'
import { getApiBaseUrl } from '../../../shared/utils/apiBase.js'
import ThreeXUI from '../../vpn/services/ThreeXUI.js'
import logger from '../../../shared/utils/logger.js'

async function generateUniqueSubId(maxAttempts = 10) {
  if (!supabase) return ThreeXUI.generateSubId()

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const subId = ThreeXUI.generateSubId()

    try {
      const { data, error } = await supabase
        .from('vpn_users')
        .select('uid')
        .eq('app_id', APP_ID)
        .eq('sub_id', subId)
        .limit(1)

      if (error) throw error

      if (!data || data.length === 0) {
        logger.info('Auth', `Уникальный subId сгенерирован с попытки ${attempt}`, { subId, appId: APP_ID })
        return subId
      }

      logger.warn('Auth', `subId ${subId} уже существует, генерируем новый (попытка ${attempt}/${maxAttempts})`)
      if (attempt === maxAttempts) {
        const timestamp = Date.now()
        const extraRandom = Math.floor(Math.random() * 10000000000)
        return `${timestamp}${extraRandom.toString().padStart(10, '0')}`
      }
    } catch (error) {
      logger.error('Auth', 'Ошибка при проверке уникальности subId', { subId, attempt, appId: APP_ID }, error)
      if (attempt === maxAttempts) return subId
    }
  }

  return ThreeXUI.generateSubId()
}

export const authService = {
  async loadUserData(uid) {
    if (!supabase || !uid) return null

    try {
      const { data, error } = await supabase
        .from('vpn_users')
        .select('*')
        .eq('uid', uid)
        .eq('app_id', APP_ID)
        .single()

      if (error) {
        if (error.code === 'PGRST116') return null
        throw error
      }

      if (!data) return null

      let userData = {
        id: data.uid,
        email: data.email,
        name: data.name,
        phone: data.phone,
        role: data.role,
        plan: data.plan,
        uuid: data.uuid,
        subId: data.sub_id,
        expiresAt: data.expires_at,
        tariffId: data.tariff_id,
        tariffName: data.tariff_name,
        photoURL: data.photo_url,
        language: data.language,
        referredBy: data.referred_by,
        createdAt: data.source_created_at,
        updatedAt: data.source_updated_at,
        ...(data.raw || {}),
      }

      if (!userData.subId) {
        logger.info('Auth', 'У существующего пользователя нет subId, генерируем уникальный (loadUserData)', { uid, email: userData.email })
        try {
          const generatedSubId = await generateUniqueSubId()
          const { error: updateErr } = await supabase
            .from('vpn_users')
            .update({ sub_id: generatedSubId, source_updated_at: new Date().toISOString() })
            .eq('uid', uid)

          if (!updateErr) {
            userData = { ...userData, subId: generatedSubId }
            logger.info('Auth', 'subId добавлен существующему пользователю (loadUserData)', { uid, subId: generatedSubId })
          }
        } catch (subIdErr) {
          logger.error('Auth', 'Ошибка при генерации subId для существующего пользователя', { uid }, subIdErr)
        }
      }

      logger.debug('Auth', 'Данные пользователя загружены', { uid, email: userData.email, hasSubId: !!userData.subId })
      return userData
    } catch (err) {
      if (err.message?.includes('permission') || err.code === '42501') {
        logger.error('Auth', 'Нет доступа к данным пользователя (permission-denied)', { uid }, err)
        throw err
      }

      if (err.message?.includes('offline') || err.message?.includes('Failed to fetch')) {
        logger.warn('Auth', 'Supabase офлайн, пытаемся загрузить из кеша localStorage', { uid })
        try {
          const savedUserStr = localStorage.getItem('vpn_current_user')
          if (savedUserStr) {
            const { parseUserSafely } = await import('../../../shared/utils/sanitizeUser.js')
            const savedUser = parseUserSafely(savedUserStr)
            if (savedUser && savedUser.id === uid) {
              logger.info('Auth', 'Данные пользователя загружены из localStorage (офлайн-режим)', { uid, email: savedUser.email })
              return savedUser
            }
          }
        } catch (localErr) {
          logger.warn('Auth', 'Ошибка загрузки из localStorage', { uid }, localErr)
        }
        return null
      }

      logger.error('Auth', 'Ошибка загрузки данных пользователя', { uid }, err)
      return null
    }
  },

  async ensureUserExists(supabaseUser) {
    if (!supabaseUser?.id) return null
    const existing = await this.loadUserData(supabaseUser.id)
    if (existing) return existing

    const generatedUUID = ThreeXUI.generateUUID()
    const generatedSubId = await generateUniqueSubId()
    const now = new Date().toISOString()
    const uiLang = (typeof localStorage !== 'undefined' && localStorage.getItem('vpn-ui-lang')) || 'ru'

    const newUserData = {
      uid: supabaseUser.id,
      app_id: APP_ID,
      email: supabaseUser.email || null,
      name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || '',
      phone: '',
      role: 'user',
      plan: 'free',
      uuid: generatedUUID,
      sub_id: generatedSubId,
      expires_at: null,
      tariff_id: null,
      tariff_name: null,
      photo_url: supabaseUser.user_metadata?.avatar_url || null,
      language: uiLang,
      referred_by: null,
      raw: {},
      source_created_at: now,
      source_updated_at: now,
    }

    const { error } = await supabase.from('vpn_users').upsert(newUserData, { onConflict: 'uid' })
    if (error) {
      logger.error('Auth', 'Ошибка создания пользователя в Supabase', { uid: supabaseUser.id }, error)
      throw error
    }

    logger.info('Auth', 'Пользователь создан в Supabase', { uid: supabaseUser.id, email: supabaseUser.email })
    return {
      id: supabaseUser.id,
      email: newUserData.email,
      name: newUserData.name,
      phone: newUserData.phone,
      role: newUserData.role,
      plan: newUserData.plan,
      uuid: newUserData.uuid,
      subId: newUserData.sub_id,
      expiresAt: null,
      tariffId: null,
      tariffName: null,
      photoURL: newUserData.photo_url,
      language: newUserData.language,
      createdAt: now,
      updatedAt: now,
    }
  },

  async createUserWithEmail(email, password, name, referredBy = null) {
    if (!supabase) {
      throw new Error('Система авторизации недоступна. Проверьте конфигурацию Supabase.')
    }

    logger.info('Auth', 'Начало регистрации нового пользователя через Supabase Auth', { email })

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name.trim() },
      },
    })

    if (authError) throw authError
    const supabaseUser = authData.user
    if (!supabaseUser) throw new Error('Не удалось создать пользователя')

    const generatedUUID = ThreeXUI.generateUUID()
    logger.info('Auth', 'UUID сгенерирован для нового пользователя', { email, uuid: generatedUUID })

    const generatedSubId = await generateUniqueSubId()
    logger.info('Auth', 'Уникальный subId сгенерирован для нового пользователя', { email, subId: generatedSubId })

    const uiLang = (typeof localStorage !== 'undefined' && localStorage.getItem('vpn-ui-lang')) || 'ru'
    const now = new Date().toISOString()
    const newUserRow = {
      uid: supabaseUser.id,
      app_id: APP_ID,
      email,
      name: name.trim(),
      phone: '',
      role: 'user',
      plan: 'free',
      uuid: generatedUUID,
      sub_id: generatedSubId,
      expires_at: null,
      tariff_id: null,
      tariff_name: null,
      photo_url: null,
      language: uiLang,
      referred_by: referredBy?.trim() || null,
      raw: {},
      source_created_at: now,
      source_updated_at: now,
    }

    const { error: insertErr } = await supabase.from('vpn_users').upsert(newUserRow, { onConflict: 'uid' })
    if (insertErr) throw insertErr

    logger.info('Supabase', 'Данные пользователя созданы', { uid: supabaseUser.id, email })

    const userData = {
      id: supabaseUser.id,
      email,
      name: name.trim(),
      phone: '',
      role: 'user',
      plan: 'free',
      uuid: generatedUUID,
      subId: generatedSubId,
      expiresAt: null,
      tariffName: '',
      tariffId: '',
      photoURL: null,
      language: uiLang,
      createdAt: now,
      updatedAt: now,
      ...(referredBy && referredBy.trim() ? { referredBy: referredBy.trim() } : {}),
    }

    return { supabaseUser, userData }
  },

  async signInWithEmail(email, password) {
    if (!supabase) {
      throw new Error('Система авторизации недоступна. Проверьте конфигурацию Supabase.')
    }

    logger.info('Auth', 'Попытка входа через Supabase Auth', { email })

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) throw authError

    const supabaseUser = authData.user
    if (!supabaseUser) throw new Error('Не удалось войти')

    let userData = await this.loadUserData(supabaseUser.id)
    if (!userData) {
      userData = await this.ensureUserExists(supabaseUser)
      if (!userData) {
        logger.warn('Auth', 'Данные пользователя не найдены', { uid: supabaseUser.id })
        await supabase.auth.signOut()
        throw new Error('Данные пользователя не найдены. Обратитесь к администратору.')
      }
    }

    const currentUserData = {
      ...userData,
      email: supabaseUser.email || userData.email,
      photoURL: supabaseUser.user_metadata?.avatar_url || userData.photoURL || null,
    }

    logger.info('Auth', 'Успешный вход', { email, uid: supabaseUser.id, role: userData.role })
    return { supabaseUser, userData: currentUserData }
  },

  async signOut() {
    if (!supabase) {
      throw new Error('Система авторизации недоступна.')
    }

    const { error } = await supabase.auth.signOut()
    if (error) throw error
    logger.info('Auth', 'Выход выполнен')
  },

  async sendPasswordResetEmail(email) {
    if (!supabase || !email || typeof email !== 'string') {
      throw new Error('Email обязателен для сброса пароля')
    }
    const trimmed = email.trim()
    if (!trimmed) throw new Error('Email обязателен для сброса пароля')

    const { error } = await supabase.auth.resetPasswordForEmail(trimmed)
    if (error) throw error
    logger.info('Auth', 'Письмо для сброса пароля отправлено', { email: trimmed })
  },

  getErrorMessageI18nKey(error) {
    if (!error?.message) return null
    const msg = error.message.toLowerCase()
    const messageToKey = {
      'invalid login credentials': 'app.wrongPassword',
      'email not confirmed': 'app.emailNotConfirmed',
      'user not found': 'app.userNotFound',
      'email already registered': 'app.emailExists',
      'password should be at least': 'validation.passwordMinLength',
      'too many requests': 'app.tooManyAttempts',
      'network': 'app.networkError',
      'signup is disabled': 'app.serviceUnavailable',
    }
    for (const [substring, key] of Object.entries(messageToKey)) {
      if (msg.includes(substring)) return key
    }
    return null
  },

  getErrorMessage(error) {
    if (!error) return null
    const msg = error.message?.toLowerCase() || ''
    const errorMessages = {
      'invalid login credentials': 'Неверный email или пароль.',
      'email not confirmed': 'Email не подтверждён. Проверьте почту.',
      'user not found': 'Пользователь с таким email не найден.',
      'email already registered': 'Пользователь с таким email уже существует.',
      'user already registered': 'Пользователь с таким email уже существует.',
      'password should be at least': 'Пароль слишком слабый. Используйте более сложный пароль.',
      'too many requests': 'Слишком много попыток входа. Попробуйте позже.',
      'signup is disabled': 'Регистрация временно отключена.',
    }
    for (const [substring, message] of Object.entries(errorMessages)) {
      if (msg.includes(substring)) return message
    }
    return error.message || 'Произошла ошибка. Попробуйте еще раз.'
  },
}
