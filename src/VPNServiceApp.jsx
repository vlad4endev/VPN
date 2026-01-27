import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react'
import { collection, getDocs, addDoc, doc, setDoc, getDoc } from 'firebase/firestore'
import { useFirebase } from './shared/hooks/useFirebase.js'
import LoggerPanel from './shared/components/LoggerPanel.jsx'
import ConfigErrorScreen from './shared/components/ConfigErrorScreen.jsx'
import LandingPage from './shared/components/LandingPage.jsx'

// Lazy loading для code splitting
const LoginForm = lazy(() => import('./features/auth/components/LoginForm.jsx'))
const Dashboard = lazy(() => import('./features/dashboard/components/Dashboard.jsx'))
const AdminPanel = lazy(() => import('./features/admin/components/AdminPanel.jsx'))
const FinancesDashboard = lazy(() => import('./features/admin/components/FinancesDashboard.jsx'))
import { AdminProviderWrapper } from './features/admin/components/AdminProvider.jsx'
import { APP_ID } from './shared/constants/app.js'
import { formatTraffic } from './shared/utils/formatTraffic.js'
import { useAuth } from './features/auth/hooks/useAuth.js'
import { useDashboard } from './features/dashboard/hooks/useDashboard.js'
import { useAdmin } from './features/admin/hooks/useAdmin.js'
import { useAppState } from './shared/hooks/useAppState.js'
import { useView } from './shared/hooks/useView.js'
import KeyModal from './shared/components/KeyModal.jsx'
import Sidebar from './shared/components/Sidebar.jsx'
import { formatDate } from './shared/utils/formatDate.js'
import { copyToClipboard } from './shared/utils/copyToClipboard.js'
import logger from './shared/utils/logger.js'
import { canAccessAdmin, canAccessFinances } from './shared/constants/admin.js'
import { stripUndefinedForFirestore } from './shared/utils/firestoreSafe.js'

// Firebase инициализация вынесена в src/lib/firebase/config.js
// Используется через хук useFirebase из src/shared/hooks/useFirebase.js

// Утилиты вынесены в отдельные модули:
// - getUserStatus: src/shared/utils/userStatus.js
// - formatTraffic: src/shared/utils/formatTraffic.js
// - validateEmail: src/features/auth/utils/validateEmail.js
// - validatePassword: src/features/auth/utils/validatePassword.js
// - validateName: src/shared/utils/validateName.js

// UI компоненты вынесены в отдельные файлы:
// - ConfigErrorScreen: src/shared/components/ConfigErrorScreen.jsx
// - LandingPage: src/shared/components/LandingPage.jsx
// - LoginForm: src/features/auth/components/LoginForm.jsx

// KeyModal вынесен в src/shared/components/KeyModal.jsx
// Sidebar вынесен в src/shared/components/Sidebar.jsx
// formatDate вынесен в src/shared/utils/formatDate.js
// copyToClipboard вынесен в src/shared/utils/copyToClipboard.js

export default function VPNServiceApp() {
  // Инициализация Firebase через хук
  const { app, auth, db, googleProvider, firebaseInitError, configError: firebaseConfigError, loading: firebaseLoading } = useFirebase()
  
  // Используем хуки для управления состоянием
  const appState = useAppState()
  const { users, currentUser, error, success, loading, setUsers, setCurrentUser, setError, setSuccess, setLoading } = appState
  
  // Используем хук для управления view
  const { view, setView } = useView({ currentUser })
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [showLogger, setShowLogger] = useState(false)

  // Используем хук авторизации
  const authHandlers = useAuth({
    onSuccess: (userData) => {
      // Callback при успешной авторизации (если нужен)
    },
    setCurrentUser,
    setView,
  })

  // Используем configError из useFirebase
  const configError = firebaseConfigError
  
  // Обновляем loading на основе firebaseLoading
  useEffect(() => {
    if (!firebaseLoading) {
      setLoading(false)
    }
  }, [firebaseLoading])

  // Загрузка тарифов (нужна для Dashboard и Admin)
  const [tariffs, setTariffs] = useState([])
  const loadTariffs = useCallback(async () => {
    if (!db) return

    try {
      const tariffsCollection = collection(db, `artifacts/${APP_ID}/public/data/tariffs`)
      const tariffsSnapshot = await getDocs(tariffsCollection)
      const tariffsList = []
      
      tariffsSnapshot.forEach((docSnapshot) => {
        tariffsList.push({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        })
      })
      
      setTariffs(tariffsList)
      logger.info('Dashboard', 'Тарифы загружены', { count: tariffsList.length })
    } catch (err) {
      logger.error('Dashboard', 'Ошибка загрузки тарифов', null, err)
      setError('Ошибка загрузки тарифов')
    }
  }, [db, setError])

  // Загрузка тарифов при открытии Dashboard
  useEffect(() => {
    if (view === 'dashboard' && currentUser && tariffs.length === 0) {
      loadTariffs()
    }
  }, [view, currentUser?.id, loadTariffs, tariffs.length])

  // Используем хук Dashboard
  const dashboardHandlers = useDashboard({
    currentUser,
    setCurrentUser,
    setUsers,
    tariffs,
    setError,
    setSuccess,
    onLogout: authHandlers.handleLogout,
  })

  // Используем хук Admin
  const adminHandlers = useAdmin({
    currentUser,
    users,
    setUsers,
    setCurrentUser,
    tariffs,
    setTariffs,
    setError,
    setSuccess,
  })

  // Функции теперь передаются через Context API (AdminProviderWrapper)
  // Удалены все промежуточные обертки: handleSaveUserCardForAdmin, guaranteedHandleSaveUserCard,
  // onHandleSaveUserCardForAdminPanel, finalOnHandleSaveUserCard, generateUUIDForAdmin
  
  // Отладочное логирование для проверки наличия функций
  useEffect(() => {
    if (adminHandlers) {
      const userRelatedKeys = Object.keys(adminHandlers).filter(k => 
        k.includes('User') || k.includes('UUID') || k.includes('Card') || k.includes('Save')
      )
      console.log('🔍 VPNServiceApp: AdminHandlers проверка:', {
        hasHandleSaveUserCard: !!adminHandlers.handleSaveUserCard,
        hasGenerateUUID: !!adminHandlers.generateUUID,
        handleSaveUserCardType: typeof adminHandlers.handleSaveUserCard,
        generateUUIDType: typeof adminHandlers.generateUUID,
        userRelatedKeys,
        allKeys: Object.keys(adminHandlers),
        handleSaveUserCardValue: adminHandlers.handleSaveUserCard,
      })
      
      // Проверяем, что функции действительно есть
      if (!adminHandlers.handleSaveUserCard) {
        console.error('❌ VPNServiceApp: adminHandlers.handleSaveUserCard не определен!', {
          userRelatedKeys,
          allKeys: Object.keys(adminHandlers),
          adminHandlersValue: adminHandlers
        })
      } else {
        console.log('✅ VPNServiceApp: adminHandlers.handleSaveUserCard определен')
      }
      if (!adminHandlers.generateUUID) {
        console.error('❌ VPNServiceApp: adminHandlers.generateUUID не определен!', {
          userRelatedKeys,
          allKeys: Object.keys(adminHandlers)
        })
      } else {
        console.log('✅ VPNServiceApp: adminHandlers.generateUUID определен')
      }
    } else {
      console.warn('⚠️ VPNServiceApp: adminHandlers is null/undefined')
    }
  }, [adminHandlers])
  
  // Функции handleSaveUserCard и generateUUID теперь передаются через Context API (AdminProviderWrapper)
  // Все промежуточные обертки (safeHandleSaveUserCard, finalHandleSaveUserCard, etc.) удалены

  // Функции Admin вынесены в useAdmin hook
  // Используем adminHandlers.*

  // Синхронизация authMode с view (только при изменении view)
  useEffect(() => {
    if (view === 'login' && authHandlers.authMode !== 'login') {
      authHandlers.handleAuthModeLogin()
    } else if (view === 'register' && authHandlers.authMode !== 'register') {
      authHandlers.handleAuthModeRegister()
    }
  }, [view, authHandlers])

  // Загрузка данных при открытии админ-панели или раздела «Финансы»
  const adminPanelLoadedRef = useRef(false)
  const financesLoadedRef = useRef(false)
  useEffect(() => {
    if (view === 'admin' && canAccessAdmin(currentUser?.role)) {
      if (!adminPanelLoadedRef.current) {
        logger.info('Admin', 'Загрузка глобальных данных для админ-панели', { adminId: currentUser.id })
        adminHandlers.loadUsers()
        adminHandlers.loadSettings()
        adminHandlers.loadTariffs()
        adminPanelLoadedRef.current = true
      }
      financesLoadedRef.current = false
    } else if (view === 'finances' && canAccessFinances(currentUser?.role)) {
      if (!financesLoadedRef.current) {
        logger.info('Admin', 'Загрузка данных для раздела Финансы', { userId: currentUser.id })
        adminHandlers.loadUsers()
        financesLoadedRef.current = true
      }
      if (tariffs.length === 0) {
        loadTariffs()
      }
      adminPanelLoadedRef.current = false
    } else {
      adminPanelLoadedRef.current = false
      financesLoadedRef.current = false
    }
  }, [view, currentUser?.role, currentUser?.id, adminHandlers, loadTariffs, tariffs.length])

  // Обработчик копирования
  const handleCopy = useCallback(async (text) => {
    try {
      await copyToClipboard(text)
      setSuccess('Скопировано в буфер обмена')
      setTimeout(() => setSuccess(''), 2000)
    } catch (err) {
      setError('Ошибка копирования')
    }
  }, [setError, setSuccess])


  // Обработчики для полей ввода вынесены в useAuth hook
  // Используем authHandlers.*



  // Функции Dashboard вынесены в useDashboard hook
  // Используем dashboardHandlers.*

  // Старое определение Dashboard удалено - компонент вынесен наружу

  // Загрузка тарифов из Firestore
  // Загрузка тарифов из Firestore
  const loadTariffs = useCallback(async () => {
    if (!db) return

    try {
      const tariffsCollection = collection(db, `artifacts/${APP_ID}/public/data/tariffs`)
      const tariffsSnapshot = await getDocs(tariffsCollection)
      const tariffsList = []
      
      tariffsSnapshot.forEach((docSnapshot) => {
        tariffsList.push({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        })
      })
      
      // Проверяем, есть ли уже тарифы SUPER или MULTI
      const existingSuperMulti = tariffsList.filter(t => {
        const plan = t.plan?.toLowerCase()
        const name = t.name?.toLowerCase()
        return (plan === 'super' || plan === 'multi') || (name === 'super' || name === 'multi')
      })
      
      // Если тарифов нет вообще, создаем по умолчанию (только SUPER и MULTI)
      if (tariffsList.length === 0) {
        const defaultTariffs = [
          { name: 'Super', plan: 'super', price: 150, devices: 1, trafficGB: 0, durationDays: 30, active: true },
          { name: 'MULTI', plan: 'multi', price: 250, devices: 5, trafficGB: 0, durationDays: 30, active: true },
        ]
        
        const createdTariffs = []
        for (const tariff of defaultTariffs) {
          try {
            const docRef = await addDoc(tariffsCollection, {
            ...tariff,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
            createdTariffs.push({ id: docRef.id, ...tariff })
          } catch (err) {
            logger.error('Tariffs', 'Ошибка создания тарифа', { tariff }, err)
          }
        }
        
        if (createdTariffs.length > 0) {
          setTariffs(createdTariffs)
          logger.info('Tariffs', 'Созданы тарифы по умолчанию', { count: createdTariffs.length })
        }
      } else {
        // Логируем все загруженные тарифы для отладки
        logger.debug('Tariffs', 'Все тарифы из базы', { 
          total: tariffsList.length, 
          tariffs: tariffsList.map(t => ({ id: t.id, name: t.name, plan: t.plan, active: t.active }))
        })
        
        // Фильтруем только тарифы SUPER и MULTI
        const filteredTariffs = tariffsList.filter(t => {
          const plan = t.plan?.toLowerCase()
          const name = t.name?.toLowerCase()
          return (plan === 'super' || plan === 'multi') || 
                 (name === 'super' || name === 'multi')
        })
        
        // Дедупликация: оставляем только по одному тарифу каждого типа (super и multi)
        const uniqueTariffs = []
        const seenPlans = new Set()
        
        for (const tariff of filteredTariffs) {
          const plan = tariff.plan?.toLowerCase()
          const name = tariff.name?.toLowerCase()
          let tariffType = null
          
          if (plan === 'super' || name === 'super') {
            tariffType = 'super'
          } else if (plan === 'multi' || name === 'multi') {
            tariffType = 'multi'
          }
          
          // Берем только первый активный тариф каждого типа
          if (tariffType && !seenPlans.has(tariffType) && tariff.active !== false) {
            seenPlans.add(tariffType)
            uniqueTariffs.push(tariff)
          }
        }
        
        // Если не нашли оба тарифа, создаем недостающие
        if (uniqueTariffs.length < 2) {
          const hasSuper = uniqueTariffs.some(t => {
            const plan = t.plan?.toLowerCase()
            const name = t.name?.toLowerCase()
            return plan === 'super' || name === 'super'
          })
          const hasMulti = uniqueTariffs.some(t => {
            const plan = t.plan?.toLowerCase()
            const name = t.name?.toLowerCase()
            return plan === 'multi' || name === 'multi'
          })
          
          if (!hasSuper) {
            try {
              const docRef = await addDoc(tariffsCollection, {
                name: 'Super',
                plan: 'super',
                price: 150,
                devices: 1,
                trafficGB: 0,
                durationDays: 30,
                active: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              })
              uniqueTariffs.push({ id: docRef.id, name: 'Super', plan: 'super', price: 150, devices: 1, trafficGB: 0, durationDays: 30, active: true })
            } catch (err) {
              logger.error('Tariffs', 'Ошибка создания тарифа Super', null, err)
            }
          }
          
          if (!hasMulti) {
            try {
              const docRef = await addDoc(tariffsCollection, {
                name: 'MULTI',
                plan: 'multi',
                price: 250,
                devices: 5,
                trafficGB: 0,
                durationDays: 30,
                active: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              })
              uniqueTariffs.push({ id: docRef.id, name: 'MULTI', plan: 'multi', price: 250, devices: 5, trafficGB: 0, durationDays: 30, active: true })
            } catch (err) {
              logger.error('Tariffs', 'Ошибка создания тарифа MULTI', null, err)
            }
          }
        }
        
        // Сортируем: сначала Super, потом MULTI
        uniqueTariffs.sort((a, b) => {
          const aPlan = a.plan?.toLowerCase() || a.name?.toLowerCase()
          const bPlan = b.plan?.toLowerCase() || b.name?.toLowerCase()
          if (aPlan === 'super') return -1
          if (bPlan === 'super') return 1
          return 0
        })
        
        setTariffs(uniqueTariffs)
        logger.info('Tariffs', 'Загружены тарифы (дедуплицированы)', { 
          count: uniqueTariffs.length,
          tariffs: uniqueTariffs.map(t => ({ id: t.id, name: t.name, plan: t.plan }))
        })
        
        // Если после фильтрации тарифов нет, но в базе они есть - просто показываем сообщение
        // Не создаем новые тарифы, чтобы избежать дублирования
        if (filteredTariffs.length === 0 && tariffsList.length > 0) {
          logger.warn('Tariffs', 'Тарифы в базе не соответствуют SUPER/MULTI', { 
            totalInDb: tariffsList.length 
          })
        }
      }
    } catch (err) {
      logger.error('Tariffs', 'Ошибка загрузки тарифов', null, err)
      setError('Ошибка загрузки тарифов')
    }
  }, [db])

  // Загрузка данных при открытии админ-панели
  // ВАЖНО: Используем useRef для отслеживания, чтобы не перезагружать данные при каждом рендере
  // Это предотвращает потерю локальных изменений серверов при перезагрузке из Firestore
  const adminPanelLoadedRef = useRef(false)
  useEffect(() => {
    // Двойная проверка: view === 'admin' И role === 'admin'
    if (view === 'admin' && currentUser?.role === 'admin') {
      // Загружаем данные только один раз при открытии админ-панели
      // Не перезагружаем при каждом изменении зависимостей, чтобы не потерять локальные изменения
      // Особенно важно для серверов, которые могут быть изменены локально (тесты, редактирование)
      if (!adminPanelLoadedRef.current) {
        logger.info('Admin', 'Загрузка глобальных данных для админ-панели', { adminId: currentUser.id })
        adminHandlers.loadUsers() // Загружаем всех пользователей (только для админа)
        adminHandlers.loadSettings() // Загружаем глобальные настройки (с объединением локальных серверов)
        adminHandlers.loadTariffs() // Загружаем глобальные тарифы
        adminPanelLoadedRef.current = true
      }
    } else {
      // Сбрасываем флаг при выходе из админ-панели
      adminPanelLoadedRef.current = false
    }
  }, [view, currentUser?.role, currentUser?.id, adminHandlers])

  // Мемоизированные обработчики для настроек
  /*
   * ПАТТЕРН ДЛЯ СОЗДАНИЯ ФОРМ БЕЗ ПРОБЛЕМ С ФОКУСИРОВКОЙ:
   * 
   * 1. ОБРАБОТЧИКИ onChange:
   *    - Всегда используйте функциональное обновление состояния:
   *      const handleFieldChange = useCallback((e) => {
   *        const newValue = e.target.value
   *        setState(prev => prev ? { ...prev, field: newValue } : null)
   *      }, [])
   * 
   * 2. ПОЛЯ ВВОДА:
   *    - Всегда добавляйте уникальный key проп:
   *      <input key={`entity-${entity.id}-field-name`} ... />
   *    - Для одиночных форм: key="form-field-name"
   *    - Для полей в списках: key={`entity-${entity.id}-field-name`}
   * 
   * 3. ЗАВИСИМОСТИ useEffect:
   *    - Используйте конкретные свойства вместо целых объектов:
   *      useEffect(() => {...}, [entity.id, entity.role]) // ✅ правильно
   *      useEffect(() => {...}, [entity]) // ❌ неправильно - вызовет лишние перерисовки
   * 
   * 4. МЕМОИЗАЦИЯ:
   *    - Используйте useCallback для обработчиков
   *    - Используйте useMemo для вычисляемых значений
   */
  const handleSettingsServerIPChange = useCallback((e) => {
    const newValue = e.target.value
    setSettings(prev => prev ? { ...prev, serverIP: newValue } : null)
  }, [])
  const handleSettingsServerPortChange = useCallback((e) => {
    const newValue = Number(e.target.value) || 443
    setSettings(prev => prev ? { ...prev, serverPort: newValue } : null)
  }, [])
  const handleSettingsXuiUsernameChange = useCallback((e) => {
    const newValue = e.target.value
    setSettings(prev => prev ? { ...prev, xuiUsername: newValue } : null)
  }, [])
  const handleSettingsXuiPasswordChange = useCallback((e) => {
    const newValue = e.target.value
    setSettings(prev => prev ? { ...prev, xuiPassword: newValue } : null)
  }, [])
  const handleSettingsXuiInboundIdChange = useCallback((e) => {
    const newValue = e.target.value
    setSettings(prev => prev ? { ...prev, xuiInboundId: newValue } : null)
  }, [])

  // Сохранение настроек
  // ВАЖНО: Только админы могут сохранять настройки. Настройки глобальные - применяются ко всем пользователям
  const handleSaveSettings = useCallback(async () => {
    // Проверка прав доступа
    if (!currentUser || currentUser.role !== 'admin') {
      setError('Недостаточно прав для сохранения настроек')
      logger.warn('Admin', 'Попытка сохранения настроек без прав администратора', { userId: currentUser?.id })
      return
    }

    if (!db || !settings) return

    try {
      logger.info('Admin', 'Сохранение глобальных настроек системы', { 
        adminId: currentUser.id,
        message: 'Настройки будут применены ко всем пользователям'
      })
      // Путь к настройкам: artifacts/skyputh/public/settings (4 сегмента - четное число)
      // ВАЖНО: Это глобальный документ, изменения применяются ко всем пользователям
      const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
      await setDoc(settingsDoc, stripUndefinedForFirestore({
        ...settings,
        servers: servers, // Сохраняем серверы вместе с настройками
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.id, // Сохраняем ID админа, который внес изменения
      }))
      logger.info('Admin', 'Глобальные настройки успешно сохранены', { 
        adminId: currentUser.id,
        message: 'Настройки применены ко всем пользователям системы'
      })
      setSuccess('Глобальные настройки сохранены и применены ко всем пользователям')
      setTimeout(() => setSuccess(''), 3000)
        } catch (err) {
      logger.error('Admin', 'Ошибка сохранения настроек', { adminId: currentUser.id }, err)
      setError('Ошибка сохранения настроек')
    }
  }, [db, settings, servers, currentUser?.id, currentUser?.role])

  // Стабильные обработчики для полей сервера (для предотвращения потери фокуса)
  // ВАЖНО: Используем функциональное обновление состояния напрямую, без промежуточных функций
  const handleServerNameChange = useCallback((e) => {
    const value = e.target.value
    setEditingServer(prev => prev ? { ...prev, name: value } : null)
  }, [])

  const handleServerIPChange = useCallback((e) => {
    const value = e.target.value
    setEditingServer(prev => prev ? { ...prev, serverIP: value } : null)
  }, [])

  const handleServerPortChange = useCallback((e) => {
    const value = Number(e.target.value) || 2053
    setEditingServer(prev => {
      if (!prev) return null
      // ВАЖНО: Сохраняем явно выбранный протокол пользователем
      // Автоматически определяем протокол по порту ТОЛЬКО если протокол не был явно установлен
      // Для порта 443 и 40919 используем https по умолчанию
      // Если протокол уже был явно выбран (не пустой и не undefined), сохраняем его
      const currentProtocol = prev.protocol
      const newProtocol = currentProtocol && currentProtocol !== '' ? currentProtocol : (value === 443 || value === 40919 ? 'https' : 'http')
      return { ...prev, serverPort: value, protocol: newProtocol }
    })
  }, [])

  const handleServerProtocolChange = useCallback((e) => {
    const value = e.target.value
    logger.debug('Admin', 'Изменение протокола сервера', { 
      newProtocol: value,
      serverId: editingServer?.id,
      serverName: editingServer?.name
    })
    setEditingServer(prev => {
      if (!prev) return null
      const updated = { ...prev, protocol: value }
      logger.debug('Admin', 'Протокол обновлен в editingServer', { 
        protocol: updated.protocol,
        serverId: updated.id
      })
      return updated
    })
  }, [editingServer?.id, editingServer?.name])

  const handleServerRandomPathChange = useCallback((e) => {
    const value = e.target.value
    setEditingServer(prev => prev ? { ...prev, randompath: value } : null)
  }, [])

  const handleServerRandomPathBlur = useCallback((e) => {
    // Обрезаем пробелы и добавляем / только при потере фокуса
    const value = e.target.value.trim()
    const cleanPath = value && !value.startsWith('/') ? '/' + value : value
    setEditingServer(prev => prev ? { ...prev, randompath: cleanPath } : null)
  }, [])

  const handleServerUsernameChange = useCallback((e) => {
    // ВАЖНО: Очищаем username от кавычек при вводе
    const value = e.target.value.replace(/^["']|["']$/g, '')
    setEditingServer(prev => prev ? { ...prev, xuiUsername: value } : null)
  }, [])

  const handleServerPasswordChange = useCallback((e) => {
    const value = e.target.value
    setEditingServer(prev => prev ? { ...prev, xuiPassword: value } : null)
  }, [])

  const handleServerInboundIdChange = useCallback((e) => {
    const value = e.target.value
    setEditingServer(prev => prev ? { ...prev, xuiInboundId: value } : null)
  }, [])

  const handleServerLocationChange = useCallback((e) => {
    const value = e.target.value
    setEditingServer(prev => prev ? { ...prev, location: value } : null)
  }, [])

  const handleServerActiveChange = useCallback((e) => {
    const value = e.target.checked
    setEditingServer(prev => prev ? { ...prev, active: value } : null)
  }, [])

  // Обработчик для чекбоксов тарифов (использует функциональное обновление)
  // ВАЖНО: Создаём обработчик, который не зависит от внешних переменных
  const handleServerTariffChange = useCallback((tariffId, checked) => {
    setEditingServer(prev => {
      if (!prev) return null
      const currentIds = prev.tariffIds || []
      const newIds = checked
        ? [...currentIds, tariffId]
        : currentIds.filter(id => id !== tariffId)
      return { ...prev, tariffIds: newIds }
    })
  }, [])

  const handleAddServer = useCallback(() => {
    // Генерируем стабильный ID для нового сервера один раз
    if (!newServerIdRef.current) {
      newServerIdRef.current = `new-server-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }
    const newServer = {
      id: newServerIdRef.current,
      name: '',
      serverIP: '',
      serverPort: 2053,
      protocol: 'http', // Протокол: 'http' или 'https'
      randompath: '',
      xuiUsername: '',
      xuiPassword: '',
      xuiInboundId: '',
      tariffIds: [], // Массив ID тарифов, к которым привязан сервер
      location: '', // Локация (например: 'NL', 'US', 'RU')
      active: true,
      sessionTested: false,
      sessionTestedAt: null,
    }
    setEditingServer(newServer)
  }, [])

  const handleSaveServer = useCallback(async () => {
    if (!editingServer) return
    
    // Проверка прав доступа
    if (!currentUser || currentUser.role !== 'admin') {
      setError('Недостаточно прав для сохранения сервера')
      logger.warn('Admin', 'Попытка сохранения сервера без прав администратора', { userId: currentUser?.id })
      return
    }

    // Обрезаем пробелы в текстовых полях перед сохранением
    // ВАЖНО: Сохраняем явно выбранный протокол пользователем
    // Определяем протокол автоматически ТОЛЬКО если он не был явно указан
    const explicitProtocol = editingServer.protocol && editingServer.protocol.trim() !== ''
    const protocol = explicitProtocol 
      ? editingServer.protocol.trim() 
      : (editingServer.serverPort === 443 || editingServer.serverPort === 40919 ? 'https' : 'http')
    
    logger.debug('Admin', 'Определение протокола при сохранении', { 
      explicitProtocol: explicitProtocol,
      editingServerProtocol: editingServer.protocol,
      serverPort: editingServer.serverPort,
      finalProtocol: protocol,
      serverId: editingServer.id,
      serverName: editingServer.name
    })
    
    // ВАЖНО: Очищаем username от кавычек, которые могут попасть при сохранении/чтении
    const cleanUsername = (editingServer.xuiUsername || '').trim().replace(/^["']|["']$/g, '')
    
    const cleanedServer = {
      ...editingServer,
      name: (editingServer.name || '').trim(),
      serverIP: (editingServer.serverIP || '').trim(),
      protocol: protocol, // Сохраняем явно выбранный или автоматически определенный протокол
      xuiUsername: cleanUsername, // Очищаем от кавычек
      xuiPassword: editingServer.xuiPassword || '', // Пароль не обрезаем, так как пробелы могут быть частью пароля
      xuiInboundId: (editingServer.xuiInboundId || '').trim(),
      location: (editingServer.location || '').trim(),
      randompath: (editingServer.randompath || '').trim(),
    }
    
    // Валидация
    if (!cleanedServer.name || !cleanedServer.serverIP || !cleanedServer.serverPort) {
      setError('Заполните обязательные поля: название, IP и порт')
        return
      }

    // Валидация дополнительных полей
    if (!cleanedServer.xuiUsername || !cleanedServer.xuiPassword || !cleanedServer.xuiInboundId) {
      setError('Заполните обязательные поля: имя пользователя, пароль и ID инбаунда')
          return
    }

    if (!db) {
      setError('База данных недоступна')
          return
    }

    try {
      // ВАЖНО: Сначала вычисляем обновленный список серверов СИНХРОННО
      // Используем текущее состояние servers напрямую
      const isUpdate = cleanedServer.id && servers.find(s => s.id === cleanedServer.id)
      let updatedServers = []
      
      if (isUpdate) {
        // Обновляем существующий сервер
        updatedServers = servers.map(s => s.id === cleanedServer.id ? cleanedServer : s)
        logger.debug('Admin', 'Обновление существующего сервера', { 
          serverId: cleanedServer.id,
          serverName: cleanedServer.name,
          prevCount: servers.length,
          updatedCount: updatedServers.length
        })
      } else {
        // Добавляем новый сервер
        updatedServers = [...servers, cleanedServer]
        logger.debug('Admin', 'Добавление нового сервера', { 
          serverId: cleanedServer.id,
          serverName: cleanedServer.name,
          prevCount: servers.length,
          updatedCount: updatedServers.length
        })
      }
      
      // Обновляем локальное состояние серверов
      setServers(updatedServers)
      
      // Сохраняем серверы в Firestore
      // ВАЖНО: Получаем актуальные настройки из состояния или создаем новые
      const currentSettings = settings || {
        serverIP: import.meta.env.VITE_XUI_HOST || 'http://localhost',
        serverPort: Number(import.meta.env.VITE_XUI_PORT) || 2053,
        xuiUsername: import.meta.env.VITE_XUI_USERNAME || '',
        xuiPassword: import.meta.env.VITE_XUI_PASSWORD || '',
        xuiInboundId: import.meta.env.VITE_XUI_INBOUND_ID || '',
        servers: [],
      }
      
      // Создаем обновленные настройки с новым списком серверов
      const updatedSettings = {
        ...currentSettings,
        servers: updatedServers, // Используем вычисленный список серверов
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.id,
      }
      
      // Обновляем локальное состояние настроек
      setSettings(updatedSettings)
      
      logger.info('Admin', 'Сохранение серверов в Firestore', { 
        adminId: currentUser.id,
        serverId: cleanedServer.id,
        serverName: cleanedServer.name,
        isUpdate: !!isUpdate,
        totalServers: updatedServers.length
      })
      
      const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
      await setDoc(settingsDoc, stripUndefinedForFirestore(updatedSettings), { merge: true }) // Используем merge, чтобы не перезаписать другие поля настроек
      
      logger.info('Admin', 'Сервер успешно сохранен в Firestore', { 
        adminId: currentUser.id,
        serverId: cleanedServer.id,
        serverName: cleanedServer.name,
        isUpdate: !!isUpdate
      })
      
      // ВАЖНО: После успешного сохранения закрываем форму и показываем сообщение об успехе
      // Сбрасываем ref для нового сервера при сохранении
      newServerIdRef.current = null
      setEditingServer(null)
      setSuccess('Сервер сохранен')
      setTimeout(() => setSuccess(''), 2000)
    } catch (err) {
      logger.error('Admin', 'Ошибка сохранения сервера в Firestore', { 
        adminId: currentUser.id,
        serverId: cleanedServer.id 
      }, err)
      setError('Ошибка сохранения сервера: ' + (err.message || 'Неизвестная ошибка'))
    }
  }, [editingServer, currentUser, db, settings, servers])

  const handleDeleteServer = useCallback(async (serverId) => {
    // Проверка прав доступа
    if (!currentUser || currentUser.role !== 'admin') {
      setError('Недостаточно прав для удаления сервера')
      logger.warn('Admin', 'Попытка удаления сервера без прав администратора', { userId: currentUser?.id })
      return
    }

    if (!window.confirm('Вы уверены, что хотите удалить этот сервер?')) {
      return
    }

    if (!db) {
      setError('База данных недоступна')
      return
    }

    try {
      // Удаляем сервер из локального состояния
      const updatedServers = servers.filter(s => s.id !== serverId)
      setServers(updatedServers)
      
      // ВАЖНО: Получаем актуальные настройки из состояния или создаем новые
      // Используем текущее состояние settings, если оно есть
      const currentSettings = settings || {
        serverIP: import.meta.env.VITE_XUI_HOST || 'http://localhost',
        serverPort: Number(import.meta.env.VITE_XUI_PORT) || 2053,
        xuiUsername: import.meta.env.VITE_XUI_USERNAME || '',
        xuiPassword: import.meta.env.VITE_XUI_PASSWORD || '',
        xuiInboundId: import.meta.env.VITE_XUI_INBOUND_ID || '',
        servers: [],
      }
      
      // Создаем обновленные настройки с новым списком серверов
      const updatedSettings = {
        ...currentSettings,
        servers: updatedServers,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.id,
      }
      
      // Обновляем локальное состояние
      setSettings(updatedSettings)
      
      // Сохраняем обновленный список серверов в Firestore
      logger.info('Admin', 'Удаление сервера из Firestore', { 
        adminId: currentUser.id,
        serverId: serverId,
        remainingServers: updatedServers.length
      })
      
      const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
      await setDoc(settingsDoc, stripUndefinedForFirestore(updatedSettings), { merge: true }) // Используем merge, чтобы не перезаписать другие поля настроек
      
      logger.info('Admin', 'Сервер успешно удален из Firestore', { 
        adminId: currentUser.id,
        serverId: serverId
      })
      
      setSuccess('Сервер удален')
      setTimeout(() => setSuccess(''), 2000)
    } catch (err) {
      logger.error('Admin', 'Ошибка удаления сервера из Firestore', { 
        adminId: currentUser.id,
        serverId: serverId 
      }, err)
      setError('Ошибка удаления сервера: ' + (err.message || 'Неизвестная ошибка'))
      // Восстанавливаем сервер в локальном состоянии при ошибке
      setServers(servers)
    }
  }, [servers, currentUser, db, settings])

  // Тестирование сессии 3x-ui
  // ВАЖНО: Добавляем servers в зависимости, чтобы иметь доступ к актуальному состоянию
  const handleTestServerSession = useCallback(async (server) => {
    if (!server || !server.id) return
    
    setTestingServerId(server.id)
    setError('')
    setSuccess('')

    // ВАЖНО: Получаем актуальный объект сервера из состояния servers
    // Используем актуальное состояние, переданное через замыкание
    const currentServer = servers.find(s => s.id === server.id) || server
    
    // ВАЖНО: Логируем источник данных для диагностики
    logger.info('Admin', '🔍 Получение актуального объекта сервера', {
      serverId: server.id,
      serverName: server.name,
      fromState: currentServer !== server,
      currentServerHasXuiUsername: !!currentServer.xuiUsername,
      currentServerHasXuiPassword: !!currentServer.xuiPassword,
      currentServerXuiUsernameLength: currentServer.xuiUsername ? currentServer.xuiUsername.length : 0,
      currentServerXuiPasswordLength: currentServer.xuiPassword ? currentServer.xuiPassword.length : 0,
      passedServerHasXuiUsername: !!server.xuiUsername,
      passedServerHasXuiPassword: !!server.xuiPassword,
      passedServerXuiUsernameLength: server.xuiUsername ? server.xuiUsername.length : 0,
      passedServerXuiPasswordLength: server.xuiPassword ? server.xuiPassword.length : 0,
      serversCount: servers.length,
      note: 'Используется актуальный объект из состояния servers'
    })

    // ВАЖНО: Определяем переменные вне блока try, чтобы они были доступны в catch
    // Формируем URL для входа: http://ipserver:port/randompath/login
    // Используем явно указанный протокол или определяем по порту (443 и 40919 = https)
    const protocol = currentServer.protocol || (currentServer.serverPort === 443 || currentServer.serverPort === 40919 ? 'https' : 'http')
    // Нормализуем randompath: убираем начальный и конечный слэши, затем добавляем один в начале
    const normalizedPath = currentServer.randompath 
      ? `/${currentServer.randompath.replace(/^\/+|\/+$/g, '')}` 
      : ''
    // Формируем baseURL и loginURL, избегая двойных слэшей
    // Убираем завершающие слэши из baseURL перед добавлением /login
    const baseURL = `${protocol}://${currentServer.serverIP}:${currentServer.serverPort}${normalizedPath}`.replace(/\/+$/, '')
    // Формируем loginURL с одним слэшем перед login (без слэша в конце)
    const loginURL = `${baseURL}/login`

    try {
      // ВАЖНО: Получаем username и password из АКТУАЛЬНОГО объекта server
      // Используем поля xuiUsername и xuiPassword из формы сервера
      // ВАЖНО: Берем актуальные значения из currentServer, а не из переданного server
      // ВАЖНО: Очищаем username от кавычек, которые могут попасть при сохранении/чтении
      const username = (currentServer.xuiUsername || '').trim().replace(/^["']|["']$/g, '')
      const password = currentServer.xuiPassword || '' // Пароль не обрезаем, пробелы могут быть частью пароля
      
      // Детальное логирование для диагностики (БЕЗ паролей и username)
      logger.info('Admin', '🔍 Получение данных сессии 3x-ui - проверка credentials', { 
        serverId: server.id, 
        serverName: server.name,
        hasXuiUsername: !!server.xuiUsername,
        hasXuiPassword: !!server.xuiPassword,
        usernameLength: username.length,
        usernamePreview: username ? `${username.substring(0, 2)}***` : 'empty',
        passwordLength: password.length,
        // НИКОГДА не логируем пароль и username полностью!
        passwordRawLength: server.xuiPassword ? server.xuiPassword.length : 0,
        allServerFields: Object.keys(server).filter(k => 
          k.toLowerCase().includes('user') || 
          k.toLowerCase().includes('pass') || 
          k.toLowerCase().includes('xui') ||
          k.toLowerCase().includes('credential')
        ),
        serverObject: {
          id: server.id,
          name: server.name,
          xuiUsername: server.xuiUsername ? `"${server.xuiUsername}"` : 'НЕ УСТАНОВЛЕН',
          xuiPassword: server.xuiPassword ? `длина ${server.xuiPassword.length}` : 'НЕ УСТАНОВЛЕН',
        },
        note: 'Используются server.xuiUsername и server.xuiPassword из формы сервера'
      })
      
      // Проверка наличия credentials
      if (!username || !password) {
        const missingFields = []
        if (!username) missingFields.push('Username')
        if (!password) missingFields.push('Password')
        
        const errorMsg = `Отсутствуют обязательные поля для авторизации: ${missingFields.join(', ')}\n\n` +
          `Проверьте настройки сервера "${server.name}":\n` +
          `- Username: ${username ? 'установлен' : 'НЕ УСТАНОВЛЕН'}\n` +
          `- Password: ${password ? 'установлен' : 'НЕ УСТАНОВЛЕН'}\n\n` +
          `Заполните поля Username и Password в форме редактирования сервера.`
        
        logger.error('Admin', 'Отсутствуют credentials для тестирования сессии', {
          serverId: server.id,
          serverName: server.name,
          missingFields,
          serverFields: Object.keys(server)
        })
        
        throw new Error(errorMsg)
      }
      
      logger.debug('Admin', 'Сформированный URL для тестирования', { 
        loginURL, 
        baseURL,
        normalizedPath,
        originalRandompath: server.randompath,
        protocol: protocol,
        serverProtocol: server.protocol,
        serverPort: server.serverPort
      })
      
      logger.info('Admin', '📤 Отправка запроса на получение данных', { 
        loginURL, 
        baseURL, 
        protocol,
        username: `${username.substring(0, Math.min(3, username.length))}***`,
        usernameFull: username, // ВАЖНО: Логируем полный username для диагностики
        usernameLength: username.length,
        hasPassword: !!password,
        passwordLength: password.length,
        source: 'server.xuiUsername и server.xuiPassword из формы сервера',
        serverId: server.id,
        serverName: server.name
      })

      // Авторизация через POST с JSON телом согласно документации 3x-ui
      // ВАЖНО: Используем прокси для обхода CORS проблем
      // Формат: -H "Content-Type: application/json" -d '{"username":"","password":""}'
      // ВАЖНО: Используем username и password из объекта server (поля xuiUsername и xuiPassword)
      // ВАЖНО: Передаем значения как есть, без дополнительной обработки
      const requestPayload = {
        serverIP: server.serverIP,
        serverPort: server.serverPort,
        protocol: protocol,
        randompath: server.randompath || '',
        username: username, // Используем полученные значения из server.xuiUsername
        password: password, // Используем полученные значения из server.xuiPassword
      }
      
      // Логируем payload для диагностики (БЕЗ пароля и username)
      logger.debug('Admin', '📤 Payload запроса на получение данных', {
        serverId: server.id,
        serverName: server.name,
        serverIP: requestPayload.serverIP,
        serverPort: requestPayload.serverPort,
        protocol: requestPayload.protocol,
        randompath: requestPayload.randompath,
        hasUsername: !!username,
        usernameLength: username.length,
        hasPassword: !!password,
        passwordLength: password.length,
        // НИКОГДА не логируем пароль и username полностью!
      })
      
      const response = await axios.post('/api/test-session', requestPayload, {
        withCredentials: true,
        timeout: 10000, // 10 секунд таймаут
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      })

      // Проверяем успешность
      const data = response.data || {}
      
      // Извлекаем cookies из заголовков ответа
      // Cookies приходят в формате: ["3x-ui=...; Path=/; Expires=...; Max-Age=3600; HttpOnly; SameSite=Lax"]
      let sessionCookie = null
      const setCookieHeader = response.headers['set-cookie'] || response.headers['Set-Cookie']
      
      if (setCookieHeader) {
        // set-cookie может быть массивом или строкой
        const cookieArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]
        
        // Ищем cookie с именем "3x-ui"
        for (const cookieString of cookieArray) {
          if (cookieString.includes('3x-ui=')) {
            // Извлекаем значение cookie (до первой точки с запятой)
            const cookieMatch = cookieString.match(/3x-ui=([^;]+)/)
            if (cookieMatch) {
              sessionCookie = cookieMatch[1]
              break
            }
          }
        }
        
        logger.info('Admin', '🍪 Cookies извлечены из ответа', {
          serverId: server.id,
          serverName: server.name,
          hasSetCookie: !!setCookieHeader,
          cookieCount: cookieArray.length,
          hasSessionCookie: !!sessionCookie,
          cookiePreview: sessionCookie ? `${sessionCookie.substring(0, 20)}...` : 'нет',
          allCookies: cookieArray
        })
      }
      
      // ВСЕГДА логируем полный ответ для диагностики (особенно важно при ошибках)
      // Используем info уровень, чтобы видеть в консоли браузера
      logger.info('Admin', '📥 Ответ от API при получении данных', {
        serverId: server.id,
        serverName: server.name,
        success: data.success,
        msg: data.msg,
        message: data.message,
        code: data.code,
        error: data.error,
        fullResponse: JSON.stringify(data, null, 2),
        status: response.status,
        statusText: response.statusText,
        loginURL: loginURL,
        hasCookies: !!setCookieHeader,
        hasSessionCookie: !!sessionCookie,
        // ВАЖНО: Логируем только метаданные credentials (БЕЗ самих значений)
        credentialsUsed: {
          hasUsername: !!username,
          usernameLength: username.length,
          usernamePreview: username ? `${username.substring(0, 2)}***` : 'empty',
          hasPassword: !!password,
          passwordLength: password.length,
          source: 'server.xuiUsername и server.xuiPassword'
          // НИКОГДА не логируем пароль и username полностью!
        }
      })
      
      if (data.success === false || data.success === 0) {
        const errorMsg = data.msg || data.message || 'Ошибка авторизации'
        const errorMsgLower = errorMsg.toLowerCase()
        
        // ВАЖНО: Порядок проверок имеет значение!
        // Сначала проверяем ошибки credentials, потом 2FA
        // Сообщение "Invalid username or password or two-factor code" - это ошибка credentials,
        // а не 2FA, даже если содержит упоминание "two-factor"
        
        // 1. Проверяем ошибки авторизации (credentials) ПЕРВЫМИ
        const isInvalidCredentials = 
          errorMsgLower.includes('invalid username') || 
          errorMsgLower.includes('invalid password') ||
          (errorMsgLower.includes('invalid') && (errorMsgLower.includes('username') || errorMsgLower.includes('password'))) ||
          errorMsgLower.includes('неверн') ||
          errorMsgLower.includes('неправильн') ||
          errorMsgLower.includes('wrong username') ||
          errorMsgLower.includes('wrong password') ||
          errorMsgLower.includes('incorrect username') ||
          errorMsgLower.includes('incorrect password') ||
          response.status === 401
        
        // 2. Проверяем 2FA ТОЛЬКО если это НЕ ошибка credentials
        // И только если есть явные указания на 2FA (не просто упоминание в общем сообщении)
        const is2FAError = !isInvalidCredentials && (
          // Явные упоминания 2FA/MFA/TOTP БЕЗ упоминания username/password
          (errorMsgLower.includes('two-factor') && !errorMsgLower.includes('username') && !errorMsgLower.includes('password') && !errorMsgLower.includes('invalid')) ||
          (errorMsgLower.includes('2fa') && !errorMsgLower.includes('username') && !errorMsgLower.includes('password') && !errorMsgLower.includes('invalid') && (errorMsgLower.includes('required') || errorMsgLower.includes('code'))) ||
          (errorMsgLower.includes('mfa') && !errorMsgLower.includes('username') && !errorMsgLower.includes('password') && !errorMsgLower.includes('invalid')) ||
          (errorMsgLower.includes('totp') && !errorMsgLower.includes('username') && !errorMsgLower.includes('password') && !errorMsgLower.includes('invalid')) ||
          (errorMsgLower.includes('telegram auth') && !errorMsgLower.includes('username') && !errorMsgLower.includes('password')) ||
          (errorMsgLower.includes('authenticator') && !errorMsgLower.includes('username') && !errorMsgLower.includes('password')) ||
          (errorMsgLower.includes('двухфакторн') && !errorMsgLower.includes('логин') && !errorMsgLower.includes('парол') && !errorMsgLower.includes('неверн')) ||
          // Коды ошибок (явные)
          data.code === '2FA_REQUIRED' ||
          data.error === '2FA_REQUIRED' ||
          data.code === 'TWO_FACTOR_REQUIRED' ||
          data.code === 'MFA_REQUIRED' ||
          data.code === 'TOTP_REQUIRED' ||
          // HTTP статус 402 (специфично для 2FA)
          response.status === 402 ||
          // Проверка по структуре ответа (некоторые API возвращают объект с 2FA данными)
          (data.obj && (data.obj.totp || data.obj.mfa || data.obj.twoFactor))
        )
        
        if (is2FAError) {
          logger.error('Admin', '🚫 2FA ВКЛЮЧЕН - API login заблокирован', { 
            serverId: server.id, 
            serverName: server.name,
            originalMessage: errorMsg,
            responseStatus: response.status,
            responseData: JSON.stringify(data, null, 2),
            detectedBy: '2fa_detection',
            note: 'Если 2FA включен в панели 3x-ui, API login не работает. Нужен backend с session store.'
          })
          throw new Error(
            '🚫 Двухфакторная аутентификация (2FA) ВКЛЮЧЕНА в панели 3x-ui\n\n' +
            '⚠️ КРИТИЧЕСКАЯ ПРОБЛЕМА:\n' +
            'При включенном 2FA API login НЕ РАБОТАЕТ через прямой запрос из браузера!\n\n' +
            '📋 ЧТО ПРОВЕРИТЬ В ПАНЕЛИ 3x-ui:\n' +
            '   1. Зайдите в панель: ' + loginURL + '\n' +
            '   2. Settings → Security\n' +
            '   3. Проверьте и отключите:\n' +
            '      • TOTP (Time-based One-Time Password)\n' +
            '      • Telegram auth\n' +
            '      • MFA (Multi-Factor Authentication)\n\n' +
            '✅ РЕШЕНИЯ:\n\n' +
            '1️⃣ ОТКЛЮЧИТЬ 2FA (для тестирования):\n' +
            '   • Settings → Security → Отключите все методы 2FA\n' +
            '   ⚠️ Не рекомендуется для production!\n\n' +
            '2️⃣ ИСПОЛЬЗОВАТЬ BACKEND ПРОКСИ (рекомендуется):\n' +
            '   • Browser → Your Backend (session store) → 3x-ui\n' +
            '   • Backend обрабатывает 2FA и хранит сессию\n' +
            '   • Используйте: server/proxy-server.js\n' +
            '   • См. документацию: PRODUCTION_SETUP.md\n\n' +
            `📊 Детали ошибки:\n` +
            `   Сервер: ${server.name}\n` +
            `   URL: ${loginURL}\n` +
            `   Оригинальное сообщение: ${errorMsg}\n` +
            `   Статус: ${response.status}\n\n` +
            `📚 Подробнее: см. 2FA_ARCHITECTURE.md`
          )
        }
        
        // Проверяем ошибки авторизации (credentials)
        // ВАЖНО: Проверяем ПОСЛЕ проверки 2FA, так как сообщение может содержать оба упоминания
        // Например: "Invalid username or password or two-factor code" - это ошибка credentials, а не 2FA
        // Но если 2FA не обнаружена, то это скорее всего ошибка credentials
        if (isInvalidCredentials) {
          // ВАЖНО: Используем username и password из объекта server (поля xuiUsername и xuiPassword)
          // Эти значения берутся из формы редактирования сервера
          const serverUsername = server.xuiUsername || ''
          const serverPassword = server.xuiPassword || ''
          
          logger.warn('Admin', 'Неверные учетные данные', { 
            serverId: server.id, 
            serverName: server.name,
            username: serverUsername ? `${serverUsername.substring(0, Math.min(3, serverUsername.length))}***` : 'не указан',
            usernameLength: serverUsername.length,
            hasPassword: !!serverPassword,
            passwordLength: serverPassword.length,
            originalMessage: data.msg || data.message,
            responseStatus: response.status,
            loginURL: loginURL,
            note: 'Проверьте правильность Username и Password в настройках сервера'
          })
          
          throw new Error(
            'Неверные учетные данные.\n\n' +
            'Проверьте правильность Username и Password в настройках сервера:\n\n' +
            `📋 Сервер: ${server.name}\n` +
            `🔑 Username: ${serverUsername || 'НЕ УСТАНОВЛЕН'}\n` +
            `🔐 Password: ${serverPassword ? '***' : 'НЕ УСТАНОВЛЕН'}\n` +
            `📏 Длина username: ${serverUsername.length} символов\n` +
            `📏 Длина password: ${serverPassword.length} символов\n\n` +
            `🌐 URL: ${loginURL}\n\n` +
            `💡 Совет: Проверьте настройки сервера "${server.name}" и убедитесь, что:\n` +
            `   • Username точно совпадает с логином в панели 3x-ui\n` +
            `   • Password точно совпадает с паролем в панели 3x-ui\n` +
            `   • Нет лишних пробелов в начале или конце\n` +
            `   • Правильная раскладка клавиатуры (не переключена на другую)`
          )
        }
        
        // Общая ошибка с детальной информацией
        const detailedError = data.msg || data.message || 'Неизвестная ошибка авторизации'
        throw new Error(
          `${detailedError}\n\n` +
          `Сервер: ${server.name}\n` +
          `URL: ${loginURL}\n` +
          `Статус: ${response.status}`
        )
      }

      // Обновляем сервер с информацией об успешном получении данных и cookies
      // ВАЖНО: Сохраняем cookies для дальнейшего использования в запросах к 3x-ui API
      const updatedServerData = {
        sessionTested: true,
        sessionTestedAt: new Date().toISOString(),
        sessionError: null,
        sessionCookie: sessionCookie || null, // Сохраняем cookie для использования в запросах
        sessionCookieReceivedAt: sessionCookie ? new Date().toISOString() : null,
      }
      
      setServers(prevServers => {
        const serverIndex = prevServers.findIndex(s => s.id === server.id)
        if (serverIndex === -1) {
          // Сервер не найден - не обновляем, просто возвращаем текущий массив
          logger.warn('Admin', 'Сервер не найден при обновлении после успешного получения данных', { serverId: server.id })
          return prevServers
        }
        
        const updatedServer = {
          ...prevServers[serverIndex],
          ...updatedServerData,
        }
        
        const newServers = [...prevServers]
        newServers[serverIndex] = updatedServer
        return newServers
      })
      
      // Сохраняем обновленные данные сервера в Firestore
      try {
        setSettings(prevSettings => {
          if (!prevSettings) return prevSettings
          
          const updatedSettings = { ...prevSettings }
          const serverIndex = (updatedSettings.servers || []).findIndex(s => s.id === server.id)
          
          if (serverIndex !== -1) {
            updatedSettings.servers = [...updatedSettings.servers]
            updatedSettings.servers[serverIndex] = {
              ...updatedSettings.servers[serverIndex],
              ...updatedServerData,
            }
            updatedSettings.updatedAt = new Date().toISOString()
            updatedSettings.updatedBy = currentUser?.id || 'system'
            
            // Сохраняем в Firestore асинхронно
            if (db && currentUser?.id) {
              import('firebase/firestore').then(({ doc, setDoc }) => {
                const settingsDoc = doc(db, `artifacts/${APP_ID}/public/data/settings_v4`, currentUser.id)
                
                setDoc(settingsDoc, stripUndefinedForFirestore(updatedSettings), { merge: true }).then(() => {
                  logger.info('Admin', '✅ Данные сервера сохранены в Firestore (с cookies)', {
                    serverId: server.id,
                    serverName: server.name,
                    hasSessionCookie: !!sessionCookie
                  })
                }).catch(err => {
                  logger.error('Admin', 'Ошибка сохранения данных сервера в Firestore', null, err)
                })
              }).catch(err => {
                logger.error('Admin', 'Ошибка импорта firebase/firestore', null, err)
              })
            }
          }
          
          return updatedSettings
        })
      } catch (saveError) {
        logger.error('Admin', 'Ошибка при сохранении данных сервера', null, saveError)
        // Не прерываем выполнение, так как локальное состояние уже обновлено
      }
      
      logger.info('Admin', '✅ Данные успешно получены и сохранены', { 
        serverId: server.id,
        hasSessionCookie: !!sessionCookie,
        cookiePreview: sessionCookie ? `${sessionCookie.substring(0, 20)}...` : 'нет'
      })
      setSuccess(`Данные успешно получены для сервера "${server.name}"${sessionCookie ? ' (сессия сохранена)' : ''}`)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      // Детальное логирование ошибки для диагностики
      const errorDetails = {
        serverId: server.id,
        serverName: server.name,
        error: err.message,
        responseStatus: err.response?.status,
        responseData: err.response?.data,
        loginURL: loginURL,
        serverIP: server.serverIP,
        serverPort: server.serverPort,
        protocol: protocol,
        randompath: server.randompath,
        hasUsername: !!server.xuiUsername,
        hasPassword: !!server.xuiPassword
      }
      
      logger.error('Admin', 'Ошибка тестирования сессии', errorDetails, err)
      
      // ВАЖНО: Обновляем сервер с информацией об ошибке используя функциональное обновление
      // Сервер НЕ должен удаляться при ошибке - только обновляется статус теста
      setServers(prevServers => {
        logger.debug('Admin', 'Обновление сервера после ошибки теста', { 
          serverId: server.id,
          serverName: server.name,
          prevServersCount: prevServers?.length || 0,
          prevServersIds: prevServers?.map(s => s.id) || []
        })
        
        // Проверяем, что массив серверов существует и не пустой
        if (!prevServers || prevServers.length === 0) {
          logger.error('Admin', 'Массив серверов пуст при обновлении после ошибки, восстанавливаем сервер', { serverId: server.id })
          // Если массив пуст, но сервер был - возвращаем его обратно
          const serverWithError = {
            ...server,
            sessionTested: false,
            sessionTestedAt: new Date().toISOString(),
            sessionError: err.response?.data?.msg || err.message || 'Ошибка подключения',
          }
          logger.info('Admin', 'Сервер восстановлен в пустом массиве', { serverId: server.id })
          return [serverWithError]
        }
        
        const serverIndex = prevServers.findIndex(s => s.id === server.id)
        if (serverIndex === -1) {
          // Сервер не найден - добавляем его обратно (он мог быть потерян)
          logger.warn('Admin', 'Сервер не найден при обновлении после ошибки теста, добавляем обратно', { 
            serverId: server.id,
            serverName: server.name,
            currentServersCount: prevServers.length,
            currentServerIds: prevServers.map(s => s.id)
          })
          // Добавляем сервер обратно с обновленной информацией об ошибке
          const serverWithError = {
            ...server,
            sessionTested: false,
            sessionTestedAt: new Date().toISOString(),
            sessionError: err.response?.data?.msg || err.message || 'Ошибка подключения',
          }
          const restoredServers = [...prevServers, serverWithError]
          logger.info('Admin', 'Сервер восстановлен в массиве', { 
            serverId: server.id,
            newServersCount: restoredServers.length
          })
          return restoredServers
        }
        
        // Сервер найден - обновляем только информацию о тесте
        const updatedServer = {
          ...prevServers[serverIndex],
          sessionTested: false,
          sessionTestedAt: new Date().toISOString(),
          sessionError: err.response?.data?.msg || err.message || 'Ошибка подключения',
        }
        
        // Создаем новый массив с обновленным сервером
        const newServers = [...prevServers]
        newServers[serverIndex] = updatedServer
        
        logger.info('Admin', 'Сервер обновлен после ошибки теста', { 
          serverId: server.id,
          serverName: server.name,
          serversCount: newServers.length,
          serverIndex,
          sessionError: updatedServer.sessionError
        })
        
        return newServers
      })
      
      // Если ошибка уже содержит детальное сообщение (например, 2FA или неверные credentials),
      // используем его напрямую, не перезаписывая общим обработчиком
      let errorMessage = err.message || 'Не удалось установить сессию'
      
      // Проверяем, является ли это уже обработанной ошибкой (2FA, credentials и т.д.)
      // Если сообщение содержит переносы строк и детальную информацию - используем как есть
      const isDetailedError = err.message?.includes('\n\n') || 
                             err.message?.includes('Требуется двухфакторная') ||
                             err.message?.includes('Неверные учетные данные')
      
      // Детальная обработка различных типов ошибок сети (только если это не детальная ошибка)
      if (!isDetailedError && (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error') || err.code === 'ERR_FAILED')) {
        // Проверяем, является ли это CORS ошибкой
        // CORS ошибки обычно имеют код ERR_NETWORK или ERR_FAILED без response и без конкретного сообщения об ошибке
        // Также проверяем, что это не таймаут и не отказ соединения
        const isCorsError = err.message?.includes('CORS') || 
                           err.message?.includes('Access-Control') ||
                           ((err.code === 'ERR_FAILED' || err.code === 'ERR_NETWORK') && !err.response && !err.message?.includes('timeout') && !err.message?.includes('ECONNREFUSED') && !err.message?.includes('ETIMEDOUT'))
        
        // Формируем детальное сообщение с информацией о сервере
        const serverInfo = `Сервер: ${server.serverIP}:${server.serverPort}${server.randompath ? server.randompath : ''}`
        const protocolInfo = `Протокол: ${protocol}`
        
        if (isCorsError) {
          errorMessage = `⚠️ Ошибка CORS при подключении к серверу.\n\n${serverInfo}\n${protocolInfo}\n\n`
          errorMessage += `Проблема: Браузер блокирует прямой запрос к внешнему серверу из-за политики CORS.\n`
          errorMessage += `Это нормально для прямых запросов из браузера к внешним серверам.\n\n`
          errorMessage += `Решения:\n`
          errorMessage += `1. Настроить CORS на сервере 3x-ui (в конфигурации панели):\n`
          errorMessage += `   - Добавить заголовок: Access-Control-Allow-Origin: *\n`
          errorMessage += `   - Или разрешить конкретный домен: Access-Control-Allow-Origin: http://localhost:5173\n`
          errorMessage += `   - Добавить: Access-Control-Allow-Methods: POST, GET, OPTIONS\n`
          errorMessage += `   - Добавить: Access-Control-Allow-Headers: Content-Type\n`
          errorMessage += `2. Использовать прокси-сервер (рекомендуется для продакшена)\n`
          errorMessage += `3. Проверить доступность сервера напрямую в браузере:\n`
          errorMessage += `   Откройте: ${loginURL}\n`
          errorMessage += `   Если страница открывается - сервер доступен, проблема только в CORS\n\n`
          errorMessage += `Примечание: Тестирование сессии работает только если сервер настроен на CORS или используется прокси.`
        } else {
          errorMessage = `Ошибка сети при подключении к серверу.\n\n${serverInfo}\n${protocolInfo}\n\nВозможные причины:\n`
          errorMessage += `• Сервер недоступен или не отвечает\n`
          errorMessage += `• Неправильный IP адрес или порт\n`
          errorMessage += `• Неправильный протокол (http/https)\n`
          errorMessage += `• Блокировка firewall или CORS политикой\n`
          errorMessage += `• Неправильный путь (randompath)\n`
          errorMessage += `• Таймаут подключения\n\n`
          errorMessage += `Проверьте:\n`
          errorMessage += `- Доступность сервера из браузера: ${loginURL}\n`
          errorMessage += `- Настройки CORS на сервере 3x-ui\n`
          errorMessage += `- Правильность всех параметров подключения`
        }
        
        logger.error('Admin', 'Ошибка сети при тестировании сессии', {
          serverId: server.id,
          serverName: server.name,
          loginURL,
          protocol,
          serverIP: server.serverIP,
          serverPort: server.serverPort,
          randompath: server.randompath,
          errorCode: err.code,
          errorMessage: err.message
        }, err)
      } else if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        errorMessage = `Соединение отклонено. Сервер ${server.serverIP}:${server.serverPort} недоступен или не запущен.`
      } else if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
        errorMessage = `Таймаут подключения. Сервер ${server.serverIP}:${server.serverPort} не отвечает в течение установленного времени.`
      } else if (err.code === 'ERR_CERT' || err.message?.includes('certificate')) {
        errorMessage = `Ошибка SSL сертификата. Проверьте настройки HTTPS для сервера ${server.serverIP}:${server.serverPort}`
      } else if (err.response?.status === 404) {
        errorMessage = `Панель недоступна (404). Проверьте:\n- IP адрес: ${server.serverIP}\n- Порт: ${server.serverPort}\n- Путь (randompath): ${server.randompath || '(не указан)'}\n- Полный URL: ${loginURL}`
      } else if (err.response?.status === 401 || err.response?.status === 403) {
        errorMessage = `Ошибка авторизации (${err.response.status}). Проверьте:\n- Username: ${server.xuiUsername}\n- Password: (проверьте правильность)`
      } else if (err.response?.status === 500) {
        errorMessage = `Ошибка сервера (500). Сервер 3x-ui вернул внутреннюю ошибку.`
      } else if (err.response?.status) {
        errorMessage = `Ошибка HTTP ${err.response.status}: ${err.response.statusText || 'Неизвестная ошибка'}`
      } else if (err.message) {
        errorMessage = `Ошибка: ${err.message}`
      }
      
      logger.error('Admin', 'Ошибка тестирования сессии', {
        serverId: server.id,
        serverName: server.name,
        errorCode: err.code,
        errorMessage: err.message,
        responseStatus: err.response?.status,
        loginURL
      }, err)
      
      setError(errorMessage)
      setTimeout(() => setError(''), 8000) // Увеличиваем время отображения для длинных сообщений
    } finally {
      setTestingServerId(null)
    }
  }, [servers, db, currentUser]) // ВАЖНО: servers в зависимостях для доступа к актуальному состоянию

  // Обновление пользователя
  const handleUpdateUser = useCallback(async (userId, updates) => {
    if (!db) return

    try {
      logger.info('Admin', 'Обновление пользователя', { userId, updates })
      const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, userId)
      await updateDoc(userDoc, {
        ...updates,
        updatedAt: new Date().toISOString(),
      })

      // Обновляем локальное состояние
      setUsers(users.map(u => u.id === userId ? { ...u, ...updates } : u))
      
      // Если обновляем текущего пользователя
      if (currentUser.id === userId) {
        setCurrentUser({ ...currentUser, ...updates })
      }

      // Если обновляем данные в 3x-ui (expiryTime, totalGB, limitIp)
      const user = users.find(u => u.id === userId)
      if (user && user.uuid && updates.expiresAt !== undefined) {
        const inboundId = settings?.xuiInboundId || import.meta.env.VITE_XUI_INBOUND_ID
        if (inboundId) {
          try {
            const expiryTime = updates.expiresAt ? new Date(updates.expiresAt).getTime() : 0
            await ThreeXUI.updateClient(inboundId, user.email, {
              expiryTime: expiryTime,
              totalGB: updates.trafficGB || user.trafficGB || 0,
              limitIp: updates.devices || user.devices || 0,
            })
            logger.info('Admin', 'Пользователь обновлен в 3x-ui', { email: user.email })
          } catch (xuiError) {
            logger.error('Admin', 'Ошибка обновления в 3x-ui', { email: user.email }, xuiError)
            // Не показываем ошибку, так как данные в Firestore уже обновлены
          }
        }
      }

      logger.info('Admin', 'Пользователь успешно обновлен', { userId })
      setSuccess('Пользователь обновлен')
      setEditingUser(null)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      logger.error('Admin', 'Ошибка обновления пользователя', { userId }, err)
      setError('Ошибка обновления пользователя')
    }
  }, [db, users, currentUser, settings])

  // Мемоизированные обработчики для полей тарифа
  const handleTariffNameChange = useCallback((e) => {
    // Не обрезаем пробелы при вводе, чтобы не мешать пользователю
    const newValue = e.target.value
    setEditingTariff(prev => prev ? { ...prev, name: newValue } : null)
  }, [])

  const handleTariffPlanChange = useCallback((e) => {
    // Не обрезаем пробелы при вводе, чтобы не мешать пользователю
    const newValue = e.target.value
    setEditingTariff(prev => prev ? { ...prev, plan: newValue } : null)
  }, [])

  const handleTariffPriceChange = useCallback((e) => {
    const newValue = Number(e.target.value) || 0
    setEditingTariff(prev => prev ? { ...prev, price: newValue } : null)
  }, [])

  const handleTariffDevicesChange = useCallback((e) => {
    const newValue = Number(e.target.value) || 1
    setEditingTariff(prev => prev ? { ...prev, devices: newValue } : null)
  }, [])

  const handleTariffTrafficGBChange = useCallback((e) => {
    const newValue = Number(e.target.value) || 0
    setEditingTariff(prev => prev ? { ...prev, trafficGB: newValue } : null)
  }, [])

  const handleTariffDurationDaysChange = useCallback((e) => {
    const newValue = Number(e.target.value) || 30
    setEditingTariff(prev => prev ? { ...prev, durationDays: newValue } : null)
  }, [])

  const handleTariffActiveChange = useCallback((e) => {
    const newValue = e.target.checked
    setEditingTariff(prev => prev ? { ...prev, active: newValue } : null)
  }, [])

  // Сохранение тарифа (только редактирование существующих SUPER и MULTI)
  const handleSaveTariff = useCallback(async (tariffData) => {
    if (!db) return

    // Проверяем, что это редактирование существующего тарифа SUPER или MULTI
    if (!editingTariff || !editingTariff.id || editingTariff.id.startsWith('default-')) {
      setError('Можно редактировать только существующие тарифы SUPER и MULTI')
      return
    }

    // Проверяем, что тариф - это SUPER или MULTI
    const plan = tariffData.plan?.toLowerCase()
    const name = tariffData.name?.toLowerCase()
    if (plan !== 'super' && plan !== 'multi' && name !== 'super' && name !== 'multi') {
      setError('Разрешены только тарифы SUPER и MULTI')
      return
    }

    try {
        const tariffDoc = doc(db, `artifacts/${APP_ID}/public/data/tariffs`, editingTariff.id)
        await updateDoc(tariffDoc, {
          ...tariffData,
          updatedAt: new Date().toISOString(),
        })
        setTariffs(tariffs.map(t => t.id === editingTariff.id ? { ...t, ...tariffData } : t))
      setSuccess('Тариф сохранен')
      setEditingTariff(null)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      logger.error('Admin', 'Ошибка сохранения тарифа', { tariffId: editingTariff?.id }, err)
      setError('Ошибка сохранения тарифа')
    }
  }, [db, tariffs, editingTariff])

  // Удаление тарифа (запрещено для SUPER и MULTI)
  const handleDeleteTariff = useCallback(async (tariffId) => {
    const tariff = tariffs.find(t => t.id === tariffId)
    if (!tariff) return

    // Проверяем, что это не SUPER или MULTI
    const plan = tariff.plan?.toLowerCase()
    const name = tariff.name?.toLowerCase()
    if (plan === 'super' || plan === 'multi' || name === 'super' || name === 'multi') {
      setError('Нельзя удалить тарифы SUPER и MULTI')
      setTimeout(() => setError(''), 3000)
      return
    }

    if (!db) return

    if (!window.confirm('Вы уверены, что хотите удалить этот тариф?')) {
      return
    }

    try {
      const tariffDoc = doc(db, `artifacts/${APP_ID}/public/data/tariffs`, tariffId)
      await deleteDoc(tariffDoc)
      setTariffs(tariffs.filter(t => t.id !== tariffId))
      setSuccess('Тариф удален')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      logger.error('Admin', 'Ошибка удаления тарифа', { tariffId }, err)
      setError('Ошибка удаления тарифа')
    }
  }, [db, tariffs])

  // Компонент Dashboard вынесен в отдельный файл src/components/Dashboard.jsx
  // Компонент AdminPanel вынесен в отдельный файл src/components/AdminPanel.jsx


  // Основной рендер
  // Если view === landing - показываем landing page даже при ошибках конфигурации
  // (ошибки конфигурации не критичны для показа landing page)
  if (view === 'landing' && !currentUser) {
    // Показываем предупреждение об ошибке, но не блокируем landing page
    if (configError) {
    return (
        <>
          <LandingPage onSetView={setView} />
          <div className="fixed bottom-4 right-4 max-w-md bg-red-900/90 border border-red-800 rounded-lg p-4 shadow-xl z-50">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-red-300 font-bold mb-2">Внимание: Ошибка конфигурации</h3>
                <p className="text-red-200 text-sm mb-2">
                  Firebase не настроен. Некоторые функции могут не работать.
                </p>
                <button
                  onClick={() => setView('login')}
                  className="text-xs text-red-300 hover:text-red-200 underline"
                >
                  Проверить конфигурацию
                </button>
              </div>
                          <button
                onClick={() => setConfigError(null)}
                className="text-red-400 hover:text-red-300"
                          >
                <X className="w-4 h-4" />
                          </button>
            </div>
          </div>
        </>
      )
    }
    return <LandingPage onSetView={setView} />
  }

  // Для других view показываем ошибку конфигурации
  if (configError) {
    return <ConfigErrorScreen configError={configError} />
  }

  // Если loading и пользователь авторизован - показываем загрузку
  if (loading && currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-slate-400">Загрузка...</p>
        </div>
      </div>
    )
  }

  // Если view === login или register
  if (view === 'login' || view === 'register') {
    return (
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>}>
      <LoginForm
          authMode={authHandlers.authMode}
          loginData={authHandlers.loginData}
          error={authHandlers.error || error}
          success={authHandlers.success || success}
          onEmailChange={authHandlers.handleEmailChange}
          onPasswordChange={authHandlers.handlePasswordChange}
          onNameChange={authHandlers.handleNameChange}
          onAuthModeLogin={authHandlers.handleAuthModeLogin}
          onAuthModeRegister={authHandlers.handleAuthModeRegister}
          onLogin={authHandlers.handleLogin}
          onRegister={authHandlers.handleRegister}
          onGoogleSignIn={authHandlers.handleGoogleSignIn}
          googleSignInLoading={authHandlers.googleSignInLoading}
        onSetView={setView}
      />
      </Suspense>
    )
  }

  // Раздел «Финансы» — для ролей Админ и Бухгалтер
  if (view === 'finances') {
    if (!currentUser || !canAccessFinances(currentUser.role)) {
      setView('dashboard')
      return null
    }
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden">
        <Sidebar
          currentUser={currentUser}
          view="finances"
          onSetView={setView}
          onLogout={authHandlers.handleLogout}
        />
        <div className="flex-1 w-full min-w-0 p-3 sm:p-4 md:p-6 lg:pl-0 pt-14 sm:pt-16 lg:pt-4 lg:pt-6 pb-24 lg:pb-6 overflow-y-auto">
          <div className="w-full max-w-[90rem] mx-auto">
            <Suspense fallback={<div className="flex items-center justify-center min-h-[320px]"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>}>
              <FinancesDashboard users={users} tariffs={tariffs} formatDate={formatDate} currentUser={currentUser} />
            </Suspense>
          </div>
        </div>
      </div>
    )
  }

  // Если пользователь в админ-панели (доступ только у роли admin)
  if (view === 'admin') {
    if (!currentUser || !canAccessAdmin(currentUser.role)) {
      logger.warn('Auth', 'Попытка доступа к админ-панели без прав администратора', { 
        userId: currentUser?.id, 
        role: currentUser?.role 
      })
      setView('dashboard')
      setError('Недостаточно прав для доступа к админ-панели')
      return null
    }
    
    return (
      <AdminProviderWrapper
        currentUser={currentUser}
        users={users}
        setUsers={setUsers}
        setCurrentUser={setCurrentUser}
        tariffs={tariffs}
        setTariffs={setTariffs}
        setError={setError}
        setSuccess={setSuccess}
      >
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>}>
          <AdminPanel
        currentUser={currentUser}
        adminTab={adminHandlers.adminTab}
        onSetAdminTab={adminHandlers.setAdminTab}
        onSetView={setView}
        onHandleLogout={authHandlers.handleLogout}
        users={users}
        editingUser={adminHandlers.editingUser}
        onSetEditingUser={adminHandlers.setEditingUser}
        onHandleUpdateUser={adminHandlers.handleUpdateUser}
        onHandleDeleteUser={adminHandlers.handleDeleteUser}
        onHandleCopy={handleCopy}
        servers={adminHandlers.servers}
        editingServer={adminHandlers.editingServer}
        onSetEditingServer={adminHandlers.setEditingServer}
        onHandleAddServer={adminHandlers.handleAddServer}
        onHandleSaveServer={adminHandlers.handleSaveServer}
        onHandleDeleteServer={adminHandlers.handleDeleteServer}
        onHandleTestServerSession={adminHandlers.handleTestServerSession}
        testingServerId={adminHandlers.testingServerId}
        newServerIdRef={null}
        settingsLoading={adminHandlers.settingsLoading}
        tariffs={tariffs}
        editingTariff={adminHandlers.editingTariff}
        onSetEditingTariff={adminHandlers.setEditingTariff}
        onHandleSaveTariff={adminHandlers.handleSaveTariff}
        onHandleDeleteTariff={adminHandlers.handleDeleteTariff}
        onHandleSaveSettings={adminHandlers.handleSaveSettings}
        formatDate={formatDate}
        showLogger={showLogger}
        onSetShowLogger={setShowLogger}
        success={authHandlers.success}
        error={authHandlers.error}
        onHandleServerNameChange={adminHandlers.handleServerNameChange}
        onHandleServerIPChange={adminHandlers.handleServerIPChange}
        onHandleServerPortChange={adminHandlers.handleServerPortChange}
        onHandleServerProtocolChange={adminHandlers.handleServerProtocolChange}
        onHandleServerRandomPathChange={adminHandlers.handleServerRandompathChange}
        onHandleServerRandomPathBlur={() => {}}
        onHandleServerUsernameChange={adminHandlers.handleServerXuiUsernameChange}
        onHandleServerPasswordChange={adminHandlers.handleServerXuiPasswordChange}
        onHandleServerInboundIdChange={adminHandlers.handleServerXuiInboundIdChange}
        onHandleServerLocationChange={adminHandlers.handleServerLocationChange}
        onHandleServerActiveChange={adminHandlers.handleServerActiveChange}
        onHandleServerTariffChange={adminHandlers.handleServerTariffChange}
        onHandleTariffNameChange={adminHandlers.handleTariffNameChange}
        onHandleTariffPlanChange={adminHandlers.handleTariffPlanChange}
        onHandleTariffPriceChange={adminHandlers.handleTariffPriceChange}
        onHandleTariffDevicesChange={adminHandlers.handleTariffDevicesChange}
        onHandleTariffTrafficGBChange={adminHandlers.handleTariffTrafficGBChange}
        onHandleTariffDurationDaysChange={adminHandlers.handleTariffDurationDaysChange}
        onHandleTariffActiveChange={adminHandlers.handleTariffActiveChange}
        onHandleTariffSubscriptionLinkChange={adminHandlers.handleTariffSubscriptionLinkChange}
        onHandleSaveUserCard={finalHandleSaveUserCard}
        onGenerateUUID={finalGenerateUUID}
        />
        </Suspense>
      </AdminProviderWrapper>
    )
  }

  // Личный кабинет пользователя
  // ВАЖНО: Полная изоляция данных - каждый пользователь видит только свои данные
  // Все запросы фильтруются по currentUser.id (userId)
  if (currentUser && (view === 'dashboard' || !view || view === 'landing')) {
    // Если пользователь админ, но view не 'admin' - показываем личный кабинет
    // Админы тоже имеют личный кабинет со своими данными
    return (
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>}>
      <Dashboard
        currentUser={currentUser}
        view={view}
        onSetView={setView}
        onLogout={authHandlers.handleLogout}
        tariffs={tariffs}
        loadTariffs={loadTariffs}
        dashboardTab={dashboardHandlers.dashboardTab}
        onSetDashboardTab={dashboardHandlers.setDashboardTab}
        editingProfile={dashboardHandlers.editingProfile}
        onSetEditingProfile={dashboardHandlers.setEditingProfile}
        profileData={dashboardHandlers.profileData}
        creatingSubscription={dashboardHandlers.creatingSubscription}
        onHandleCreateSubscription={dashboardHandlers.handleCreateSubscription}
        onHandleRenewSubscription={dashboardHandlers.handleRenewSubscription}
        onHandleUpdateProfile={dashboardHandlers.handleUpdateProfile}
        onHandleDeleteAccount={dashboardHandlers.handleDeleteAccount}
        onProfileNameChange={dashboardHandlers.handleProfileNameChange}
        onProfilePhoneChange={dashboardHandlers.handleProfilePhoneChange}
        payments={dashboardHandlers.payments}
        paymentsLoading={dashboardHandlers.paymentsLoading}
        loadPayments={dashboardHandlers.loadPayments}
        formatDate={formatDate}
        formatTraffic={formatTraffic}
        settings={adminHandlers.settings}
        onCopy={handleCopy}
        showKeyModal={showKeyModal}
        onSetShowKeyModal={setShowKeyModal}
        showLogger={showLogger}
        onSetShowLogger={setShowLogger}
        onGetKey={dashboardHandlers.handleGetKey}
      />
      </Suspense>
    )
  }

  // По умолчанию показываем landing
  return <LandingPage onSetView={setView} />
}

