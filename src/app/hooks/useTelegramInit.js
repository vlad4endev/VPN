import { useState, useRef, useCallback, useEffect } from 'react'
import { signInWithCustomToken } from 'firebase/auth'
import { tmaLog } from '../../features/telegram/utils/tmaLogger.js'
import logger from '../../shared/utils/logger.js'
import i18n from '../../i18n'
import { isBrowserAuthPath } from '../../features/telegram/utils/tmaPath.js'

export const useTelegramInit = ({
    auth,
    setCurrentUser,
    setView,
    loadUserData,
    setError,
    setTelegramOpenModal,
    firebaseUser,
    authChecking
}) => {
    const [telegramSignInLoading, setTelegramSignInLoading] = useState(false)
    const [hasTmaInitData, setHasTmaInitData] = useState(false)
    const [tmaWaitingAuth, setTmaWaitingAuth] = useState(false)
    const [tmaInitDataFromCheck, setTmaInitDataFromCheck] = useState(null)

    const isTelegramApp = hasTmaInitData
    const tmaUserFromAuthRef = useRef(null)

    useEffect(() => {
        if (typeof window === 'undefined') return
        const initData = typeof window.__TELEGRAM_INIT_DATA === 'string' ? window.__TELEGRAM_INIT_DATA.trim() : ''
        const hasInitData = !!initData
        setHasTmaInitData(hasInitData)
        setTmaInitDataFromCheck(hasInitData ? initData : null)
        setTmaWaitingAuth(hasInitData && !firebaseUser && !authChecking)
    }, [firebaseUser, authChecking])

    const handleTelegramSignIn = useCallback(async () => {
        if (!auth) return
        const initData = typeof window !== 'undefined' ? window.__TELEGRAM_INIT_DATA : null
        tmaLog('info', 'button_click', 'Кнопка «Войти через Telegram»: нажатие', { hasInitData: !!initData })
        logger.info('TelegramAuth', 'Кнопка «Войти через Telegram»: нажатие', { hasInitData: !!initData })
        if (!initData) {
            const fromEnv = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TELEGRAM_BOT_USERNAME)
                ? String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME).trim().replace(/^@/, '')
                : ''
            const botUsername = fromEnv || 'skypathvpn_bot'
            const url = botUsername ? `https://t.me/${botUsername}/app` : null
            tmaLog('warn', 'button_no_initdata', 'Вход через Telegram: нет initData — показ модалки «Открыть в боте»', { hasUrl: !!url })
            logger.warn('TelegramAuth', 'Вход через Telegram: нет initData', { url })
            setTelegramOpenModal({ open: true, url })
            return
        }
        setTelegramSignInLoading(true)
        setError('')
        try {
            const base = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ? import.meta.env.VITE_API_BASE_URL : ''
            let data = {}
            const storedToken = (typeof localStorage !== 'undefined' && localStorage.getItem('tma_session_token')) || ''
            if (storedToken) {
                tmaLog('info', 'button_session_request', 'Вход по кнопке: запрос по сессии', {})
                logger.info('TelegramAuth', 'Вход по кнопке: запрос по сессии', {})
                const resSession = await fetch(`${base}/api/telegram/auth`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Telegram-Session-Token': storedToken },
                    body: JSON.stringify({ sessionToken: storedToken }),
                })
                data = await resSession.json().catch(e => { console.error("API JSON Parse Error:", e); return {}; })
                tmaLog('info', 'button_session_response', 'Вход по кнопке: ответ по сессии', { success: data.success, status: resSession.status })
                logger.info('TelegramAuth', 'Вход по кнопке: ответ по сессии', { success: data.success, status: resSession.status })
                if (!data.success && typeof localStorage !== 'undefined') {
                    localStorage.removeItem('tma_session_token')
                    localStorage.removeItem('tma_session_expires')
                }
            }
            if (!data.success && initData) {
                tmaLog('info', 'button_initdata_request', 'Вход по кнопке: запрос по initData', {})
                logger.info('TelegramAuth', 'Вход по кнопке: запрос по initData', {})
                const resInit = await fetch(`${base}/api/telegram/auth`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Telegram-InitData': initData },
                    body: JSON.stringify({ initData }),
                })
                data = await resInit.json().catch(e => { console.error("API JSON Parse Error:", e); return {}; })
                tmaLog('info', 'button_initdata_response', 'Вход по кнопке: ответ по initData', { success: data.success, reason: data.reason, status: resInit.status })
                logger.info('TelegramAuth', 'Вход по кнопке: ответ по initData', { success: data.success, reason: data.reason, status: resInit.status })
            }
            if (data.success && data.customToken) {
                tmaLog('info', 'button_success', 'Вход по кнопке: успешная загрузка', { hasUser: !!data.user, uid: data.user?.id })
                logger.info('TelegramAuth', 'Вход по кнопке: успех', { hasSessionToken: !!data.sessionToken, hasUser: !!data.user })
                if (data.user && data.user.id) tmaUserFromAuthRef.current = { uid: data.user.id, user: data.user }
                if (data.sessionToken && typeof localStorage !== 'undefined') {
                    localStorage.setItem('tma_session_token', data.sessionToken)
                    if (data.sessionTokenExpiresAt) localStorage.setItem('tma_session_expires', String(data.sessionTokenExpiresAt))
                }
                await signInWithCustomToken(auth, data.customToken)
                if (data.user && data.uid) {
                    const currentUserData = { ...data.user, id: data.uid, role: data.user?.role || 'user' }
                    setCurrentUser(currentUserData)
                    setView(currentUserData.role === 'admin' ? 'admin' : 'dashboard')
                }
            } else {
                tmaLog('warn', 'button_error', 'Вход по кнопке: ошибка от сервера', { reason: data.reason, error: data.error })
                logger.warn('TelegramAuth', 'Вход по кнопке: ошибка', { error: data.error, reason: data.reason })
                setError(data.error || 'Не удалось войти через Telegram. Откройте приложение заново из меню бота.')
            }
        } catch (err) {
            tmaLog('error', 'button_exception', 'Вход по кнопке: исключение', { message: err?.message })
            logger.error('TelegramAuth', 'Вход по кнопке: исключение', { message: err?.message }, err)
            setError(err?.message || i18n.t('app.telegramSignInError'))
        } finally {
            setTelegramSignInLoading(false)
        }
    }, [auth, setCurrentUser, setView, setError, setTelegramOpenModal])

    const handleTelegramWidgetAuth = useCallback(
        async (user) => {
            if (!auth || !user) return
            setTelegramSignInLoading(true)
            setError('')
            const base = (import.meta.env?.VITE_API_BASE_URL || '').toString()
            try {
                tmaLog('info', 'widget_request', 'Login Widget: отправка данных на сервер', { userId: user?.id })
                logger.info('TelegramAuth', 'Login Widget: отправка данных на сервер', { userId: user.id })
                const res = await fetch(`${base}/api/telegram/auth-widget`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(user),
                })
                const data = await res.json().catch(e => { console.error("API JSON Parse Error:", e); return {}; })
                if (data.success && data.customToken) {
                    tmaLog('info', 'widget_success', 'Login Widget: успешная загрузка', { status: res.status })
                    logger.info('TelegramAuth', 'Login Widget: успех', {})
                    if (data.sessionToken && typeof localStorage !== 'undefined') {
                        localStorage.setItem('tma_session_token', data.sessionToken)
                        if (data.sessionTokenExpiresAt) localStorage.setItem('tma_session_expires', String(data.sessionTokenExpiresAt))
                    }
                    const cred = await signInWithCustomToken(auth, data.customToken)
                    const userData = await loadUserData(cred.user.uid)
                    if (userData) {
                        const currentUserData = { ...userData, id: cred.user.uid, role: userData.role || 'user' }
                        setCurrentUser(currentUserData)
                        setView(currentUserData.role === 'admin' ? 'admin' : 'dashboard')
                        logger.info('TelegramAuth', 'Login Widget: вход успешен, переход в ЛК', { uid: cred.user.uid })
                    }
                } else {
                    tmaLog('warn', 'widget_error', 'Login Widget: ошибка от сервера', { error: data.error })
                    logger.warn('TelegramAuth', 'Login Widget: ошибка', { error: data.error })
                    setError(data.error || i18n.t('app.telegramSignInFailed'))
                }
            } catch (err) {
                tmaLog('error', 'widget_exception', 'Login Widget: исключение', { message: err?.message })
                logger.error('TelegramAuth', 'Login Widget: исключение', { message: err?.message }, err)
                setError(err?.message || i18n.t('app.telegramSignInError'))
            } finally {
                setTelegramSignInLoading(false)
            }
        },
        [auth, loadUserData, setView, setCurrentUser, setError]
    )

    useEffect(() => {
        if (!auth || firebaseUser || authChecking || typeof window === 'undefined') return
        if (!isBrowserAuthPath()) return
        const params = new URLSearchParams(window.location.search)
        const id = params.get('id')
        const hash = params.get('hash')
        if (!id || !hash) return
        const auth_date = params.get('auth_date')
        const first_name = params.get('first_name') || ''
        const last_name = params.get('last_name') || ''
        const username = params.get('username') || ''
        const photo_url = params.get('photo_url') || ''
        const widgetUser = { id, hash, auth_date, first_name, last_name, username, photo_url }
        tmaLog('info', 'widget_redirect', 'Возврат из Telegram по URL (виджет редирект), завершаем вход', { userId: id })
        logger.info('TelegramAuth', 'Возврат из Telegram по URL (виджет редирект), завершаем вход', { userId: id })
        window.history.replaceState(null, '', window.location.pathname + (window.location.hash || ''))
        handleTelegramWidgetAuth(widgetUser)
    }, [auth, firebaseUser, authChecking, handleTelegramWidgetAuth])

    return {
        telegramSignInLoading,
        hasTmaInitData,
        tmaWaitingAuth,
        tmaInitDataFromCheck,
        isTelegramApp,
        tmaUserFromAuthRef,
        handleTelegramSignIn,
        handleTelegramWidgetAuth
    }
}
