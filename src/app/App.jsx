import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import { initializeApp, getApp } from 'firebase/app'
import { 
  getAuth, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth'
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, getDocs, addDoc, deleteDoc, doc, query, where, updateDoc, setDoc, getDoc, CACHE_SIZE_UNLIMITED } from 'firebase/firestore'
import { Shield, LogOut, Copy, Trash2, Globe, CheckCircle2, XCircle, AlertCircle, Settings, Users, Server, DollarSign, Edit2, Save, X, Bug, Zap, Check, PlusCircle, Info, Smartphone, Cpu, Database, Activity, ChevronRight, User, CreditCard, History, Phone, Network, Link2, TestTube, Loader2 } from 'lucide-react'
import axios from 'axios'
// bcrypt больше не нужен - используем Firebase Auth
import ThreeXUI from '../features/vpn/services/ThreeXUI.js' // Используется только для утилит (generateUUID, generateSubId)
import { dashboardService } from '../features/dashboard/services/dashboardService.js' // Работает через Backend Proxy для создания клиентов в 3x-ui
import { validateEnvVars, getEnvErrorMessage } from '../shared/utils/envValidation.js'
import logger from '../shared/utils/logger.js'
import LoggerPanel from '../shared/components/LoggerPanel.jsx'
import LoginForm from '../features/auth/components/LoginForm.jsx'
import Dashboard from '../features/dashboard/components/Dashboard.jsx'
import AdminPanel from '../features/admin/components/AdminPanel.jsx'
import FinancesDashboard from '../features/admin/components/FinancesDashboard.jsx'
import { AdminProviderWrapper } from '../features/admin/components/AdminProvider.jsx'
import SidebarNav from '../shared/components/Sidebar.jsx'
import Footer from '../shared/components/Footer.jsx'
import { useAdmin } from '../features/admin/hooks/useAdmin.js'
import TransactionManager from '../features/vpn/services/TransactionManager.js'
import { formatDate } from '../shared/utils/formatDate.js'
import { formatTraffic } from '../shared/utils/formatTraffic.js'
import { validateEmail } from '../features/auth/utils/validateEmail.js'
import { validatePassword } from '../features/auth/utils/validatePassword.js'
import { isAdminEmail, canAccessAdmin, canAccessFinances } from '../shared/constants/admin.js'
import { APP_ID } from '../shared/constants/app.js'
import { stripUndefinedForFirestore } from '../shared/utils/firestoreSafe.js'

// Константа appId для пути Firestore (для обратной совместимости)
const appId = APP_ID

// Валидация переменных окружения при старте
logger.info('App', '🔍 Проверка конфигурации переменных окружения...')
const envValidation = validateEnvVars()
if (!envValidation.isValid) {
  const errorMsg = getEnvErrorMessage(envValidation)
  console.error('Ошибка конфигурации:\n', errorMsg)
  logger.error('App', '❌ Ошибка конфигурации переменных окружения', { validation: envValidation })
} else {
  logger.info('App', '✅ Конфигурация переменных окружения проверена успешно')
}

// Конфигурация Firebase (будет загружаться из переменных окружения)
// ВАЖНО: Vite загружает переменные окружения только при старте сервера!
// Если вы изменили .env - обязательно перезапустите dev сервер!

// Диагностика: проверяем, загружены ли переменные окружения
const envVars = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Логируем загруженные переменные (для диагностики) - используем logger из config

const firebaseConfig = {
  apiKey: envVars.apiKey,
  authDomain: envVars.authDomain,
  projectId: envVars.projectId,
  storageBucket: envVars.storageBucket,
  messagingSenderId: envVars.messagingSenderId,
  appId: envVars.appId,
}

// Проверка конфигурации Firebase перед инициализацией
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  const missing = []
  if (!firebaseConfig.apiKey) missing.push('VITE_FIREBASE_API_KEY')
  if (!firebaseConfig.authDomain) missing.push('VITE_FIREBASE_AUTH_DOMAIN')
  if (!firebaseConfig.projectId) missing.push('VITE_FIREBASE_PROJECT_ID')
  if (!firebaseConfig.storageBucket) missing.push('VITE_FIREBASE_STORAGE_BUCKET')
  if (!firebaseConfig.messagingSenderId) missing.push('VITE_FIREBASE_MESSAGING_SENDER_ID')
  if (!firebaseConfig.appId) missing.push('VITE_FIREBASE_APP_ID')
  
  // Ошибка уже залогирована в config.js через logger
  
  logger.error('Firebase', 'Конфигурация Firebase неполная', { 
    missing,
    config: { 
      ...firebaseConfig, 
      apiKey: firebaseConfig.apiKey ? '***' : null 
    } 
  })
}

// Инициализация Firebase
let app = null
let auth = null
let db = null
let googleProvider = null
let firebaseInitError = null

try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    logger.info('Firebase', '🔥 Инициализация Firebase...')
    
    // Проверяем, не была ли уже инициализирована Firebase (защита от hot reload)
    try {
    app = initializeApp(firebaseConfig)
    } catch (initError) {
      // Если приложение уже инициализировано, получаем существующий экземпляр
      if (initError.code === 'app/duplicate-app') {
        app = getApp()
        logger.debug('Firebase', 'Используется существующий экземпляр Firebase (hot reload)', null)
      } else {
        throw initError
      }
    }
    
    auth = getAuth(app)
    // Явно включаем сохранение сессии в браузере — один аккаунт на браузер, сессия переживает перезагрузку
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      logger.warn('Firebase', 'Не удалось установить persistence (сессия может не сохраняться)', null, err)
    })
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      })
    } catch (e) {
      if (e.code === 'failed-precondition') {
        db = getFirestore(app)
      } else {
        throw e
      }
    }
    
    googleProvider = new GoogleAuthProvider()
    googleProvider.setCustomParameters({
      prompt: 'select_account'
    })
    logger.info('Firebase', '✅ Firebase успешно инициализирован', {
      projectId: firebaseConfig.projectId,
      authDomain: firebaseConfig.authDomain,
    })
  } else {
    const missing = []
    if (!firebaseConfig.apiKey) missing.push('apiKey')
    if (!firebaseConfig.projectId) missing.push('projectId')
    firebaseInitError = `Отсутствуют обязательные поля конфигурации: ${missing.join(', ')}`
    logger.warn('Firebase', '⚠️ Firebase не может быть инициализирован', {
      missing,
      hasApiKey: !!firebaseConfig.apiKey,
      hasProjectId: !!firebaseConfig.projectId,
    })
  }
} catch (error) {
  // Игнорируем ошибки persistence - они обрабатываются отдельно
  if (error.code === 'failed-precondition' && error.message?.includes('persistence')) {
    // Это ошибка persistence при hot reload - не критично, просто игнорируем
    logger.debug('Firebase', 'Ошибка persistence при инициализации (hot reload)', null)
    // Не устанавливаем firebaseInitError, так как это не критичная ошибка
  } else {
    // Другие ошибки логируем как критические
  firebaseInitError = error.message || 'Неизвестная ошибка'
  logger.error('Firebase', '❌ Ошибка инициализации Firebase', null, error)
  console.error('Детали ошибки:', {
    code: error.code,
    message: error.message,
    stack: error.stack
  })
  }
}

// XUIService удален - теперь используется ThreeXUI из services/ThreeXUI.js

// Функция определения статуса пользователя
// clientStats - опциональный параметр со статистикой из 3x-ui
const getUserStatus = (user, clientStats = null) => {
  if (!user.uuid || user.uuid.trim() === '') {
    return { status: 'no-key', label: 'Нет ключа', color: 'text-slate-400' }
  }
  
  const now = Date.now()
  
  // Приоритет: сначала проверяем expiryTime из 3x-ui, затем из Firestore
  let expiryTime = null
  if (clientStats && clientStats.expiryTime) {
    // expiryTime из 3x-ui в миллисекундах
    expiryTime = clientStats.expiryTime
  } else if (user.expiresAt) {
    // expiryTime из Firestore
    expiryTime = user.expiresAt
  }
  
  // Если срок истек - принудительно ставим статус 'Истек'
  if (expiryTime && expiryTime > 0 && expiryTime < now) {
    return { status: 'expired', label: 'Истек', color: 'text-red-400' }
  }
  
  return { status: 'active', label: 'Активен', color: 'text-green-400' }
}

// Функции форматирования и валидации теперь импортируются из утилит

// Валидация имени
const validateName = (name) => {
  if (!name || name.trim() === '') {
    return 'Имя обязательно для заполнения'
  }
  
  if (name.trim().length < 2) {
    return 'Имя должно содержать минимум 2 символа'
  }
  
  if (name.length > 100) {
    return 'Имя слишком длинное (максимум 100 символов)'
  }
  
  // Проверяем, что имя содержит только буквы, пробелы и дефисы
  if (!/^[a-zA-Zа-яА-ЯёЁ\s-]+$/.test(name.trim())) {
    return 'Имя может содержать только буквы, пробелы и дефисы'
  }
  
  return null
}

// Компонент ошибки конфигурации (вынесен наружу для предотвращения пересоздания)
const ConfigErrorScreen = ({ configError }) => (
  <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
    <div className="max-w-2xl w-full bg-slate-900 rounded-lg shadow-xl p-8 border border-red-800">
      <div className="flex items-center gap-3 mb-4">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <h1 className="text-2xl font-bold text-red-400">Ошибка конфигурации</h1>
      </div>
      <div className="bg-slate-800 rounded p-4 mb-4">
        <pre className="text-slate-300 text-sm whitespace-pre-wrap font-mono">
          {configError}
        </pre>
      </div>
      <div className="text-slate-400 text-sm space-y-2">
        <p><strong className="text-slate-300">Что делать:</strong></p>
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li>Создайте файл <code className="bg-slate-800 px-2 py-1 rounded">.env</code> в корне проекта</li>
          <li>Скопируйте пример из <code className="bg-slate-800 px-2 py-1 rounded">.env.example</code> (если есть)</li>
          <li>Заполните все переменные окружения своими значениями</li>
          <li>Перезапустите приложение</li>
        </ol>
      </div>
    </div>
  </div>
)

// Компонент Landing Page (вынесен наружу для предотвращения пересоздания)
const LandingPage = ({ onSetView }) => (
  <div className="min-h-screen bg-slate-950 text-slate-200 overflow-x-hidden selection:bg-blue-500/30">
    {/* Hero Section */}
    <div className="relative pt-20 pb-16 px-6 lg:px-8 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950">
      <div className="max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-bold mb-8 animate-bounce">
          <Zap size={14} /> Новый стандарт анонимности
          </div>
        <h1 className="text-5xl lg:text-7xl font-black text-white mb-6 tracking-tighter italic">
          <span className="text-blue-600">SKYPATH</span> VPN
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Суперзащищенный протокол <span className="text-white font-bold">VLESS</span> и <span className="text-white font-bold">обход белых списков в России</span> для полной свободы в сети.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button onClick={() => onSetView('register')} className="w-full sm:w-64 bg-blue-600 hover:bg-blue-500 py-5 rounded-3xl font-black text-white text-xl transition-all shadow-2xl shadow-blue-600/30 active:scale-95">
            Начать работу
          </button>
          <button onClick={() => onSetView('login')} className="w-full sm:w-64 bg-slate-900 hover:bg-slate-800 py-5 rounded-3xl font-black text-white text-xl border border-slate-800 transition-all active:scale-95">
            Войти в кабинет
          </button>
        </div>
      </div>
    </div>

    {/* Features */}
    <div className="max-w-7xl mx-auto px-6 py-20 grid grid-cols-1 md:grid-cols-3 gap-8">
      <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] group hover:border-blue-500/40 transition-all">
        <div className="bg-blue-500/10 w-14 h-14 rounded-2xl flex items-center justify-center text-blue-500 mb-6 group-hover:scale-110 transition-transform">
          <Shield size={28} />
        </div>
        <h3 className="text-xl font-black text-white mb-3 uppercase tracking-tight">Суперзащищенный VLESS</h3>
        <p className="text-slate-500 font-medium">Самый современный протокол передачи данных, который невозможно обнаружить современными средствами DPI.</p>
      </div>
      <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] group hover:border-blue-500/40 transition-all">
        <div className="bg-blue-500/10 w-14 h-14 rounded-2xl flex items-center justify-center text-blue-500 mb-6 group-hover:scale-110 transition-transform">
          <Check size={28} />
        </div>
        <h3 className="text-xl font-black text-white mb-3 uppercase tracking-tight">Обход белых списков</h3>
        <p className="text-slate-500 font-medium">Специальная технология обхода белых списков в России, разработанная для стабильной работы в любых регионах.</p>
      </div>
      <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] group hover:border-blue-500/40 transition-all">
        <div className="bg-blue-500/10 w-14 h-14 rounded-2xl flex items-center justify-center text-blue-500 mb-6 group-hover:scale-110 transition-transform">
          <Globe size={28} />
        </div>
        <h3 className="text-xl font-black text-white mb-3 uppercase tracking-tight">Локации</h3>
        <p className="text-slate-500 font-medium">Сервера в США, Нидерландах, Швейцарии, Германии и России для минимального пинга.</p>
      </div>
    </div>

    {/* Pricing */}
    <div className="max-w-7xl mx-auto px-6 py-20">
      <div className="text-center mb-16">
        <h2 className="text-4xl lg:text-5xl font-black text-white mb-4 tracking-tighter">Выберите свой тариф</h2>
        <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Прозрачные цены без скрытых платежей</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {/* Super Plan */}
        <div className="relative bg-slate-900 border border-slate-800 p-10 rounded-[3rem] shadow-2xl transition-transform hover:scale-[1.02]">
          <div className="absolute top-8 right-8 bg-blue-600 text-[10px] font-black px-3 py-1 rounded-full uppercase text-white tracking-widest shadow-lg">ХИТ</div>
          <h3 className="text-3xl font-black text-white mb-2 italic">Super</h3>
          <div className="flex items-baseline gap-1 mb-8">
            <span className="text-5xl font-black text-blue-500">150</span>
            <span className="text-xl font-bold text-slate-500 italic">₽/мес</span>
          </div>
          <ul className="space-y-4 mb-10">
            <li className="flex items-center gap-3 text-slate-300 font-bold">
              <Smartphone className="text-blue-500" size={20} /> <span>1 Устройство</span>
            </li>
            <li className="flex items-center gap-3 text-slate-300 font-bold">
              <Check className="text-blue-500" size={20} /> <span>Обход белого списка</span>
            </li>
            <li className="flex items-center gap-3 text-slate-300 font-bold">
              <Shield className="text-blue-500" size={20} /> <span>Протокол VLESS</span>
            </li>
          </ul>
          <button onClick={() => onSetView('register')} className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl font-black text-white transition-all shadow-xl shadow-blue-600/20 active:scale-95">Выбрать Super</button>
        </div>
          {/* MULTI Plan */}
          <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3rem] shadow-2xl transition-transform hover:scale-[1.02]">
            <h3 className="text-3xl font-black text-white mb-2 italic">MULTI</h3>
            <div className="flex items-baseline gap-1 mb-8">
              <span className="text-5xl font-black text-blue-500">250</span>
              <span className="text-xl font-bold text-slate-500 italic">₽/мес</span>
            </div>
            <ul className="space-y-4 mb-10">
              <li className="flex items-center gap-3 text-slate-300 font-bold">
                <Users className="text-blue-500" size={20} /> <span>5 Устройств</span>
              </li>
              <li className="flex items-center gap-3 text-slate-300 font-bold">
                <Zap className="text-blue-500" size={20} /> <span>Высокая скорость трафика</span>
              </li>
              <li className="flex items-center gap-3 text-slate-400 font-medium">
                <X className="text-red-500" size={20} /> <span>Без обхода белого списка</span>
              </li>
            </ul>
            <button onClick={() => onSetView('register')} className="w-full bg-slate-800 hover:bg-slate-700 py-5 rounded-2xl font-black text-white transition-all shadow-xl active:scale-95">Выбрать MULTI</button>
          </div>
        </div>
      </div>

      {/* Locations */}
      <div className="bg-slate-900/30 py-20 px-6 border-y border-slate-900">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
            <div className="lg:w-1/2">
              <h2 className="text-4xl font-black text-white mb-6 leading-none italic">Глобальное покрытие серверов</h2>
              <p className="text-slate-400 text-lg mb-8 font-medium">Мы размещаем наши узлы в лучших дата-центрах мира для обеспечения минимальной задержки и максимальной пропускной способности.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {['США', 'Нидерланды', 'Швейцария', 'Германия', 'Россия'].map((city) => (
                  <div key={city} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center gap-3 font-bold text-white">
                    <Globe size={18} className="text-blue-600" /> {city}
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:w-1/2 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-600 blur-[100px] opacity-20 animate-pulse" />
                <Server size={320} className="text-slate-800 relative z-10" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )

  // Компонент LoginForm вынесен в отдельный файл src/components/LoginForm.jsx

// Компонент модального окна с ключом (вынесен наружу для предотвращения пересоздания)
const KeyModal = ({ user, onClose, clientStats = null, settings, onCopy, formatDate }) => {
  const [subscriptionLink, setSubscriptionLink] = useState(null)
  const [loadingLink, setLoadingLink] = useState(true)
  
  // Загружаем ссылку подписки: сначала из сохраненной, затем из тарифа, затем дефолтная
  useEffect(() => {
    const loadSubscriptionLink = async () => {
      if (!user) {
        setLoadingLink(false)
        return
      }
      
      const getSubId = () => {
        if (user?.subId && String(user.subId).trim() !== '') {
          return String(user.subId).trim()
        }
        return null
      }
      
      const subId = getSubId()
      if (!subId) {
        setSubscriptionLink(null)
        setLoadingLink(false)
        return
      }
      
      // ВАЖНО: Приоритет - сначала ссылка из тарифа (актуальная), затем сохраненная, затем дефолтная
      // Загружаем тариф и используем ссылку из него (если есть tariffId)
      if (user.tariffId) {
        try {
          const db = getFirestore()
          const tariffDoc = doc(db, `artifacts/${APP_ID}/public/data/tariffs`, user.tariffId)
          const tariffSnapshot = await getDoc(tariffDoc)
          if (tariffSnapshot.exists()) {
            const tariff = tariffSnapshot.data()
            if (tariff.subscriptionLink && tariff.subscriptionLink.trim()) {
              // Убираем завершающий слэш, если есть, и добавляем subId
              const baseLink = tariff.subscriptionLink.trim().replace(/\/$/, '')
              const linkFromTariff = `${baseLink}/${subId}`
              setSubscriptionLink(linkFromTariff)
              setLoadingLink(false)
              logger.info('App', 'Использована ссылка из тарифа для KeyModal', {
                tariffId: user.tariffId,
                tariffName: tariff.name,
                baseLink: tariff.subscriptionLink,
                finalLink: linkFromTariff
              })
              return
            }
          }
        } catch (err) {
          logger.warn('App', 'Ошибка загрузки тарифа для KeyModal', {
            tariffId: user.tariffId
          }, err)
        }
      }
      
      // Если ссылки из тарифа нет, проверяем сохраненную ссылку (fallback)
      if (user.subscriptionLink && user.subscriptionLink.trim()) {
        setSubscriptionLink(user.subscriptionLink.trim())
        setLoadingLink(false)
        logger.info('App', 'Использована сохраненная ссылка для KeyModal (fallback)', {
          hasTariffId: !!user.tariffId
        })
        return
      }
      
      // Если ссылка из тарифа и сохраненная не получены, используем дефолтную
      const defaultLink = `https://subs.skypath.fun:3458/vk198/${subId}`
      setSubscriptionLink(defaultLink)
      setLoadingLink(false)
      logger.info('App', 'Использована дефолтная ссылка для KeyModal', {
        hasTariffId: !!user.tariffId,
        defaultLink
      })
    }
    
    loadSubscriptionLink()
  }, [user, user?.tariffId, user?.subId, user?.subscriptionLink]) // Обновляем при изменении user или его свойств
  
  if (!user || !subscriptionLink || loadingLink) return null

  const userStatus = getUserStatus(user, clientStats)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-xl font-bold text-white flex items-center gap-3">
            <Globe size={22} className="text-blue-500" /> Нидерланды
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
            <X size={24} className="text-slate-400" />
            </button>
          </div>
        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <p className="text-sm text-slate-400 font-medium">Статус:</p>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold ${
              userStatus.status === 'active' ? 'bg-green-900/30 text-green-400' :
              userStatus.status === 'expired' ? 'bg-red-900/30 text-red-400' :
              'bg-slate-800 text-slate-400'
            }`}>
              {userStatus.status === 'active' && <CheckCircle2 className="w-4 h-4 animate-pulse" />}
              {userStatus.status === 'expired' && <XCircle className="w-4 h-4" />}
              {userStatus.status === 'no-key' && <AlertCircle className="w-4 h-4" />}
              {userStatus.label}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-slate-400 font-medium">Ваша ссылка на подписку:</p>
            <div className="bg-black/40 border border-slate-800 p-5 rounded-3xl break-all font-mono text-xs text-blue-400 leading-relaxed ring-1 ring-blue-500/10">
              {subscriptionLink}
            </div>
          </div>
              <button
                onClick={() => onCopy(subscriptionLink)}
            className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-3xl font-bold flex items-center justify-center gap-3 transition-all text-white shadow-xl shadow-blue-600/20 active:scale-95"
              >
            <Copy size={20} /> Копировать ссылку
              </button>
          <div className="pt-4 border-t border-slate-800 space-y-2">
            <p className="text-slate-400 text-sm">
              <strong className="text-slate-300">План:</strong> {user.plan === 'premium' ? 'Премиум' : 'Бесплатный'}
            </p>
            {(clientStats?.expiryTime || user.expiresAt) && (
              <p className="text-slate-400 text-sm">
                <strong className="text-slate-300">Истекает:</strong>{' '}
                {clientStats?.expiryTime && clientStats.expiryTime > 0
                  ? formatDate(clientStats.expiryTime)
                  : user.expiresAt
                  ? formatDate(user.expiresAt)
                  : 'Не ограничен'}
                {clientStats?.expiryTime && (
                  <span className="text-slate-500 text-xs ml-1">(из 3x-ui)</span>
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Компонент Sidebar (вынесен наружу для предотвращения пересоздания)
const Sidebar = ({ currentUser, view, onSetView, onLogout }) => (
  <aside className="w-72 bg-slate-900/40 border-r border-slate-800/60 p-8 hidden lg:flex flex-col">
    <div className="flex items-center gap-4 mb-12 px-2 cursor-pointer" onClick={() => onSetView('landing')}>
      <div className="bg-blue-600 p-2.5 rounded-2xl">
        <Shield className="text-white" size={24} />
      </div>
      <span className="text-2xl font-black tracking-tighter text-white italic">SKYPATH VPN</span>
    </div>
    <nav className="space-y-2 flex-1">
      <button 
        onClick={() => onSetView(currentUser.role === 'admin' ? 'admin' : 'dashboard')}
        className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all font-bold ${view === 'dashboard' || view === 'admin' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800/50'}`}
      >
        <Activity size={20} /> <span>{currentUser.role === 'admin' ? 'Управление' : 'Кабинет'}</span>
      </button>
      <button onClick={() => onSetView('landing')} className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all font-bold text-slate-400 hover:bg-slate-800/50">
        <Info size={20} /> <span>О сервисе</span>
      </button>
    </nav>
    <button 
      onClick={onLogout}
      className="flex items-center gap-4 px-6 py-4 text-slate-500 hover:text-red-400 transition-colors mt-auto font-bold"
    >
      <LogOut size={20} /> Выйти
    </button>
  </aside>
)

/** Вызов useAdmin в корневом бандле, чтобы избежать «Invalid hook call» из-за двух копий React в админ-чанке.
 *  adminTab/setAdminTab должны приходить из родителя, чтобы контекст и UI (AdminPanel) использовали одно и то же состояние. */
function AdminViewWithContext({ children, adminTab, setAdminTab, ...adminProps }) {
  const handlers = useAdmin({ ...adminProps, adminTab, setAdminTab })
  return (
    <AdminProviderWrapper injectHandlers={handlers} adminTab={adminTab} setAdminTab={setAdminTab}>
      {children}
    </AdminProviderWrapper>
  )
}

export default function VPNServiceApp() {
  // Инициализация view: при первом заходе всегда страница приветствия, иначе — сохранённый view
  const getInitialView = () => {
    try {
      const savedView = localStorage.getItem('vpn_current_view')
      const savedUser = localStorage.getItem('vpn_current_user')
      // Если есть сохранённый пользователь и view (кабинет/админка), восстанавливаем их
      if (savedView && savedUser && savedView !== 'login' && savedView !== 'register' && savedView !== 'landing') {
        return savedView
      }
    } catch (err) {
      logger.debug('App', 'Ошибка чтения view из localStorage', null, err)
    }
    return 'landing'
  }

  // UI состояния
  const [view, setViewState] = useState(getInitialView)
  const [authChecking, setAuthChecking] = useState(true) // Флаг проверки авторизации
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [showLogger, setShowLogger] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [adminTab, setAdminTab] = useState('users')
  const [dashboardTab, setDashboardTab] = useState('subscription')
  const [editingUser, setEditingUser] = useState(null)
  const [editingServer, setEditingServer] = useState(null)
  const [editingTariff, setEditingTariff] = useState(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileData, setProfileData] = useState({ name: '', phone: '' })

  // Функция для очистки сообщений
  const clearMessages = useCallback(() => {
    setError(null)
    setSuccess(null)
  }, [])

  // Обертка для setView с сохранением в localStorage
  const setView = useCallback((newView) => {
    setViewState(newView)
    if (newView && newView !== 'landing' && newView !== 'login' && newView !== 'register') {
      try {
        localStorage.setItem('vpn_current_view', newView)
        console.log('💾 View сохранен в localStorage:', newView)
      } catch (err) {
        logger.error('App', 'Ошибка при сохранении view в localStorage', { view: newView }, err)
      }
    } else {
      localStorage.removeItem('vpn_current_view')
    }
  }, [])

  // Локальные состояния
  const [users, setUsers] = useState([])
  const [currentUser, setCurrentUserState] = useState(null)
  const [settings, setSettings] = useState(null)
  const [tariffs, setTariffs] = useState([])
  const [loading, setLoading] = useState(true)
  const [googleSignInLoading, setGoogleSignInLoading] = useState(false)
  const [authMode, setAuthMode] = useState('login') // 'login' | 'register'
  const [loginData, setLoginData] = useState({ email: '', password: '', name: '' })
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [configError, setConfigError] = useState(null)
  const [settingsLoading, setSettingsLoading] = useState(true)


  // Обертка для setCurrentUser с сохранением в localStorage (для обратной совместимости)
  const setCurrentUser = useCallback((user) => {
    setCurrentUserState(user)
    if (user) {
      try {
        localStorage.setItem('vpn_current_user', JSON.stringify(user))
        console.log('💾 Пользователь сохранен в localStorage:', user.email)
      } catch (err) {
        logger.error('App', 'Ошибка при сохранении пользователя в localStorage', { email: user?.email }, err)
      }
    } else {
      localStorage.removeItem('vpn_current_user')
      localStorage.removeItem('vpn_current_view')
      console.log('🗑️ Пользователь удален из localStorage')
    }
  }, [])

  // Проверка конфигурации при монтировании
  useEffect(() => {
    logger.info('App', 'Инициализация приложения')
    if (!envValidation.isValid) {
      const errorMsg = getEnvErrorMessage(envValidation)
      setConfigError(errorMsg)
      setLoading(false)
      logger.error('App', 'Приложение не может быть запущено из-за ошибок конфигурации')
    } else {
      logger.info('App', 'Конфигурация проверена успешно')
    }
  }, [])

  // Проверка доступности Firebase
  useEffect(() => {
    if (!app || !auth || !db) {
      let errorMsg = 'Firebase не инициализирован.\n\n'
      
      if (firebaseInitError) {
        errorMsg += `Ошибка: ${firebaseInitError}\n\n`
      }
      
      errorMsg += 'Возможные причины:\n'
      errorMsg += '1. Переменные окружения не загружены (проверьте консоль браузера)\n'
      errorMsg += '2. Dev сервер не был перезапущен после изменения .env\n'
      errorMsg += '3. Неправильные значения в .env файле\n\n'
      errorMsg += 'Проверьте консоль браузера для детальной диагностики.'
      
      console.error('❌ Firebase не инициализирован!')
      console.error('app:', app)
      console.error('auth:', auth)
      console.error('db:', db)
      console.error('firebaseInitError:', firebaseInitError)
      
      // Устанавливаем configError только если это критично
      // Если view === 'landing', не блокируем показ страницы
      if (view !== 'landing') {
        setConfigError(errorMsg)
      }
      setLoading(false)
    } else {
      console.log('✅ Firebase компоненты инициализированы:', { app: !!app, auth: !!auth, db: !!db })
    }
  }, [view])

  // Загрузка пользователей из Firestore
  // ВАЖНО: для админ-панели — только админ; для раздела «Финансы» — админ и бухгалтер (чтобы подставлять имена в отчёты)
  const loadUsers = useCallback(async () => {
    if (!currentUser || !canAccessFinances(currentUser.role)) {
      logger.warn('Firestore', 'Загрузка пользователей доступна только админу и бухгалтеру')
      return
    }

    if (!db) {
      const errorMsg = 'База данных недоступна. Проверьте конфигурацию Firebase.'
      logger.error('Firestore', 'База данных недоступна')
      setError(errorMsg)
      setLoading(false)
      return
    }

    try {
      logger.info('Firestore', 'Загрузка всех пользователей из Firestore (только для админа)')
      const usersCollection = collection(db, `artifacts/${appId}/public/data/users_v4`)
      const usersSnapshot = await getDocs(usersCollection)
      const usersList = []
      
      usersSnapshot.forEach((docSnapshot) => {
        usersList.push({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        })
      })
      
      logger.info('Firestore', `Загружено пользователей: ${usersList.length}`, { 
        adminId: currentUser.id,
        message: 'Глобальные данные - все пользователи системы'
      })
      setUsers(usersList)
    } catch (err) {
      logger.error('Firestore', 'Ошибка загрузки пользователей', { code: err.code }, err)
      // Более детальная обработка ошибок
      if (err.code === 'permission-denied') {
        setError('Нет доступа к базе данных. Проверьте правила безопасности Firestore.')
      } else if (err.code === 'unavailable') {
        setError('Сервис временно недоступен. Попробуйте позже.')
      } else {
        setError('Ошибка загрузки данных: ' + (err.message || 'Неизвестная ошибка'))
      }
    } finally {
      setLoading(false)
    }
  }, [db, currentUser?.id, currentUser?.role])

  // Загрузка данных пользователя из Firestore по UID
  // ВАЖНО: Каждый пользователь имеет уникальный uid, что обеспечивает полную изоляцию данных
  // Данные одного пользователя недоступны другому пользователю
  /**
   * Генерация уникального subId с проверкой в базе данных
   * @param {Firestore} dbInstance - Экземпляр Firestore
   * @param {string} appIdValue - ID приложения
   * @param {number} maxAttempts - Максимальное количество попыток генерации
   * @returns {Promise<string>} Уникальный subId
   */
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
        logger.error('Auth', 'Ошибка при проверке уникальности subId', { subId, attempt }, error)
        // В случае ошибки проверки, возвращаем сгенерированный subId
        // (лучше иметь потенциально дублирующийся subId, чем блокировать регистрацию)
        if (attempt === maxAttempts) {
          return subId
        }
      }
    }
    
    // Если все попытки не удались, возвращаем последний сгенерированный
    return ThreeXUI.generateSubId()
  }, [])

  const loadUserData = useCallback(async (uid) => {
    if (!db || !uid) return null
    
    try {
      // КРИТИЧНО: Путь к документу пользователя включает его уникальный uid
      // Это гарантирует, что каждый пользователь имеет изолированное хранилище данных
      const userDoc = doc(db, `artifacts/${appId}/public/data/users_v4`, uid)
      const userSnapshot = await getDoc(userDoc)
      
      if (userSnapshot.exists()) {
        const userData = { id: userSnapshot.id, ...userSnapshot.data() }
        logger.debug('Auth', 'Данные пользователя загружены (изолированы по uid)', { uid, email: userData.email })
        return userData
      }
      return null
    } catch (err) {
      // Обработка офлайн-режима Firebase
      if (err.code === 'unavailable' || err.message?.includes('offline') || err.message?.includes('Failed to get document because the client is offline')) {
        logger.warn('Auth', 'Firebase офлайн, пытаемся загрузить из кеша localStorage', { uid })
        
        // Пытаемся загрузить из localStorage
        try {
          const savedUserStr = localStorage.getItem('vpn_current_user')
          if (savedUserStr) {
            const savedUser = JSON.parse(savedUserStr)
            if (savedUser.id === uid) {
              logger.info('Auth', 'Данные пользователя загружены из localStorage (офлайн-режим)', { uid, email: savedUser.email })
              return savedUser
            }
          }
        } catch (localErr) {
          logger.warn('Auth', 'Ошибка загрузки из localStorage', { uid }, localErr)
        }
        
        // Возвращаем null, но не показываем ошибку - это нормально в офлайн-режиме
        return null
      }
      
      logger.error('Auth', 'Ошибка загрузки данных пользователя', { uid }, err)
      return null
    }
  }, [db])

  // Отслеживание состояния авторизации Firebase Auth
  useEffect(() => {
    if (!auth || !db) {
      setLoading(false)
      setAuthChecking(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('🔄 onAuthStateChanged вызван:', { user: !!firebaseUser, uid: firebaseUser?.uid })
      setFirebaseUser(firebaseUser)
      
      if (firebaseUser) {
        // Пользователь авторизован - загружаем данные из Firestore
        try {
          let userData = await loadUserData(firebaseUser.uid)
          if (userData) {
            // Миграция: если у существующего пользователя нет subId, генерируем его
            if (!userData.subId) {
              logger.info('Auth', 'У существующего пользователя нет subId, генерируем уникальный', {
                uid: firebaseUser.uid,
                email: firebaseUser.email
              })
              try {
                const generatedSubId = await generateUniqueSubId(db, appId)
                const userDocRef = doc(db, `artifacts/${appId}/public/data/users_v4`, firebaseUser.uid)
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
                const { dashboardService } = await import('../features/dashboard/services/dashboardService.js')
                const deletedUser = await dashboardService.checkAndDeleteUnpaidSubscription(userData)
                if (deletedUser === null) {
                  // Подписка была удалена, перезагружаем данные пользователя
                  userData = await loadUserData(firebaseUser.uid)
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
                const userDocRef = doc(db, `artifacts/${appId}/public/data/users_v4`, firebaseUser.uid)
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
                const notificationService = (await import('../shared/services/notificationService.js')).default
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
            
            // Устанавливаем правильный view после загрузки пользователя
            const savedView = localStorage.getItem('vpn_current_view')
            if (savedView && savedView !== 'login' && savedView !== 'register' && savedView !== 'landing') {
              setView(savedView)
            } else {
              // Если нет сохраненного view, устанавливаем по роли
              setView(effectiveRole === 'admin' ? 'admin' : 'dashboard')
            }
          } else {
            // Данные не найдены — для Google создаём документ (fallback на случай гонки с popup)
            if (firebaseUser.providerData?.some((p) => p.providerId === 'google.com')) {
              // Пользователь вошёл через Google, но документ не создан. Создаём документ и входим.
              try {
                logger.info('Auth', 'Создание пользователя в Firestore из onAuthStateChanged (fallback после Google)', { uid: firebaseUser.uid, email: firebaseUser.email })
                const generatedUUID = ThreeXUI.generateUUID()
                const generatedSubId = await generateUniqueSubId(db, appId)
                const userDocRef = doc(db, `artifacts/${appId}/public/data/users_v4`, firebaseUser.uid)
                const newUserData = {
                  email: firebaseUser.email || '',
                  name: firebaseUser.displayName || '',
                  phone: '',
                  role: 'user',
                  plan: 'free',
                  uuid: generatedUUID,
                  subId: generatedSubId,
                  expiresAt: null,
                  tariffName: '',
                  tariffId: '',
                  photoURL: firebaseUser.photoURL || null,
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
                setView(effectiveRole === 'admin' ? 'admin' : 'dashboard')
                logger.info('Auth', 'Вход через Google восстановлен в onAuthStateChanged', { uid: firebaseUser.uid, role: effectiveRole })
              } catch (fallbackErr) {
                logger.error('Auth', 'Ошибка fallback-создания пользователя после Google', { uid: firebaseUser.uid }, fallbackErr)
                setCurrentUser(null)
              }
            } else {
              try {
                const savedUserStr = localStorage.getItem('vpn_current_user')
                if (savedUserStr) {
                  const savedUser = JSON.parse(savedUserStr)
                  if (savedUser.id === firebaseUser.uid) {
                    logger.info('Firebase', 'Используем кешированные данные из localStorage', { uid: firebaseUser.uid, email: savedUser.email })
                    setCurrentUser(savedUser)
                    setTimeout(async () => {
                      try {
                        const notificationService = (await import('../shared/services/notificationService.js')).default
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
                    if (savedView && savedView !== 'login' && savedView !== 'register' && savedView !== 'landing') {
                      setView(savedView)
                    } else {
                      setView(savedUser.role === 'admin' ? 'admin' : 'dashboard')
                    }
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
        } catch (err) {
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
        setCurrentUser(null)
        logger.info('Firebase', 'Пользователь не авторизован')
        setView('login')
      }
      
      setLoading(false)
      setAuthChecking(false) // Завершили проверку авторизации
    })

    return () => unsubscribe()
  }, [auth, db, loadUserData, generateUniqueSubId])

  // Состояния для админ-панели теперь в useUIStore (adminTab, editingUser, editingServer, editingTariff)
  // settings, tariffs, servers теперь загружаются через React Query
  // Используем useRef для стабильного ID нового сервера, чтобы избежать проблем с фокусировкой
  const newServerIdRef = useRef(null)
  // Локальное состояние для тестирования сервера
  const [testingServerId, setTestingServerId] = useState(null)
  
  // Синхронизация servers из React Query
  const [servers, setServers] = useState([])

  // Загрузка настроек из Firestore
  // ВАЖНО: Настройки глобальные - применяются ко ВСЕМ пользователям системы
  // Не фильтруются по userId, так как это системные настройки
  // ВАЖНО: Используем useRef для предотвращения повторных загрузок, которые могут перезаписать локальные изменения
  const settingsLoadInProgressRef = useRef(false)
  const loadSettings = useCallback(async () => {
    // Проверка прав доступа - только админы могут загружать и изменять настройки
    if (!currentUser || currentUser.role !== 'admin') {
      logger.warn('Firestore', 'Попытка загрузки настроек без прав администратора')
      return
    }

    // Предотвращаем параллельные загрузки
    if (settingsLoadInProgressRef.current) {
      logger.debug('Firestore', 'Загрузка настроек уже выполняется, пропускаем')
      return
    }

    if (!db) return

    settingsLoadInProgressRef.current = true
    try {
      logger.info('Firestore', 'Загрузка глобальных настроек системы (только для админа)')
      // Путь к настройкам: artifacts/skyputh/public/settings (4 сегмента - четное число)
      // В Firestore путь должен иметь четное число сегментов (коллекция/документ/коллекция/документ)
      // ВАЖНО: Это глобальный документ, не привязанный к конкретному пользователю
      const settingsDoc = doc(db, `artifacts/${appId}/public/settings`)
      const settingsSnapshot = await getDoc(settingsDoc)
      
      if (settingsSnapshot.exists()) {
        const data = settingsSnapshot.data()
        setSettings(data)
        // ВАЖНО: Объединяем серверы из Firestore с текущими локальными серверами
        // Это предотвращает потерю серверов, которые были добавлены/изменены локально, но еще не сохранены
        const firestoreServers = (data.servers || []).map(server => {
          // КРИТИЧНО: Очищаем кавычки при загрузке из Firestore
          // Это исправляет проблему, если в Firestore сохранены данные с кавычками
          const cleanServer = {
            ...server,
            xuiUsername: (server.xuiUsername || '').trim().replace(/^["']|["']$/g, ''),
            // Пароль не трогаем - может содержать спецсимволы, включая кавычки
          }
          
          // Если у сервера нет поля protocol, определяем его по порту
          if (!cleanServer.protocol) {
            cleanServer.protocol = (cleanServer.serverPort === 443 || cleanServer.serverPort === 40919) ? 'https' : 'http'
          }
          return cleanServer
        })
        setServers(prevServers => {
          logger.debug('Firestore', 'Объединение серверов', { 
            firestoreCount: firestoreServers.length,
            localCount: prevServers?.length || 0,
            localServerIds: prevServers?.map(s => s.id) || []
          })
          
          // Если локальных серверов нет - используем из Firestore
          if (!prevServers || prevServers.length === 0) {
            logger.debug('Firestore', 'Загружены серверы из Firestore (локальных нет)', { count: firestoreServers.length })
            return firestoreServers
          }
          
          // Объединяем: серверы из Firestore + локальные серверы, которых нет в Firestore
          const mergedServers = [...firestoreServers]
          let addedCount = 0
          let updatedCount = 0
          
          prevServers.forEach(localServer => {
            const existsInFirestore = firestoreServers.some(fs => fs.id === localServer.id)
            if (!existsInFirestore) {
              // Локальный сервер не сохранен в Firestore - добавляем его
              logger.info('Firestore', 'Добавлен локальный сервер, не сохраненный в Firestore', { 
                serverId: localServer.id,
                serverName: localServer.name
              })
              mergedServers.push(localServer)
              addedCount++
            } else {
              // Сервер есть в обоих - приоритет локальным данным (особенно после тестов)
              const firestoreIndex = mergedServers.findIndex(fs => fs.id === localServer.id)
              if (firestoreIndex !== -1) {
                // ВАЖНО: Приоритет локальным данным, особенно если есть информация о тестах
                // Локальные данные могут содержать свежую информацию о тестах сессии
                const hasLocalTestInfo = localServer.sessionTestedAt || localServer.sessionError !== undefined
                const hasFirestoreTestInfo = mergedServers[firestoreIndex].sessionTestedAt || mergedServers[firestoreIndex].sessionError !== undefined
                
                if (hasLocalTestInfo && (!hasFirestoreTestInfo || new Date(localServer.sessionTestedAt || 0) > new Date(mergedServers[firestoreIndex].sessionTestedAt || 0))) {
                  // Локальные данные о тестах свежее - используем их полностью
                  mergedServers[firestoreIndex] = {
                    ...mergedServers[firestoreIndex],
                    ...localServer,
                  }
                  updatedCount++
                } else {
                  // Объединяем: базовые данные из Firestore + тестовые данные из локального (если есть)
                  mergedServers[firestoreIndex] = {
                    ...mergedServers[firestoreIndex],
                    ...localServer,
                    // Сохраняем важные поля из локального состояния
                    sessionTested: localServer.sessionTested ?? mergedServers[firestoreIndex].sessionTested,
                    sessionTestedAt: localServer.sessionTestedAt ?? mergedServers[firestoreIndex].sessionTestedAt,
                    sessionError: localServer.sessionError ?? mergedServers[firestoreIndex].sessionError,
                  }
                  updatedCount++
                }
              }
            }
          })
          
          logger.info('Firestore', 'Объединены серверы из Firestore и локальные', { 
            firestoreCount: firestoreServers.length,
            localCount: prevServers.length,
            mergedCount: mergedServers.length,
            addedCount,
            updatedCount
          })
          
          return mergedServers
        })
      } else {
        // Создаем настройки по умолчанию
        const defaultSettings = {
          // Адрес и порт панели / сервера, которые используются при работе с 3x-ui
          serverIP: import.meta.env.VITE_XUI_HOST || 'http://localhost',
          serverPort: Number(import.meta.env.VITE_XUI_PORT) || 2053,
          // Доступ к панели 3x-ui
          xuiUsername: import.meta.env.VITE_XUI_USERNAME || '',
          xuiPassword: import.meta.env.VITE_XUI_PASSWORD || '',
          // Основной inbound для работы приложения
          xuiInboundId: import.meta.env.VITE_XUI_INBOUND_ID || '',
          // Массив серверов 3x-ui
          servers: [],
          updatedAt: new Date().toISOString(),
        }
        await setDoc(settingsDoc, stripUndefinedForFirestore(defaultSettings))
        setSettings(defaultSettings)
        setServers([])
      }
    } catch (err) {
      // Обработка офлайн-режима
      const isOffline = err.code === 'unavailable' || err.message?.includes('offline') || err.message?.includes('Failed to get document because the client is offline')
      
      if (isOffline) {
        logger.warn('Admin', 'Офлайн-режим: используем настройки по умолчанию', null)
        // Используем настройки по умолчанию из переменных окружения
        const defaultSettings = {
          serverIP: import.meta.env.VITE_XUI_HOST || 'http://localhost',
          serverPort: Number(import.meta.env.VITE_XUI_PORT) || 2053,
          xuiUsername: import.meta.env.VITE_XUI_USERNAME || '',
          xuiPassword: import.meta.env.VITE_XUI_PASSWORD || '',
          xuiInboundId: import.meta.env.VITE_XUI_INBOUND_ID || '',
          servers: [],
          updatedAt: new Date().toISOString(),
        }
        setSettings(defaultSettings)
        setServers([])
      } else {
      logger.error('Admin', 'Ошибка загрузки настроек', null, err)
      }
      // Не показываем ошибку пользователю, так как это не критично для старта приложения
    } finally {
      setSettingsLoading(false)
      settingsLoadInProgressRef.current = false
    }
  }, [db, currentUser?.id, currentUser?.role])

  // Синхронизация authMode с view (только при изменении view)
  useEffect(() => {
    if (view === 'login' && authMode !== 'login') {
      setAuthMode('login')
    } else if (view === 'register' && authMode !== 'register') {
      setAuthMode('register')
    }
  }, [view]) // Только view, чтобы избежать лишних перерендеров

  // Один аккаунт на браузер: если пользователь уже авторизован (Firebase), не даём открывать логин/регистрацию/лендинг
  useEffect(() => {
    if (firebaseUser && (view === 'login' || view === 'register' || view === 'landing')) {
      const nextView = currentUser?.role === 'admin' ? 'admin' : 'dashboard'
      setView(nextView)
      logger.debug('App', 'Уже авторизован — редирект с экрана входа', { view, nextView })
    }
  }, [firebaseUser, view, currentUser?.role, setView])

  // Удалена логика автоматического переопределения view при наличии currentUser
  // View теперь восстанавливается из localStorage при инициализации и при загрузке пользователя

  // Загрузка пользователей и настроек при монтировании
  // ВАЖНО: Настройки загружаются только для админов, чтобы не перезаписывать локальные изменения
  useEffect(() => {
    if (firebaseUser) {
      // Загружаем пользователей только если это админ
      if (currentUser?.role === 'admin') {
      loadUsers()
        // Настройки загружаются только при открытии админ-панели (через другой useEffect)
        // Это предотвращает перезапись локальных изменений серверов
      }
    } else {
      // Если firebaseUser еще не установлен, но нет ошибок - устанавливаем loading в false
      // чтобы показать landing page
      if (!error && !configError) {
        // Даем немного времени для инициализации Firebase
        const timer = setTimeout(() => {
          setLoading(prev => {
            if (prev) {
              return false
            }
            return prev
          })
        }, 2000)
        return () => clearTimeout(timer)
      }
    }
  }, [firebaseUser, loadUsers, loadSettings, error, configError]) // Убираем loading из зависимостей

  // Обработка входа через Firebase Auth
  const handleLogin = useCallback(async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!auth || !db) {
      setError('Система авторизации недоступна. Проверьте конфигурацию Firebase.')
      return
    }

    // Извлекаем значения напрямую из формы
    const formData = new FormData(e.target)
    const email = formData.get('email') || e.target.querySelector('input[type="email"]')?.value || ''
    const password = formData.get('password') || e.target.querySelector('input[type="password"]')?.value || ''
    
    // Валидация email
    const emailError = validateEmail(email)
    if (emailError) {
      setError(emailError)
      return
    }
    
    // Валидация пароля
    const passwordError = validatePassword(password, false)
    if (passwordError) {
      setError(passwordError)
      return
    }

    try {
      logger.info('Auth', 'Попытка входа через Firebase Auth', { email })
      
      // Вход через Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      const firebaseUser = userCredential.user
      
      // Загружаем дополнительные данные пользователя из Firestore
      let userData = await loadUserData(firebaseUser.uid)
      
      if (!userData) {
        logger.warn('Auth', 'Данные пользователя не найдены в Firestore', { uid: firebaseUser.uid })
        setError('Данные пользователя не найдены. Обратитесь к администратору.')
        await signOut(auth)
        return
      }

      // Миграция: если у существующего пользователя нет subId, генерируем его
      if (!userData.subId) {
        logger.info('Auth', 'У существующего пользователя нет subId, генерируем уникальный', {
          uid: firebaseUser.uid,
          email: firebaseUser.email
        })
        const generatedSubId = await generateUniqueSubId(db, appId)
        const userDocRef = doc(db, `artifacts/${appId}/public/data/users_v4`, firebaseUser.uid)
        await updateDoc(userDocRef, {
          subId: generatedSubId,
          updatedAt: new Date().toISOString(),
        })
        userData = { ...userData, subId: generatedSubId }
        logger.info('Auth', 'subId добавлен существующему пользователю', { uid: firebaseUser.uid, subId: generatedSubId })
      }

      // Объединяем данные Firebase Auth и Firestore
      const currentUserData = {
        ...userData,
        email: firebaseUser.email || userData.email,
        photoURL: firebaseUser.photoURL || userData.photoURL || null,
      }
      
      setCurrentUser(currentUserData)
      logger.info('Auth', 'Успешный вход', { email, uid: firebaseUser.uid, role: userData.role })
        setSuccess('Вход выполнен успешно')
        setLoginData({ email: '', password: '' })
      setView(userData.role === 'admin' ? 'admin' : 'dashboard')
      // Устанавливаем вкладку "Подписки" после входа
      if (userData.role !== 'admin') {
        setDashboardTab('subscription')
      }
    } catch (err) {
      logger.error('Auth', 'Ошибка входа', { email }, err)
      
      // Обработка ошибок Firebase Auth
      let errorMessage = 'Ошибка входа. Попробуйте еще раз.'
      if (err.code === 'auth/user-not-found') {
        errorMessage = 'Пользователь с таким email не найден.'
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'Неверный пароль.'
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Неверный формат email.'
      } else if (err.code === 'auth/user-disabled') {
        errorMessage = 'Аккаунт заблокирован. Обратитесь к администратору.'
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Слишком много попыток входа. Попробуйте позже.'
      } else if (err.code === 'auth/network-request-failed') {
        errorMessage = 'Ошибка сети. Проверьте подключение к интернету.'
      } else if (err.message) {
        errorMessage = 'Ошибка входа: ' + err.message
      }
      
      setError(errorMessage)
    }
  }, [auth, db, loadUserData, generateUniqueSubId])

  // Обработка регистрации через Firebase Auth
  const handleRegister = useCallback(async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!auth || !db) {
      setError('Система авторизации недоступна. Проверьте конфигурацию Firebase.')
      return
    }

    // Извлекаем значения напрямую из формы
    const formData = new FormData(e.target)
    const email = formData.get('email') || e.target.querySelector('input[type="email"]')?.value || ''
    const password = formData.get('password') || e.target.querySelector('input[type="password"]')?.value || ''
    const name = formData.get('name') || e.target.querySelector('input[name="name"]')?.value || ''
    
    // Валидация email
    const emailError = validateEmail(email)
    if (emailError) {
      setError(emailError)
      return
    }
    
    // Валидация имени (обязательно для регистрации)
    const nameError = validateName(name)
    if (nameError) {
      setError(nameError)
      return
    }
    
    // Валидация пароля (более строгая для регистрации)
    const passwordError = validatePassword(password, true)
    if (passwordError) {
      setError(passwordError)
      return
    }

    let firebaseUser = null

    try {
      logger.info('Auth', 'Начало регистрации нового пользователя через Firebase Auth', { email })

      // 1. Создаем пользователя в Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      firebaseUser = userCredential.user

      // 2. Обновляем профиль с именем
      if (name.trim()) {
        await updateProfile(firebaseUser, {
          displayName: name.trim()
        })
      }

      // 3. Генерируем UUID для нового пользователя
      const generatedUUID = ThreeXUI.generateUUID()
      logger.info('Auth', 'UUID сгенерирован для нового пользователя', { email, uuid: generatedUUID })

      // 4. Генерируем уникальный subId для нового пользователя
      const generatedSubId = await generateUniqueSubId(db, appId)
      logger.info('Auth', 'Уникальный subId сгенерирован для нового пользователя', { email, subId: generatedSubId })

      // 5. Создаем документ в Firestore с дополнительными данными
      const userDocRef = doc(db, `artifacts/${appId}/public/data/users_v4`, firebaseUser.uid)
      const newUserData = {
        email: email,
        name: name.trim(),
        phone: '',
        role: 'user',
        plan: 'free',
        uuid: generatedUUID, // UUID генерируется сразу при регистрации
        subId: generatedSubId, // Уникальный subId для 3x-ui
        expiresAt: null,
        tariffName: '',
        tariffId: '',
        photoURL: firebaseUser.photoURL || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      
      await setDoc(userDocRef, newUserData)
      logger.info('Firestore', 'Данные пользователя созданы в Firestore', { uid: firebaseUser.uid, email })

      // 4. Устанавливаем currentUser
      const currentUserData = {
        id: firebaseUser.uid,
        ...newUserData,
      }
      
      setCurrentUser(currentUserData)
      logger.info('Auth', 'Регистрация завершена успешно', { email, uid: firebaseUser.uid })
      setSuccess('Регистрация выполнена успешно! Теперь вы можете получить ключ в личном кабинете.')
        setLoginData({ email: '', password: '', name: '' })
      setView('dashboard')
      // Устанавливаем вкладку "Подписки" после регистрации
      setDashboardTab('subscription')
      
      // Запрашиваем разрешение на уведомления после успешной регистрации
      try {
        const notificationService = (await import('../shared/services/notificationService.js')).default
        const notificationInstance = notificationService.getInstance()
        await notificationInstance.requestPermission()
        logger.info('Auth', 'Запрос разрешения на уведомления выполнен после регистрации')
      } catch (notificationError) {
        logger.warn('Auth', 'Ошибка при запросе разрешения на уведомления', null, notificationError)
        // Не блокируем регистрацию из-за ошибки уведомлений
      }
    } catch (err) {
      logger.error('Auth', 'Ошибка регистрации', { email }, err)
      
      // Если пользователь был создан в Firebase Auth, но ошибка при создании в Firestore - удаляем из Auth
      if (firebaseUser) {
        try {
          await firebaseUser.delete()
        } catch (deleteError) {
          logger.error('Auth', 'Ошибка удаления пользователя из Firebase Auth после ошибки', { uid: firebaseUser.uid }, deleteError)
        }
      }
      
      // Обработка ошибок Firebase Auth
      let errorMessage = 'Ошибка регистрации. Попробуйте позже.'
      if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'Пользователь с таким email уже существует.'
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Неверный формат email.'
      } else if (err.code === 'auth/operation-not-allowed') {
        errorMessage = 'Регистрация через email/password не включена. Обратитесь к администратору.'
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Пароль слишком слабый. Используйте более сложный пароль.'
      } else if (err.code === 'permission-denied') {
        errorMessage = 'Нет доступа к базе данных. Проверьте правила безопасности Firestore.'
      } else if (err.code === 'unavailable') {
        errorMessage = 'Сервис временно недоступен. Попробуйте позже.'
      } else if (err.message) {
        errorMessage = 'Ошибка регистрации: ' + err.message
      }
      
      setError(errorMessage)
    }
  }, [auth, db, generateUniqueSubId])

  // Вход через Google: используем redirect вместо popup — обходит COOP и блокировку всплывающих окон
  const handleGoogleSignIn = useCallback(async () => {
    if (!auth || !db || !googleProvider) {
      setError('Система авторизации недоступна. Проверьте конфигурацию Firebase.')
      return
    }
    if (googleSignInLoading) {
      logger.warn('Auth', 'Попытка входа через Google, когда уже выполняется вход')
      return
    }
    setError('')
    setSuccess('')
    setGoogleSignInLoading(true)
    try {
      logger.info('Auth', 'Открытие окна входа через Google')
      const result = await signInWithPopup(auth, googleProvider)
      const firebaseUser = result.user
      let userData = await loadUserData(firebaseUser.uid)
      if (!userData) {
        logger.info('Auth', 'Создание нового пользователя в Firestore после Google Sign-In', { uid: firebaseUser.uid, email: firebaseUser.email })
        const generatedUUID = ThreeXUI.generateUUID()
        const generatedSubId = await generateUniqueSubId(db, appId)
        const userDocRef = doc(db, `artifacts/${appId}/public/data/users_v4`, firebaseUser.uid)
        const newUserData = {
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || '',
          phone: '',
          role: 'user',
          plan: 'free',
          uuid: generatedUUID,
          subId: generatedSubId,
          expiresAt: null,
          tariffName: '',
          tariffId: '',
          photoURL: firebaseUser.photoURL || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        await setDoc(userDocRef, newUserData)
        userData = { id: firebaseUser.uid, ...newUserData }
      } else {
        if (!userData.subId) {
          const generatedSubId = await generateUniqueSubId(db, appId)
          const userDocRef = doc(db, `artifacts/${appId}/public/data/users_v4`, firebaseUser.uid)
          await updateDoc(userDocRef, { subId: generatedSubId, updatedAt: new Date().toISOString() })
          userData = { ...userData, subId: generatedSubId }
        }
        if (firebaseUser.photoURL && userData.photoURL !== firebaseUser.photoURL) {
          const userDocRef = doc(db, `artifacts/${appId}/public/data/users_v4`, firebaseUser.uid)
          await updateDoc(userDocRef, { photoURL: firebaseUser.photoURL, updatedAt: new Date().toISOString() })
          userData = { ...userData, photoURL: firebaseUser.photoURL }
        }
      }
      let effectiveRole = userData.role || 'user'
      const normalizedEmail = (firebaseUser.email || userData.email || '').trim().toLowerCase()
      if (isAdminEmail(normalizedEmail) && effectiveRole !== 'admin') {
        try {
          const userDocRef = doc(db, `artifacts/${appId}/public/data/users_v4`, firebaseUser.uid)
          await updateDoc(userDocRef, { role: 'admin', updatedAt: new Date().toISOString() })
          effectiveRole = 'admin'
          logger.info('Auth', 'Пользователю выданы права администратора по email', { email: normalizedEmail })
        } catch (roleErr) {
          logger.error('Auth', 'Не удалось обновить роль до admin', { email: normalizedEmail }, roleErr)
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
      setSuccess('Вход выполнен успешно')
      setView(effectiveRole === 'admin' ? 'admin' : 'dashboard')
      logger.info('Auth', 'Успешный вход через Google (popup)', { email: firebaseUser.email, uid: firebaseUser.uid, role: effectiveRole })
    } catch (err) {
      logger.error('Auth', 'Ошибка входа через Google', null, err)
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        let errorMessage = 'Ошибка входа через Google. Попробуйте ещё раз.'
        if (err?.code === 'auth/network-request-failed') {
          errorMessage = 'Ошибка сети. Проверьте подключение к интернету.'
        } else if (err?.code === 'auth/operation-not-allowed') {
          errorMessage = 'Вход через Google не включен. Обратитесь к администратору.'
        } else if (err?.message) {
          errorMessage = 'Ошибка входа через Google: ' + err.message
        }
        setError(errorMessage)
      }
    } finally {
      setGoogleSignInLoading(false)
    }
  }, [auth, db, googleProvider, loadUserData, generateUniqueSubId])

  // Обработка выхода
  const handleLogout = useCallback(async () => {
    const userEmail = currentUser?.email
    logger.info('Auth', 'Выход пользователя', { email: userEmail })
    
    try {
      if (auth) {
        await signOut(auth)
      }
    } catch (err) {
      logger.error('Auth', 'Ошибка при выходе', { email: userEmail }, err)
    }
    
    setCurrentUser(null)
    setShowKeyModal(false)
    setView('landing')
    setError('')
    setSuccess('')
  }, [currentUser, auth])

  // Удаление пользователя (админ)
  const handleDeleteUser = useCallback(async (userId) => {
    if (!currentUser || currentUser.role !== 'admin') {
      setError('Недостаточно прав')
      return
    }

    if (!window.confirm('Вы уверены, что хотите удалить этого пользователя?')) {
      return
    }

    // Находим пользователя для удаления
    const userToDelete = users.find((u) => u.id === userId)
    if (!userToDelete) {
      setError('Пользователь не найден')
      return
    }

    // Получаем inboundId из переменных окружения
    const inboundId = import.meta.env.VITE_XUI_INBOUND_ID
    if (!inboundId) {
      setError('Не настроен VITE_XUI_INBOUND_ID в переменных окружения')
      return
    }

    try {
      logger.info('Admin', 'Удаление пользователя', { userId, email: userToDelete.email })
      
      // Сначала удаляем из 3x-ui (если у пользователя есть UUID)
      if (userToDelete.uuid && userToDelete.uuid.trim() !== '') {
        try {
          await ThreeXUI.deleteClient(inboundId, userToDelete.email)
          logger.info('Admin', 'Пользователь удален из 3x-ui', { email: userToDelete.email })
        } catch (xuiError) {
          logger.warn('Admin', 'Ошибка удаления клиента из 3x-ui', { email: userToDelete.email }, xuiError)
          // Продолжаем удаление из Firestore даже если ошибка в 3x-ui
          // Можно показать предупреждение, но не блокировать удаление
        }
      }

      // Удаляем из Firestore
      const userDoc = doc(db, `artifacts/${appId}/public/data/users_v4`, userId)
      await deleteDoc(userDoc)
      logger.info('Admin', 'Пользователь удален из Firestore', { userId })
      
      // Обновление локального состояния
      setUsers(users.filter((u) => u.id !== userId))
      setSuccess('Пользователь удален из системы и VPN панели')
    } catch (err) {
      logger.error('Admin', 'Ошибка удаления пользователя', { userId }, err)
      // Более детальная обработка ошибок
      let errorMessage = 'Ошибка удаления пользователя'
      if (err.code === 'permission-denied') {
        errorMessage = 'Нет доступа к базе данных. Проверьте правила безопасности Firestore.'
      } else if (err.code === 'unavailable') {
        errorMessage = 'Сервис временно недоступен. Попробуйте позже.'
      } else if (err.message) {
        errorMessage = 'Ошибка удаления: ' + err.message
      }
      setError(errorMessage)
    }
  }, [currentUser, users])

  // Копирование в буфер обмена
  const handleCopy = useCallback(async (text) => {
    try {
      logger.debug('App', 'Копирование в буфер обмена', { textLength: text?.length || 0 })
      await navigator.clipboard.writeText(text)
      logger.info('App', 'Текст успешно скопирован в буфер обмена')
      setSuccess('Скопировано в буфер обмена')
      setTimeout(() => setSuccess(''), 2000)
    } catch (err) {
      logger.error('App', 'Ошибка копирования в буфер обмена', { textLength: text?.length || 0 }, err)
      setError('Ошибка копирования')
    }
  }, [])

  // Форматирование даты
  // formatDate теперь импортируется из shared/utils/formatDate.js


  // Обработчики для полей ввода (стабильные функции)
  const handleEmailChange = useCallback((e) => {
    setLoginData(prev => ({ ...prev, email: e.target.value }))
  }, [])

  const handlePasswordChange = useCallback((e) => {
    setLoginData(prev => ({ ...prev, password: e.target.value }))
  }, [])

  const handleNameChange = useCallback((e) => {
    setLoginData(prev => ({ ...prev, name: e.target.value }))
  }, [])

  const handleAuthModeLogin = useCallback(() => {
    setAuthMode('login')
    setError('')
    setSuccess('')
  }, [])

  const handleAuthModeRegister = useCallback(() => {
    console.log('🔄 Переключение на режим регистрации')
    setAuthMode('register')
    setError('')
    setSuccess('')
    console.log('🔄 authMode установлен в register')
  }, [])



  // Функция получения ключа (создание клиента в 3x-ui)
  const handleGetKey = useCallback(async () => {
    if (!db || !currentUser) {
      setError('База данных недоступна')
      return
    }

    // Проверка авторизации - пользователь должен быть авторизован через Firebase Auth
    if (!auth?.currentUser) {
      setError('Необходимо войти в систему для получения ключа.')
      setView('login')
        return
    }

    try {
      setError('')
      setSuccess('')
      console.log('🔑 Начинаем получение ключа...')
      
      // Используем dashboardService.getKey() который работает через Backend Proxy
      // Он использует subId из профиля и возвращает ссылку на подписку
      const subscriptionLink = await dashboardService.getKey(currentUser)
      console.log('✅ Ссылка на подписку получена через Backend Proxy:', subscriptionLink)

      // Обновляем локальное состояние - сохраняем ссылку на подписку
      const updatedUser = { 
        ...currentUser, 
        vpnLink: subscriptionLink,
        subscriptionLink: subscriptionLink // Явное поле для ссылки на подписку
      }
      setCurrentUser(updatedUser)
      setUsers(users.map(u => u.id === currentUser.id ? updatedUser : u))
      
      // Сохраняем ссылку на подписку в Firestore
      const userDoc = doc(db, `artifacts/${appId}/public/data/users_v4`, currentUser.id)
      await updateDoc(userDoc, {
        vpnLink: subscriptionLink,
        subscriptionLink: subscriptionLink,
        updatedAt: new Date().toISOString(),
      })
      
      logger.info('Auth', 'Ссылка на подписку успешно получена', { email: currentUser.email, subscriptionLink })
      setSuccess('Ссылка на подписку успешно получена! Скопируйте её в ваше VPN приложение.')
    } catch (err) {
      console.error('❌ Ошибка получения ключа:', err)
      logger.error('Auth', 'Ошибка получения ключа', { email: currentUser.email }, err)
      
      let errorMessage = 'Не удалось получить ключ. Попробуйте позже.'
      if (err.message) {
        if (err.message.includes('уже существует') || err.message.includes('already exists')) {
          errorMessage = 'Ключ уже существует. Обновите страницу.'
        } else if (err.message.includes('network') || err.message.includes('fetch')) {
          errorMessage = 'Ошибка сети при подключении к VPN панели. Проверьте настройки.'
        } else {
          errorMessage = 'Ошибка: ' + err.message
        }
      }
      setError(errorMessage)
    }
  }, [db, currentUser, users, auth])

  // Состояния для личного кабинета
  const [payments, setPayments] = useState([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [selectedTariff, setSelectedTariff] = useState(null)
  
  const [creatingSubscription, setCreatingSubscription] = useState(false)

  // Загрузка платежей пользователя
  // ВАЖНО: Фильтрация по userId обеспечивает изоляцию - каждый пользователь видит только свои платежи
  const loadPayments = useCallback(async () => {
    if (!db || !currentUser || !currentUser.id) return

    try {
      setPaymentsLoading(true)
      const paymentsCollection = collection(db, `artifacts/${appId}/public/data/payments`)
      // КРИТИЧНО: Фильтр по userId гарантирует, что пользователь видит только свои платежи
      const q = query(paymentsCollection, where('userId', '==', currentUser.id))
      const paymentsSnapshot = await getDocs(q)
      const paymentsList = []
      
      paymentsSnapshot.forEach((docSnapshot) => {
        paymentsList.push({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        })
      })
      
      // Сортируем по дате (новые сначала)
      paymentsList.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA
      })
      
      setPayments(paymentsList)
    } catch (err) {
      logger.error('Dashboard', 'Ошибка загрузки платежей', { userId: currentUser.id }, err)
    } finally {
      setPaymentsLoading(false)
    }
  }, [db, currentUser?.id])

  // Загрузка платежей при открытии вкладки
    useEffect(() => {
    if (dashboardTab === 'payments' && currentUser) {
      loadPayments()
    }
  }, [dashboardTab, currentUser?.id, loadPayments])

  // Инициализация данных профиля
  // ВАЖНО: Обновляем profileData только если НЕ редактируем профиль, чтобы не сбрасывать фокус
  useEffect(() => {
    if (currentUser && !editingProfile) {
      setProfileData({
        name: currentUser.name || '',
        phone: currentUser.phone || '',
      })
    }
  }, [currentUser?.id, currentUser?.name, currentUser?.phone, editingProfile]) // Используем только нужные поля

  // Мемоизированные обработчики для полей профиля
  const handleProfileNameChange = useCallback((e) => {
    // Не обрезаем пробелы при вводе, чтобы не мешать пользователю
    const newValue = e.target.value
    setProfileData(prev => ({ ...prev, name: newValue }))
  }, [])

  const handleProfilePhoneChange = useCallback((e) => {
    // Не обрезаем пробелы при вводе, чтобы не мешать пользователю
    const newValue = e.target.value
    setProfileData(prev => ({ ...prev, phone: newValue }))
  }, [])

  // Обновление профиля
  // ВАЖНО: Пользователь может обновлять только свой профиль (изоляция данных)
  const handleUpdateProfile = useCallback(async () => {
    if (!db || !currentUser) return

    // Дополнительная проверка безопасности: убеждаемся, что обновляется только свой профиль
    if (!currentUser.id) {
      setError('Ошибка: не указан ID пользователя')
          return
        }

        try {
      setError('')
      // ВАЖНО: Используем currentUser.id для изоляции - каждый пользователь может обновлять только свои данные
      const userDoc = doc(db, `artifacts/${appId}/public/data/users_v4`, currentUser.id)
      await updateDoc(userDoc, {
        name: profileData.name.trim(),
        phone: profileData.phone.trim(),
        updatedAt: new Date().toISOString(),
      })

      // Обновляем локальное состояние
      const updatedUser = { ...currentUser, name: profileData.name.trim(), phone: profileData.phone.trim() }
      setCurrentUser(updatedUser)
      setUsers(users.map(u => u.id === currentUser.id ? updatedUser : u))
      
      setEditingProfile(false)
      setSuccess('Профиль успешно обновлен')
      setTimeout(() => setSuccess(''), 3000)
      logger.info('Dashboard', 'Профиль обновлен', { userId: currentUser.id })
        } catch (err) {
      logger.error('Dashboard', 'Ошибка обновления профиля', { userId: currentUser.id }, err)
      setError('Ошибка обновления профиля')
    }
  }, [db, currentUser?.id, profileData, users])

  // Удаление аккаунта
  // ВАЖНО: Пользователь может удалить только свой аккаунт (изоляция и безопасность)
  const handleDeleteAccount = useCallback(async () => {
    if (!db || !currentUser || !currentUser.id) return

    // Дополнительная проверка безопасности
    if (!currentUser.id) {
      setError('Ошибка: не указан ID пользователя')
      return
    }

    const confirmText = 'УДАЛИТЬ'
    const userInput = window.prompt(
      `Вы уверены, что хотите удалить свой аккаунт? Это действие необратимо.\n\n` +
      `Все ваши данные будут удалены, включая подписку и историю платежей.\n\n` +
      `Введите "${confirmText}" для подтверждения:`
    )

    if (userInput !== confirmText) {
          return
        }

        try {
      setError('')
      
      // Удаляем клиента из 3x-ui, если есть UUID
      if (currentUser.uuid) {
        try {
          const inboundId = import.meta.env.VITE_XUI_INBOUND_ID
          if (inboundId) {
            await ThreeXUI.deleteClient(inboundId, currentUser.email)
            logger.info('Dashboard', 'Клиент удален из 3x-ui', { email: currentUser.email })
          }
        } catch (err) {
          logger.warn('Dashboard', 'Ошибка удаления клиента из 3x-ui', { email: currentUser.email }, err)
          // Продолжаем удаление даже если не удалось удалить из 3x-ui
        }
      }

      // ВАЖНО: Удаляем только документ текущего пользователя (изоляция данных)
      // Каждый пользователь может удалить только свой аккаунт - это гарантирует полную изоляцию
      const userDoc = doc(db, `artifacts/${appId}/public/data/users_v4`, currentUser.id)
      await deleteDoc(userDoc)
      logger.info('Dashboard', 'Документ пользователя удален из Firestore', { 
        userId: currentUser.id,
        message: 'Данные пользователя изолированы и удалены'
      })

      // ВАЖНО: Удаляем только платежи текущего пользователя (изоляция данных)
      // Фильтр по userId гарантирует, что удаляются только платежи этого пользователя
      const paymentsCollection = collection(db, `artifacts/${appId}/public/data/payments`)
      const q = query(paymentsCollection, where('userId', '==', currentUser.id))
      const paymentsSnapshot = await getDocs(q)
      const deletePromises = []
      paymentsSnapshot.forEach((docSnapshot) => {
        deletePromises.push(deleteDoc(doc(db, `artifacts/${appId}/public/data/payments`, docSnapshot.id)))
      })
      await Promise.all(deletePromises)

      logger.info('Dashboard', 'Аккаунт удален', { userId: currentUser.id, email: currentUser.email })
      
      // Выходим из системы
      handleLogout()
      setSuccess('Аккаунт успешно удален')
    } catch (err) {
      logger.error('Dashboard', 'Ошибка удаления аккаунта', { userId: currentUser.id }, err)
      setError('Ошибка удаления аккаунта')
    }
  }, [db, currentUser?.id, handleLogout])

  // Оформление подписки (создание клиента в 3x-ui)
  const handleCreateSubscription = useCallback(async (tariff, devices = null, natrockPort = null, periodMonths = 1, testPeriod = false, paymentMode = 'pay_now', discount = 0) => {
    console.log('🎯 App.handleCreateSubscription вызван с параметрами:', {
      tariffName: tariff?.name,
      tariffId: tariff?.id,
      devices,
      natrockPort,
      periodMonths,
      testPeriod,
      paymentMode,
      discount,
      hasDb: !!db,
      hasCurrentUser: !!currentUser,
      currentUserId: currentUser?.id
    })

    if (!db) {
      console.error('❌ App.handleCreateSubscription: db не доступен')
      const error = new Error('База данных недоступна')
      setError(error.message)
      throw error // Бросаем ошибку вместо return
    }

    if (!currentUser) {
      console.error('❌ App.handleCreateSubscription: currentUser не определен')
      const error = new Error('Пользователь не авторизован')
      setError(error.message)
      throw error // Бросаем ошибку вместо return
    }

    if (!tariff) {
      console.error('❌ App.handleCreateSubscription: tariff не передан')
      const error = new Error('Тариф не выбран')
      setError(error.message)
      throw error // Бросаем ошибку вместо return
    }

    try {
      console.log('🔄 App.handleCreateSubscription: Начинаем создание подписки...')
      setCreatingSubscription(true)
      setError('')
      setSuccess('')

      console.log('📤 App.handleCreateSubscription: Вызов dashboardService.createSubscription...')
      
      // Используем dashboardService.createSubscription() который работает через Backend Proxy
      // Он использует UUID из профиля, данные тарифа и сохраненную сессию
      const updatedData = await dashboardService.createSubscription(
        currentUser, 
        tariff, 
        devices, 
        natrockPort, 
        periodMonths, 
        testPeriod, 
        paymentMode, 
        discount
      )
      
      console.log('✅ App.handleCreateSubscription: dashboardService.createSubscription вернул данные:', {
        hasUpdatedData: !!updatedData,
        uuid: updatedData?.uuid,
        tariffName: updatedData?.tariffName,
        devices: updatedData?.devices,
        periodMonths: updatedData?.periodMonths,
        paymentStatus: updatedData?.paymentStatus,
        hasVpnLink: !!updatedData?.vpnLink,
        hasPaymentUrl: !!updatedData?.paymentUrl,
        requiresPayment: updatedData?.requiresPayment,
        allKeys: updatedData ? Object.keys(updatedData) : []
      })
      
      if (!updatedData) {
        console.error('❌ App.handleCreateSubscription: dashboardService.createSubscription вернул undefined')
        throw new Error('Не удалось создать подписку: сервис не вернул данные')
      }
      
      // Если результат содержит ссылку на оплату, возвращаем её БЕЗ создания подписки
      if (updatedData && updatedData.paymentUrl && updatedData.requiresPayment) {
        return {
          paymentUrl: updatedData.paymentUrl,
          orderId: updatedData.orderId,
          amount: updatedData.amount,
          requiresPayment: true,
          message: updatedData.message || 'Требуется оплата для активации подписки',
          tariffName: updatedData.tariffName || tariff?.name,
          tariffId: updatedData.tariffId || tariff?.id,
          devices: updatedData.devices || devices || 1,
          periodMonths: updatedData.periodMonths || periodMonths || 1,
          discount: updatedData.discount || discount || 0
        }
      }
      
      // Если мы дошли до этого места, подписка была создана успешно
      // ВАЖНО: Если paymentMode === 'pay_now' и testPeriod === false, то платеж уже оплачен
      // Устанавливаем paymentStatus в 'paid', даже если updatedData.paymentStatus не установлен
      const finalPaymentStatus = (paymentMode === 'pay_now' && !testPeriod) 
        ? 'paid' 
        : (updatedData.paymentStatus || currentUser.paymentStatus || 'pending')
      
      logger.info('Dashboard', 'Подписка создана через Backend Proxy', { 
        email: currentUser.email,
        uuid: updatedData.uuid,
        tariffId: tariff.id,
        devices: updatedData.devices || devices,
        periodMonths: updatedData.periodMonths || periodMonths,
        paymentStatus: finalPaymentStatus,
        paymentMode: paymentMode,
        testPeriod: testPeriod
      })
      
      // Обновляем локальное состояние с данными от n8n
      // ВАЖНО: Используем переданные параметры (devices, periodMonths) с приоритетом над currentUser,
      // чтобы после успешной оплаты подписка обновилась с правильными параметрами
      // ВАЖНО: expiresAt должен быть из updatedData, если он есть (даже если это timestamp число)
      const updatedUser = {
        ...currentUser,
        uuid: updatedData.uuid || currentUser.uuid,
        plan: updatedData.plan || currentUser.plan,
        // ВАЖНО: После успешной оплаты expiresAt должен быть пересчитан от текущей даты + период
        // Если updatedData.expiresAt есть (даже если это timestamp), используем его
        // Если нет, но период оплачен (pay_now), вычисляем от текущей даты
        expiresAt: updatedData.expiresAt !== undefined && updatedData.expiresAt !== null 
          ? updatedData.expiresAt 
          : (paymentMode === 'pay_now' && !testPeriod 
              ? (Date.now() + (periodMonths * 30 * 24 * 60 * 60 * 1000))
              : currentUser.expiresAt),
        tariffName: updatedData.tariffName || currentUser.tariffName || tariff.name,
        tariffId: updatedData.tariffId || currentUser.tariffId || tariff.id,
        devices: updatedData.devices || devices || currentUser.devices || 1,
        natrockPort: updatedData.natrockPort || natrockPort || currentUser.natrockPort || null,
        periodMonths: updatedData.periodMonths || periodMonths || currentUser.periodMonths || 1,
        paymentStatus: finalPaymentStatus, // Используем вычисленный статус оплаты
        testPeriodStartDate: updatedData.testPeriodStartDate || null,
        testPeriodEndDate: updatedData.testPeriodEndDate || null,
        discount: updatedData.discount || discount || currentUser.discount || 0,
        vpnLink: updatedData.vpnLink || currentUser.vpnLink || null,
        updatedAt: new Date().toISOString(),
      }
      
      logger.info('Dashboard', 'Обновление данных пользователя после создания подписки', {
        userId: currentUser.id,
        expiresAt: updatedUser.expiresAt ? new Date(updatedUser.expiresAt).toISOString() : null,
        paymentStatus: updatedUser.paymentStatus,
        periodMonths: updatedUser.periodMonths,
        devices: updatedUser.devices,
        paymentMode: paymentMode,
        testPeriod: testPeriod
      })
      
      // Сохраняем обновленные данные в Firestore
      try {
        const userDoc = doc(db, `artifacts/${appId}/public/data/users_v4`, currentUser.id)
        await updateDoc(userDoc, {
          ...updatedUser,
          updatedAt: new Date().toISOString(),
        })
        logger.info('Dashboard', 'Данные пользователя обновлены в Firestore после создания подписки', {
          userId: currentUser.id,
          tariffId: updatedUser.tariffId,
          devices: updatedUser.devices,
          periodMonths: updatedUser.periodMonths,
        })
      } catch (err) {
        logger.warn('Dashboard', 'Не удалось обновить данные пользователя в Firestore', { userId: currentUser.id }, err)
        // Продолжаем работу, даже если не удалось сохранить в Firestore
      }
      
      setCurrentUser(updatedUser)
      setUsers(users.map(u => u.id === currentUser.id ? updatedUser : u))
      
      setSelectedTariff(null)
      
      // Возвращаем данные, включая ссылку VPN и детали подписки
      return {
        vpnLink: updatedData.vpnLink || null,
        uuid: updatedData.uuid,
        tariffName: updatedUser.tariffName,
        devices: updatedUser.devices,
        periodMonths: updatedUser.periodMonths,
        expiresAt: updatedUser.expiresAt,
        paymentStatus: updatedUser.paymentStatus,
        testPeriod: updatedUser.testPeriodEndDate ? true : false,
      }
    } catch (err) {
      console.error('❌ App.handleCreateSubscription: ОШИБКА в блоке catch:', {
        errorMessage: err.message,
        errorType: err.constructor.name,
        errorStack: err.stack,
        errorResponse: err.response?.data,
        errorStatus: err.response?.status
      })
      
      logger.error('Dashboard', 'Ошибка оформления подписки', { 
        email: currentUser?.email,
        tariffId: tariff?.id,
        errorStatus: err.response?.status,
        errorMessage: err.message
      }, err)
      
      let errorMessage = 'Не удалось оформить подписку. Попробуйте позже.'
      if (err.message) {
        if (err.message.includes('уже существует') || err.message.includes('already exists')) {
          errorMessage = 'У вас уже есть активная подписка. Обновите страницу.'
        } else if (err.message.includes('404') || err.message.includes('Not Found')) {
          errorMessage = 'Не удалось подключиться к панели VPN. Проверьте настройки XUI_HOST и прокси в vite.config.js'
        } else if (err.message.includes('ECONNREFUSED') || err.message.includes('Backend Proxy')) {
          errorMessage = 'Backend Proxy недоступен. Убедитесь, что сервер запущен на http://localhost:3001'
        } else if (err.message.includes('not registered') || err.message.includes('webhook')) {
          errorMessage = 'Webhook не зарегистрирован в n8n. Проверьте, что workflow активен и webhook настроен правильно. Обратитесь к администратору.'
        } else if (err.message.includes('XUI_HOST') || err.message.includes('прокси')) {
          errorMessage = err.message
        } else if (err.message.includes('не найден') || err.message.includes('not found')) {
          errorMessage = `Ошибка: ${err.message}. Проверьте правильность VITE_XUI_INBOUND_ID.`
        } else {
          errorMessage = 'Ошибка: ' + err.message
        }
      } else if (err.response?.status === 404) {
        errorMessage = 'Панель VPN недоступна (404). Проверьте настройки XUI_HOST и прокси.'
      }
      setError(errorMessage)
      throw err
    } finally {
      setCreatingSubscription(false)
    }
  }, [db, currentUser?.id, users, tariffs])

  // Продление подписки
  const handleRenewSubscription = useCallback(async () => {
    if (!currentUser || !currentUser.tariffId) {
      setError('Не найдена информация о текущем тарифе')
      return
    }

    // Находим тариф
    const tariff = tariffs.find(t => t.id === currentUser.tariffId)
    if (!tariff) {
      setError('Тариф не найден')
      return
    }

    const devices = currentUser.devices ?? tariff?.devices ?? 1
    const periodMonths = currentUser.periodMonths ?? 1
    const discount = currentUser.discount ?? 0
    return await handleCreateSubscription(tariff, devices, currentUser.natrockPort ?? null, periodMonths, false, 'pay_now', discount)
  }, [currentUser?.id, currentUser?.devices, currentUser?.periodMonths, currentUser?.natrockPort, currentUser?.discount, tariffs, handleCreateSubscription])

  // Обновление данных пользователя после успешной оплаты (чтобы статус подписки обновился без перезагрузки)
  const onRefreshUserAfterPayment = useCallback(async () => {
    if (!currentUser?.id) return
    try {
      const userData = await loadUserData(currentUser.id)
      if (userData) setCurrentUser(userData)
    } catch (e) {
      logger.warn('App', 'Не удалось обновить пользователя после оплаты', null, e)
    }
  }, [currentUser?.id, loadUserData, setCurrentUser])

  // Удаление/отмена подписки
  const handleDeleteSubscription = useCallback(async () => {
    if (!db || !currentUser) {
      setError('Недостаточно данных для удаления подписки')
      return
    }

    if (!currentUser.uuid) {
      setError('У вас нет активной подписки для удаления')
      return
    }

    try {
      setCreatingSubscription(true)
      setError('')
      setSuccess('')

      const { dashboardService } = await import('../features/dashboard/services/dashboardService.js')
      const result = await dashboardService.deleteSubscription(currentUser)

      // Обновляем локальное состояние пользователя
      // ВАЖНО: subId сохраняется, так как это постоянный идентификатор пользователя
      const updatedUser = {
        ...currentUser,
        uuid: null,
        plan: null,
        expiresAt: null,
        tariffName: null,
        tariffId: null,
        devices: null,
        natrockPort: null,
        periodMonths: null,
        paymentStatus: null,
        testPeriodStartDate: null,
        testPeriodEndDate: null,
        unpaidStartDate: null, // Очищаем дату начала неоплаты
        discount: null,
        vpnLink: null,
        // subId не удаляется - остается постоянным идентификатором
        updatedAt: new Date().toISOString(),
      }

      // Сохраняем обновленные данные в Firestore
      const userDoc = doc(db, `artifacts/${appId}/public/data/users_v4`, currentUser.id)
      await updateDoc(userDoc, updatedUser)

      setCurrentUser(updatedUser)
      setUsers(users.map(u => u.id === currentUser.id ? updatedUser : u))

      // Показываем сообщение с предупреждением, если оно есть
      if (result.warning) {
        setSuccess(result.message)
        setError(result.warning)
        setTimeout(() => {
          setSuccess('')
          setError('')
        }, 8000)
      } else {
        setSuccess(result.message || 'Подписка успешно отменена')
        setTimeout(() => setSuccess(''), 5000)
      }
    } catch (err) {
      logger.error('Dashboard', 'Ошибка удаления подписки', {
        userId: currentUser?.id,
        email: currentUser?.email
      }, err)

      let errorMessage = 'Не удалось отменить подписку. Попробуйте позже.'
      if (err.message) {
        if (err.message.includes('Backend Proxy')) {
          errorMessage = err.message
        } else if (err.message.includes('Unused Respond to Webhook') || err.message.includes('workflow')) {
          errorMessage = 'Ошибка настройки workflow в n8n. Обратитесь к администратору для проверки workflow удаления клиента. Технические детали: ' + err.message
        } else if (err.message.includes('webhook') || err.message.includes('not registered')) {
          errorMessage = 'Webhook для удаления клиента не настроен. Обратитесь к администратору.'
        } else {
          errorMessage = 'Ошибка: ' + err.message
        }
      }
      setError(errorMessage)
    } finally {
      setCreatingSubscription(false)
    }
  }, [db, currentUser?.id, users, appId])

  // Загрузка платежей при открытии вкладки
    useEffect(() => {
    if (dashboardTab === 'payments' && currentUser) {
      loadPayments()
    }
  }, [dashboardTab, currentUser?.id, loadPayments])

  // Старое определение Dashboard удалено - компонент вынесен наружу

  // Загрузка тарифов из Firestore
  // Загрузка тарифов из Firestore
  const loadTariffs = useCallback(async () => {
    if (!db) return

    try {
      const tariffsCollection = collection(db, `artifacts/${appId}/public/data/tariffs`)
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

  // Загрузка данных при открытии админ-панели или раздела «Финансы»
  // ВАЖНО: Используем useRef для отслеживания, чтобы не перезагружать данные при каждом рендере
  const adminPanelLoadedRef = useRef(false)
  const financesLoadedRef = useRef(false)
  useEffect(() => {
    if (view === 'admin' && canAccessAdmin(currentUser?.role)) {
      if (!adminPanelLoadedRef.current) {
        logger.info('Admin', 'Загрузка глобальных данных для админ-панели', { adminId: currentUser.id })
        loadUsers()
        loadSettings()
        loadTariffs()
        adminPanelLoadedRef.current = true
      }
      financesLoadedRef.current = false
    } else if (view === 'finances' && canAccessFinances(currentUser?.role)) {
      if (!financesLoadedRef.current) {
        logger.info('Admin', 'Загрузка данных для раздела Финансы', { userId: currentUser.id })
        loadUsers()
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
  }, [view, currentUser?.role, currentUser?.id, loadUsers, loadSettings, loadTariffs, tariffs.length])

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

  // Обработчики для изменения ссылок на приложения HAPP Proxy
  const handleAppLinkChange = useCallback((platform, value) => {
    setSettings(prev => {
      if (!prev) return null
      return {
        ...prev,
        appLinks: {
          ...(prev.appLinks || { android: '', ios: '', macos: '', windows: '' }),
          [platform]: value,
        },
      }
    })
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
      const settingsDoc = doc(db, `artifacts/${appId}/public/settings`)
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
      
      const settingsDoc = doc(db, `artifacts/${appId}/public/settings`)
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
      
      const settingsDoc = doc(db, `artifacts/${appId}/public/settings`)
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
      currentServerXuiUsername: currentServer.xuiUsername || 'НЕТ',
      currentServerXuiPasswordLength: currentServer.xuiPassword ? currentServer.xuiPassword.length : 0,
      passedServerHasXuiUsername: !!server.xuiUsername,
      passedServerHasXuiPassword: !!server.xuiPassword,
      passedServerXuiUsername: server.xuiUsername || 'НЕТ',
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
      
      // Детальное логирование для диагностики
      logger.info('Admin', '🔍 Получение данных сессии 3x-ui - проверка credentials', { 
        serverId: server.id, 
        serverName: server.name,
        hasXuiUsername: !!server.xuiUsername,
        hasXuiPassword: !!server.xuiPassword,
        usernameValue: username || 'ПУСТО',
        usernameLength: username.length,
        passwordLength: password.length,
        passwordPreview: password ? '***' : 'ПУСТО',
        usernamePreview: username ? `${username.substring(0, Math.min(3, username.length))}***` : 'ПУСТО',
        usernameRaw: server.xuiUsername, // Сырое значение до trim
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
      
      // Логируем payload для диагностики (пароль маскируем)
      logger.debug('Admin', '📤 Payload запроса на получение данных', {
        serverId: server.id,
        serverName: server.name,
        ...requestPayload,
        password: '***', // Маскируем пароль в логах
        passwordLength: password.length,
        usernameLength: username.length
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
        // ВАЖНО: Логируем credentials, которые были использованы в запросе
        credentialsUsed: {
          username: username,
          usernameLength: username.length,
          passwordLength: password.length,
          source: 'server.xuiUsername и server.xuiPassword'
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
                const appId = import.meta.env.VITE_FIREBASE_APP_ID || 'default'
                const settingsDoc = doc(db, `artifacts/${appId}/public/data/settings_v4`, currentUser.id)
                
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
      const userDoc = doc(db, `artifacts/${appId}/public/data/users_v4`, userId)
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

  const handleTariffSubscriptionLinkChange = useCallback((e) => {
    const newValue = e.target.value
    setEditingTariff(prev => prev ? { ...prev, subscriptionLink: newValue } : null)
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
        const tariffDoc = doc(db, `artifacts/${appId}/public/data/tariffs`, editingTariff.id)
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
      const tariffDoc = doc(db, `artifacts/${appId}/public/data/tariffs`, tariffId)
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
      <LoginForm
        authMode={authMode}
        loginData={loginData}
        error={error}
        success={success}
        onEmailChange={handleEmailChange}
        onPasswordChange={handlePasswordChange}
        onNameChange={handleNameChange}
        onAuthModeLogin={handleAuthModeLogin}
        onAuthModeRegister={handleAuthModeRegister}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onGoogleSignIn={handleGoogleSignIn}
        googleSignInLoading={googleSignInLoading}
        onSetView={setView}
      />
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
        <SidebarNav
          currentUser={currentUser}
          view="finances"
          onSetView={setView}
          onLogout={handleLogout}
        />
        <div className="flex-1 w-full min-w-0 p-3 sm:p-4 md:p-6 lg:pl-0 pt-14 sm:pt-16 lg:pt-4 lg:pt-6 pb-24 lg:pb-6 overflow-y-auto">
          <div className="w-full max-w-[90rem] mx-auto">
            <FinancesDashboard users={users} tariffs={tariffs} formatDate={formatDate} currentUser={currentUser} />
          </div>
          <Footer />
        </div>
      </div>
    )
  }

  // Если пользователь в админ-панели
  // ВАЖНО: Двойная проверка доступа - защита от несанкционированного доступа
  if (view === 'admin') {
    // Не монтируем админку до завершения проверки auth (после redirect и т.п.) — иначе useAdmin/контекст могут получить неготовые зависимости
    if (authChecking) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4" />
            <p className="text-slate-400">Загрузка...</p>
          </div>
        </div>
      )
    }
    // Доступ к админ-панели только у роли admin
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
      <AdminViewWithContext
        currentUser={currentUser}
        users={users}
        setUsers={setUsers}
        setCurrentUser={setCurrentUser}
        tariffs={tariffs}
        setTariffs={setTariffs}
        setError={setError}
        setSuccess={setSuccess}
        adminTab={adminTab}
        setAdminTab={setAdminTab}
      >
        <AdminPanel
          currentUser={currentUser}
          adminTab={adminTab}
          onSetAdminTab={setAdminTab}
          onSetView={setView}
          onHandleLogout={handleLogout}
          users={users}
          editingUser={editingUser}
          onSetEditingUser={setEditingUser}
          onHandleUpdateUser={handleUpdateUser}
          onHandleDeleteUser={handleDeleteUser}
          onHandleCopy={handleCopy}
          servers={servers}
          editingServer={editingServer}
          onSetEditingServer={setEditingServer}
          onHandleAddServer={handleAddServer}
          onHandleSaveServer={handleSaveServer}
          onHandleDeleteServer={handleDeleteServer}
          onHandleTestServerSession={handleTestServerSession}
          testingServerId={testingServerId}
          newServerIdRef={newServerIdRef}
          settingsLoading={settingsLoading}
          tariffs={tariffs}
          editingTariff={editingTariff}
          onSetEditingTariff={setEditingTariff}
          onHandleSaveTariff={handleSaveTariff}
          onHandleDeleteTariff={handleDeleteTariff}
          onHandleSaveSettings={handleSaveSettings}
          formatDate={formatDate}
          showLogger={showLogger}
          onSetShowLogger={setShowLogger}
          success={success}
          error={error}
          onHandleServerNameChange={handleServerNameChange}
          onHandleServerIPChange={handleServerIPChange}
          onHandleServerPortChange={handleServerPortChange}
          onHandleServerProtocolChange={handleServerProtocolChange}
          onHandleServerRandomPathChange={handleServerRandomPathChange}
          onHandleServerRandomPathBlur={handleServerRandomPathBlur}
          onHandleServerUsernameChange={handleServerUsernameChange}
          onHandleServerPasswordChange={handleServerPasswordChange}
          onHandleServerInboundIdChange={handleServerInboundIdChange}
          onHandleServerLocationChange={handleServerLocationChange}
          onHandleServerActiveChange={handleServerActiveChange}
          onHandleServerTariffChange={handleServerTariffChange}
          onHandleTariffNameChange={handleTariffNameChange}
          onHandleTariffPlanChange={handleTariffPlanChange}
          onHandleTariffPriceChange={handleTariffPriceChange}
          onHandleTariffDevicesChange={handleTariffDevicesChange}
          onHandleTariffTrafficGBChange={handleTariffTrafficGBChange}
          onHandleTariffDurationDaysChange={handleTariffDurationDaysChange}
          onHandleTariffActiveChange={handleTariffActiveChange}
          onHandleTariffSubscriptionLinkChange={handleTariffSubscriptionLinkChange}
          settings={settings}
          onHandleAppLinkChange={handleAppLinkChange}
        />
      </AdminViewWithContext>
    )
  }

  // Личный кабинет пользователя
  // ВАЖНО: Полная изоляция данных - каждый пользователь видит только свои данные
  // Все запросы фильтруются по currentUser.id (userId)
  if (currentUser && (view === 'dashboard' || !view || view === 'landing')) {
    // Если пользователь админ, но view не 'admin' - показываем личный кабинет
    // Админы тоже имеют личный кабинет со своими данными
    return (
      <Dashboard
        currentUser={currentUser}
        view={view}
        onSetView={setView}
        onLogout={handleLogout}
        tariffs={tariffs}
        loadTariffs={loadTariffs}
        dashboardTab={dashboardTab}
        onSetDashboardTab={setDashboardTab}
        editingProfile={editingProfile}
        onSetEditingProfile={setEditingProfile}
        profileData={profileData}
        onSetProfileData={setProfileData}
        creatingSubscription={creatingSubscription}
        onHandleCreateSubscription={handleCreateSubscription}
        onHandleRenewSubscription={handleRenewSubscription}
        onHandleDeleteSubscription={handleDeleteSubscription}
        onRefreshUserAfterPayment={onRefreshUserAfterPayment}
        onHandleUpdateProfile={handleUpdateProfile}
        onHandleDeleteAccount={handleDeleteAccount}
        onProfileNameChange={handleProfileNameChange}
        onProfilePhoneChange={handleProfilePhoneChange}
        payments={payments}
        paymentsLoading={paymentsLoading}
        loadPayments={loadPayments}
        formatDate={formatDate}
        formatTraffic={formatTraffic}
        settings={settings}
        onCopy={handleCopy}
        showKeyModal={showKeyModal}
        onSetShowKeyModal={setShowKeyModal}
        showLogger={showLogger}
        onSetShowLogger={setShowLogger}
        onGetKey={handleGetKey}
        servers={servers}
      />
    )
  }

  // Показываем loading экран, пока проверяется авторизация
  if (authChecking || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-slate-400 text-sm">Загрузка...</p>
        </div>
      </div>
    )
  }

  // По умолчанию показываем landing
  return <LandingPage onSetView={setView} />
}

