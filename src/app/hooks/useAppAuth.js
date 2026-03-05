import { useEffect, useCallback } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs, doc, query, where, updateDoc, setDoc } from 'firebase/firestore'
import ThreeXUI from '../../features/vpn/services/ThreeXUI.js'
import { getDb } from '../../lib/firebase/config.js'
import { authService } from '../../features/auth/services/authService.js'
import logger from '../../shared/utils/logger.js'
import i18n from '../../i18n'
import { isAdminEmail } from '../../shared/constants/admin.js'
import { getFirestoreSafeName } from '../../shared/utils/firestoreSafe.js'
import { applyUserLanguageToUi } from '../../features/auth/services/userLanguageService.js'
import { isBrowserAuthPath } from '../../features/telegram/utils/tmaPath.js'

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
  const generateUniqueSubId = useCallback(async (dbInstance, appIdValue, maxAttempts = 10) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const subId = ThreeXUI.generateSubId()

      try {
        // Проверяем, существует ли уже такой subId в базе данных
        const usersCollection = collection(dbInstance, `artifacts/${appIdValue}/public/data/users_v4`)
        const q = query(usersCollection, where('subId', '==', subId))
        const querySnapshot = await getDocs(q)

        if (querySnapshot.empty) {
          // subId уникален
          logger.info('Auth', `Уникальный subId сгенерирован с попытки ${attempt}`, { subId })
          return subId
        } else {
          // subId уже существует, генерируем новый
          logger.warn('Auth', `subId ${subId} уже существует, генерируем новый (попытка ${attempt})`)
          if (attempt === maxAttempts) {
            // Если достигли максимума попыток, добавляем дополнительную случайность
            const timestamp = Date.now()
            const extraRandom = Math.floor(Math.random() * 10000000000)
            const uniqueSubId = `${timestamp}${extraRandom.toString().padStart(10, '0')}`
            logger.warn('Auth', `Достигнут максимум попыток, используем subId с дополнительной случайностью`, { uniqueSubId })
            return uniqueSubId
          }
        }
      } catch (error) {
        const isInvalidDb = error?.message?.includes('Expected first argument to collection()') || error?.message?.includes('Expected first argument to doc()')
        if (isInvalidDb) {
          logger.debug('Auth', 'Firestore db недействителен при проверке subId, возвращаем subId без проверки', { subId })
          return subId
        }
        logger.error('Auth', 'Ошибка при проверке уникальности subId', { subId, attempt }, error)
        if (attempt === maxAttempts) {
          return subId
        }
      }
    }

    // Если все попытки не удались, возвращаем последний сгенерированный
    return ThreeXUI.generateSubId()
  }, [])

  // Единая загрузка данных пользователя через authService (subId-миграция, офлайн, permission-denied)
  const loadUserData = useCallback(async (uid, dbOverride) => {
    try {
      return await authService.loadUserData(uid, dbOverride ?? getDb())
    } catch (err) {
      if (err.code === 'permission-denied') {
        setError(i18n.t('app.noAccessDb'))
        return null
      }
      throw err
    }
  }, [])

  // Отслеживание состояния авторизации Firebase Auth (getDb() — актуальный Firestore, избегаем FirebaseError при дублировании модуля)
  useEffect(() => {
    if (!auth || !getDb()) {
      setLoading(false)
      setAuthChecking(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      logger.debug('App', 'onAuthStateChanged', { user: !!firebaseUser, uid: firebaseUser?.uid })
      setFirebaseUser(firebaseUser)
      const dbInstance = getDb()
      const path = typeof window !== 'undefined' ? (window.location.pathname || '').toLowerCase().replace(/\/+$/, '') : ''
      if (!dbInstance) {
        setLoading(false)
        setAuthChecking(false)
        return
      }
      if (firebaseUser) {
        // Пользователь авторизован - загружаем данные из Firestore (getDb() даёт актуальный экземпляр)
        try {
          let userData = await loadUserData(firebaseUser.uid, dbInstance)
          if (!userData) {
            userData = await authService.ensureFirestoreUserIfMissing(firebaseUser, dbInstance)
          }
          if (userData) {
            // Миграция: если у существующего пользователя нет subId, генерируем его
            if (!userData.subId) {
              logger.info('Auth', 'У существующего пользователя нет subId, генерируем уникальный', {
                uid: firebaseUser.uid,
                email: firebaseUser.email
              })
              try {
                const generatedSubId = await generateUniqueSubId(dbInstance, appId)
                const userDocRef = doc(dbInstance, `artifacts/${appId}/public/data/users_v4`, firebaseUser.uid)
                await updateDoc(userDocRef, {
                  subId: generatedSubId,
                  updatedAt: new Date().toISOString(),
                })
                userData = { ...userData, subId: generatedSubId }
                logger.info('Auth', 'subId добавлен существующему пользователю', { uid: firebaseUser.uid, subId: generatedSubId })
              } catch (subIdErr) {
                logger.error('Auth', 'Ошибка при генерации subId для существующего пользователя', { uid: firebaseUser.uid }, subIdErr)
                // Продолжаем работу без subId, но логируем ошибку
              }
            }

            // Проверяем неоплаченную подписку (5 дней для удаления)
            if (userData.paymentStatus === 'unpaid' && userData.uuid && userData.tariffId) {
              try {
                const { dashboardService } = await import('../../features/dashboard/services/dashboardService.js')
                const deletedUser = await dashboardService.checkAndDeleteUnpaidSubscription(userData)
                if (deletedUser === null) {
                  // Подписка была удалена, перезагружаем данные пользователя
                  userData = await loadUserData(firebaseUser.uid, dbInstance)
                  if (!userData) {
                    setCurrentUser(null)
                    setLoading(false)
                    setAuthChecking(false)
                    return
                  }
                }
              } catch (unpaidErr) {
                logger.error('Auth', 'Ошибка проверки неоплаченной подписки', { uid: firebaseUser.uid }, unpaidErr)
                // Продолжаем работу, даже если проверка не удалась
              }
            }

            let effectiveRole = userData.role || 'user'

            // Специальный доступ к админ-панели для конкретного пользователя по email
            // Это выполняется один раз и сразу сохраняется в Firestore,
            // чтобы далее роль хранилась в данных пользователя.
            const normalizedEmail = (firebaseUser.email || userData.email || '').trim().toLowerCase()
            if (isAdminEmail(normalizedEmail) && effectiveRole !== 'admin') {
              try {
                const userDocRef = doc(dbInstance, `artifacts/${appId}/public/data/users_v4`, firebaseUser.uid)
                await updateDoc(userDocRef, { role: 'admin', updatedAt: new Date().toISOString() })
                effectiveRole = 'admin'
                logger.info('Auth', 'Пользователю выданы права администратора по email', { email: normalizedEmail })
              } catch (roleErr) {
                logger.error('Auth', 'Не удалось обновить роль пользователя до admin', { email: normalizedEmail }, roleErr)
              }
            }

            const currentUserData = {
              ...userData,
              email: firebaseUser.email || userData.email,
              photoURL: firebaseUser.photoURL || userData.photoURL || null,
              name: firebaseUser.displayName || userData.name || '',
              role: effectiveRole,
            }
            setCurrentUser(currentUserData)
            logger.info('Firebase', 'Пользователь авторизован, данные загружены', { uid: firebaseUser.uid, role: effectiveRole })

            // Запрашиваем разрешение на уведомления для существующих пользователей (с задержкой)
            setTimeout(async () => {
              try {
                const notificationService = (await import('../../shared/services/notificationService.js')).default
                const notificationInstance = notificationService.getInstance()
                // Запрашиваем только если разрешения еще нет
                if (!notificationInstance.hasPermission()) {
                  await notificationInstance.requestPermission()
                  logger.info('Firebase', 'Запрос разрешения на уведомления выполнен для существующего пользователя')
                }
              } catch (notificationError) {
                logger.warn('Firebase', 'Ошибка при запросе разрешения на уведомления', null, notificationError)
                // Не блокируем загрузку из-за ошибки уведомлений
              }
            }, 2000) // Задержка 2 секунды, чтобы не показывать запрос сразу при загрузке

            // Устанавливаем view с учётом роли (многопользовательский режим: не показывать админку не-админу)
            const savedView = localStorage.getItem('vpn_current_view')
            // Всегда редирект с экрана логина после успешной загрузки пользователя (email, Google, customToken)
            const nextView = getAllowedView(savedView, effectiveRole)
            setView(nextView)
            if ((view === 'login' || view === 'register' || view === 'welcome') && isBrowserAuthPath(path)) {
              logger.debug('App', 'onAuthStateChanged: редирект с экрана входа', { nextView, role: effectiveRole })
            }
          } else {
            // Данные не найдены — для Google создаём документ (fallback при redirect/гонке с popup)
            if (firebaseUser.providerData?.some((p) => p.providerId === 'google.com')) {
              try {
                const dbForFallback = getDb()
                if (!dbForFallback) {
                  logger.warn('Auth', 'Firestore недоступен для fallback-создания пользователя после Google', { uid: firebaseUser.uid })
                  setCurrentUser(null)
                  setLoading(false)
                  setAuthChecking(false)
                  return
                }
                logger.info('Auth', 'Создание пользователя в Firestore из onAuthStateChanged (fallback после Google)', { uid: firebaseUser.uid, email: firebaseUser.email })
                const generatedUUID = ThreeXUI.generateUUID()
                const generatedSubId = await generateUniqueSubId(dbForFallback, appId)
                const userDocRef = doc(dbForFallback, `artifacts/${appId}/public/data/users_v4`, firebaseUser.uid)
                const safeName = getFirestoreSafeName(firebaseUser.displayName, firebaseUser.email)
                const newUserData = {
                  email: firebaseUser.email || '',
                  name: safeName,
                  phone: '',
                  role: 'user',
                  plan: 'free',
                  uuid: generatedUUID,
                  subId: generatedSubId,
                  expiresAt: null,
                  tariffName: '',
                  tariffId: '',
                  photoURL: firebaseUser.photoURL || null,
                  language: (typeof localStorage !== 'undefined' && localStorage.getItem('vpn-ui-lang')) || i18n.language || 'ru',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }
                await setDoc(userDocRef, newUserData)
                let effectiveRole = 'user'
                const normalizedEmail = (firebaseUser.email || '').trim().toLowerCase()
                if (isAdminEmail(normalizedEmail)) {
                  try {
                    await updateDoc(userDocRef, { role: 'admin', updatedAt: new Date().toISOString() })
                    effectiveRole = 'admin'
                  } catch (roleErr) {
                    logger.error('Auth', 'Не удалось выдать admin по email в fallback', { email: normalizedEmail }, roleErr)
                  }
                }
                const currentUserData = {
                  id: firebaseUser.uid,
                  ...newUserData,
                  email: firebaseUser.email || '',
                  photoURL: firebaseUser.photoURL || null,
                  name: firebaseUser.displayName || '',
                  role: effectiveRole,
                }
                setCurrentUser(currentUserData)
                applyUserLanguageToUi(currentUserData, i18n.changeLanguage.bind(i18n))
                setView(effectiveRole === 'admin' ? 'admin' : 'dashboard')
                if (effectiveRole !== 'admin') setDashboardTab('subscription')
                logger.info('Auth', 'Вход через Google восстановлен в onAuthStateChanged', { uid: firebaseUser.uid, role: effectiveRole })
              } catch (fallbackErr) {
                logger.error('Auth', 'Ошибка fallback-создания пользователя после Google', { uid: firebaseUser.uid }, fallbackErr)
                setCurrentUser(null)
              }
            } else {
              let fallbackHandled = false
              // Не Google — пробуем создать документ клиентом (fallback при недоступности API ensure-firestore-user)
              const dbForFallback = getDb()
              if (dbForFallback && firebaseUser.email) {
                try {
                  logger.info('Auth', 'Создание пользователя в Firestore из onAuthStateChanged (fallback для email)', { uid: firebaseUser.uid, email: firebaseUser.email })
                  const generatedUUID = ThreeXUI.generateUUID()
                  const generatedSubId = await generateUniqueSubId(dbForFallback, appId)
                  const userDocRef = doc(dbForFallback, `artifacts/${appId}/public/data/users_v4`, firebaseUser.uid)
                  const safeName = getFirestoreSafeName(firebaseUser.displayName, firebaseUser.email)
                  const newUserData = {
                    email: firebaseUser.email || '',
                    name: safeName,
                    phone: '',
                    role: 'user',
                    plan: 'free',
                    uuid: generatedUUID,
                    subId: generatedSubId,
                    expiresAt: null,
                    tariffName: '',
                    tariffId: '',
                    photoURL: firebaseUser.photoURL || null,
                    language: (typeof localStorage !== 'undefined' && localStorage.getItem('vpn-ui-lang')) || i18n.language || 'ru',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  }
                  await setDoc(userDocRef, newUserData)
                  let effectiveRole = 'user'
                  const normalizedEmail = (firebaseUser.email || '').trim().toLowerCase()
                  if (isAdminEmail(normalizedEmail)) {
                    try {
                      await updateDoc(userDocRef, { role: 'admin', updatedAt: new Date().toISOString() })
                      effectiveRole = 'admin'
                    } catch (roleErr) {
                      logger.error('Auth', 'Не удалось выдать admin по email в fallback', { email: normalizedEmail }, roleErr)
                    }
                  }
                  const currentUserData = {
                    id: firebaseUser.uid,
                    ...newUserData,
                    email: firebaseUser.email || '',
                    photoURL: firebaseUser.photoURL || null,
                    name: firebaseUser.displayName || '',
                    role: effectiveRole,
                  }
                  setCurrentUser(currentUserData)
                  applyUserLanguageToUi(currentUserData, i18n.changeLanguage.bind(i18n))
                  setView(effectiveRole === 'admin' ? 'admin' : 'dashboard')
                  if (effectiveRole !== 'admin') setDashboardTab('subscription')
                  logger.info('Auth', 'Вход через email восстановлен в onAuthStateChanged (client fallback)', { uid: firebaseUser.uid, role: effectiveRole })
                  fallbackHandled = true
                } catch (emailFallbackErr) {
                  logger.warn('Auth', 'Не удалось создать документ для email-пользователя (client fallback)', { uid: firebaseUser.uid }, emailFallbackErr)
                }
              }
              if (!fallbackHandled) {
                // Пробуем кеш localStorage (если fallback выше не сработал)
                try {
                  const savedUserStr = localStorage.getItem('vpn_current_user')
                  if (savedUserStr) {
                    const savedUser = JSON.parse(savedUserStr)
                    if (savedUser.id === firebaseUser.uid) {
                      logger.info('Firebase', 'Используем кешированные данные из localStorage', { uid: firebaseUser.uid, email: savedUser.email })
                      setCurrentUser(savedUser)
                      applyUserLanguageToUi(savedUser, i18n.changeLanguage.bind(i18n))
                      setTimeout(async () => {
                        try {
                          const notificationService = (await import('../../shared/services/notificationService.js')).default
                          const notificationInstance = notificationService.getInstance()
                          if (!notificationInstance.hasPermission()) {
                            await notificationInstance.requestPermission()
                            logger.info('Firebase', 'Запрос разрешения на уведомления выполнен для пользователя из кеша')
                          }
                        } catch (notificationError) {
                          logger.warn('Firebase', 'Ошибка при запросе разрешения на уведомления', null, notificationError)
                        }
                      }, 2000)
                      const savedView = localStorage.getItem('vpn_current_view')
                      setView(getAllowedView(savedView, savedUser.role))
                    } else {
                      logger.warn('Firebase', 'Пользователь авторизован, но данные в Firestore не найдены', { uid: firebaseUser.uid })
                      setCurrentUser(null)
                    }
                  } else {
                    logger.warn('Firebase', 'Пользователь авторизован, но данные в Firestore не найдены', { uid: firebaseUser.uid })
                    setCurrentUser(null)
                  }
                } catch (localErr) {
                  logger.warn('Firebase', 'Ошибка загрузки из localStorage', { uid: firebaseUser.uid }, localErr)
                  setCurrentUser(null)
                }
              }
            }
          }
        } catch (err) {
          const isInvalidDb = err?.message?.includes('Expected first argument to collection()') || err?.message?.includes('Expected first argument to doc()')
          if (isInvalidDb) {
            logger.debug('App', 'Firestore db недействителен (HMR/Strict Mode), пропускаем обработку onAuthStateChanged', { uid: firebaseUser?.uid })
            setLoading(false)
            setAuthChecking(false)
            return
          }
          const isOffline = err.code === 'unavailable' || err.message?.includes('offline') || err.message?.includes('Failed to get document because the client is offline')
          if (isOffline) {
            logger.warn('Firebase', 'Офлайн-режим Firebase, используем кеш', { uid: firebaseUser.uid })
            try {
              const savedUserStr = localStorage.getItem('vpn_current_user')
              if (savedUserStr) {
                const savedUser = JSON.parse(savedUserStr)
                if (savedUser.id === firebaseUser.uid) {
                  logger.info('Firebase', 'Данные загружены из кеша (офлайн-режим)', { uid: firebaseUser.uid, email: savedUser.email })
                  setCurrentUser(savedUser)
                  applyUserLanguageToUi(savedUser, i18n.changeLanguage.bind(i18n))
                  const savedView = localStorage.getItem('vpn_current_view')
                  setView(getAllowedView(savedView, savedUser.role))
                } else {
                  setCurrentUser(null)
                }
              } else {
                setCurrentUser(null)
              }
            } catch (localErr) {
              logger.warn('Firebase', 'Ошибка загрузки из localStorage', { uid: firebaseUser.uid }, localErr)
              setCurrentUser(null)
            }
          } else {
            logger.error('Firebase', 'Ошибка загрузки данных пользователя', { uid: firebaseUser.uid }, err)
            setCurrentUser(null)
          }
        }
      } else {
        // Пользователь не авторизован
        // Не сбрасывать currentUser во время TMA sign-in (гонка: onAuthStateChanged(null) может прийти после успешного входа)
        if (!signInInProgressRef.current) {
          setCurrentUser(null)
          logger.info('Firebase', 'Пользователь не авторизован')
        }
        // Не переключать view — остаёмся на welcome до клика (без глобального редиректа)
        if (typeof window !== 'undefined') {
          const path = (window.location.pathname || '').toLowerCase().replace(/\/+$/, '')
          const hash = (window.location.hash || '').toLowerCase()
          if (path === '/review' || hash === '#review') setView('review')
          else if (path === '/set-password') setView('set-password')
        }
      }

      setLoading(false)
      setAuthChecking(false) // Завершили проверку авторизации
    })

    return () => unsubscribe()
  }, [auth, db, loadUserData, generateUniqueSubId, setView])


  return { generateUniqueSubId, loadUserData }
}
