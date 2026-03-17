import { useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase/client.js'
import ThreeXUI from '../../features/vpn/services/ThreeXUI.js'
import { authService } from '../../features/auth/services/authService.js'
import logger from '../../shared/utils/logger.js'
import i18n from '../../i18n'
import { isAdminEmail } from '../../shared/constants/admin.js'
import { getFirestoreSafeName } from '../../shared/utils/firestoreSafe.js'
import { applyUserLanguageToUi } from '../../features/auth/services/userLanguageService.js'
import { isBrowserAuthPath } from '../../features/telegram/utils/tmaPath.js'
import { APP_ID } from '../../shared/constants/app.js'

export const useAppAuth = ({
  appId,
  db,
  auth,
  setCurrentUser,
  setView,
  setDashboardTab,
  setLoading,
  setError,
  setAuthChecking,
  getAllowedView,
  firebaseUser,
  setFirebaseUser,
  signInInProgressRef
}) => {
  const generateUniqueSubId = useCallback(async (maxAttempts = 10) => {
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
          logger.info('Auth', `Уникальный subId сгенерирован с попытки ${attempt}`, { subId })
          return subId
        }
        logger.warn('Auth', `subId ${subId} уже существует, генерируем новый (попытка ${attempt})`)
        if (attempt === maxAttempts) {
          const timestamp = Date.now()
          const extraRandom = Math.floor(Math.random() * 10000000000)
          return `${timestamp}${extraRandom.toString().padStart(10, '0')}`
        }
      } catch (error) {
        logger.error('Auth', 'Ошибка при проверке уникальности subId', { subId, attempt }, error)
        if (attempt === maxAttempts) return subId
      }
    }
    return ThreeXUI.generateSubId()
  }, [])

  const loadUserData = useCallback(async (uid) => {
    try {
      return await authService.loadUserData(uid)
    } catch (err) {
      if (err.message?.includes('permission') || err.code === '42501') {
        setError(i18n.t('app.noAccessDb'))
        return null
      }
      throw err
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      setAuthChecking(false)
      return
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const supabaseUser = session?.user ?? null
      setFirebaseUser(supabaseUser)

      const path = typeof window !== 'undefined' ? (window.location.pathname || '').toLowerCase().replace(/\/+$/, '') : ''

      if (supabaseUser) {
        try {
          let userData = await loadUserData(supabaseUser.id)
          if (!userData) {
            userData = await authService.ensureUserExists(supabaseUser)
          }

          if (userData) {
            if (!userData.subId) {
              logger.info('Auth', 'У существующего пользователя нет subId, генерируем уникальный', { uid: supabaseUser.id })
              try {
                const generatedSubId = await generateUniqueSubId()
                const { error: updateErr } = await supabase
                  .from('vpn_users')
                  .update({ sub_id: generatedSubId, source_updated_at: new Date().toISOString() })
                  .eq('uid', supabaseUser.id)
                if (!updateErr) {
                  userData = { ...userData, subId: generatedSubId }
                  logger.info('Auth', 'subId добавлен существующему пользователю', { uid: supabaseUser.id, subId: generatedSubId })
                }
              } catch (subIdErr) {
                logger.error('Auth', 'Ошибка при генерации subId', { uid: supabaseUser.id }, subIdErr)
              }
            }

            if (userData.paymentStatus === 'unpaid' && userData.uuid && userData.tariffId) {
              try {
                const { dashboardService } = await import('../../features/dashboard/services/dashboardService.js')
                const deletedUser = await dashboardService.checkAndDeleteUnpaidSubscription(userData)
                if (deletedUser === null) {
                  userData = await loadUserData(supabaseUser.id)
                  if (!userData) {
                    setCurrentUser(null)
                    setLoading(false)
                    setAuthChecking(false)
                    return
                  }
                }
              } catch (unpaidErr) {
                logger.error('Auth', 'Ошибка проверки неоплаченной подписки', { uid: supabaseUser.id }, unpaidErr)
              }
            }

            let effectiveRole = userData.role || 'user'
            const normalizedEmail = (supabaseUser.email || userData.email || '').trim().toLowerCase()
            if (isAdminEmail(normalizedEmail) && effectiveRole !== 'admin') {
              try {
                await supabase
                  .from('vpn_users')
                  .update({ role: 'admin', source_updated_at: new Date().toISOString() })
                  .eq('uid', supabaseUser.id)
                effectiveRole = 'admin'
                logger.info('Auth', 'Пользователю выданы права администратора по email', { email: normalizedEmail })
              } catch (roleErr) {
                logger.error('Auth', 'Не удалось обновить роль пользователя до admin', { email: normalizedEmail }, roleErr)
              }
            }

            const currentUserData = {
              ...userData,
              email: supabaseUser.email || userData.email,
              photoURL: supabaseUser.user_metadata?.avatar_url || userData.photoURL || null,
              name: supabaseUser.user_metadata?.full_name || userData.name || '',
              role: effectiveRole,
            }
            setCurrentUser(currentUserData)
            applyUserLanguageToUi(currentUserData, i18n.changeLanguage.bind(i18n))
            logger.info('Supabase', 'Пользователь авторизован, данные загружены', { uid: supabaseUser.id, role: effectiveRole })

            setTimeout(async () => {
              try {
                const notificationService = (await import('../../shared/services/notificationService.js')).default
                const notificationInstance = notificationService.getInstance()
                if (!notificationInstance.hasPermission()) {
                  await notificationInstance.requestPermission()
                }
              } catch (notificationError) {
                logger.warn('App', 'Ошибка при запросе разрешения на уведомления', null, notificationError)
              }
            }, 2000)

            const savedView = localStorage.getItem('vpn_current_view')
            const nextView = getAllowedView(savedView, effectiveRole, currentUserData)
            setView(nextView)
          } else {
            setCurrentUser(null)
          }
        } catch (err) {
          const isOffline = err.message?.includes('offline') || err.message?.includes('Failed to fetch')
          if (isOffline) {
            logger.warn('Supabase', 'Офлайн-режим, используем кеш', { uid: supabaseUser.id })
            try {
              const savedUserStr = localStorage.getItem('vpn_current_user')
              if (savedUserStr) {
                const savedUser = JSON.parse(savedUserStr)
                if (savedUser.id === supabaseUser.id) {
                  setCurrentUser(savedUser)
                  applyUserLanguageToUi(savedUser, i18n.changeLanguage.bind(i18n))
                  const savedView = localStorage.getItem('vpn_current_view')
                  setView(getAllowedView(savedView, savedUser.role, savedUser))
                } else {
                  setCurrentUser(null)
                }
              } else {
                setCurrentUser(null)
              }
            } catch (localErr) {
              setCurrentUser(null)
            }
          } else {
            logger.error('Supabase', 'Ошибка загрузки данных пользователя', { uid: supabaseUser.id }, err)
            setCurrentUser(null)
          }
        }
      } else {
        if (!signInInProgressRef.current) {
          setCurrentUser(null)
          logger.info('Supabase', 'Пользователь не авторизован')
        }
        if (typeof window !== 'undefined') {
          const hash = (window.location.hash || '').toLowerCase()
          if (path === '/review' || hash === '#review') setView('review')
          else if (path === '/set-password') setView('set-password')
        }
      }

      setLoading(false)
      setAuthChecking(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null
      setFirebaseUser(user)

      if (user) {
        try {
          let userData = await loadUserData(user.id)
          if (!userData) {
            userData = await authService.ensureUserExists(user)
          }
          if (userData) {
            let effectiveRole = userData.role || 'user'
            const normalizedEmail = (user.email || userData.email || '').trim().toLowerCase()
            if (isAdminEmail(normalizedEmail) && effectiveRole !== 'admin') {
              effectiveRole = 'admin'
            }
            const currentUserData = {
              ...userData,
              email: user.email || userData.email,
              photoURL: user.user_metadata?.avatar_url || userData.photoURL || null,
              name: user.user_metadata?.full_name || userData.name || '',
              role: effectiveRole,
            }
            setCurrentUser(currentUserData)
            applyUserLanguageToUi(currentUserData, i18n.changeLanguage.bind(i18n))
          }
        } catch (err) {
          logger.error('Auth', 'onAuthStateChange: ошибка загрузки пользователя', { uid: user.id }, err)
        }
      } else if (!signInInProgressRef.current) {
        setCurrentUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [loadUserData, generateUniqueSubId, setView])

  return { generateUniqueSubId, loadUserData }
}
