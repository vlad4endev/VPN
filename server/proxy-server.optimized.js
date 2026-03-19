/**
 * Production Proxy Server для 3x-ui API (ОПТИМИЗИРОВАННАЯ ВЕРСИЯ)
 * 
 * ОПТИМИЗАЦИИ:
 * 1. ✅ Убраны синхронные операции (fs.existsSync → fs.promises.access)
 * 2. ✅ Добавлено кэширование API запросов (GET запросы кэшируются на 30 секунд)
 * 3. ✅ Добавлено кэширование сессий авторизации (TTL 1 час)
 * 4. ✅ Поддержка cluster mode для многопоточности
 * 5. ✅ Оптимизирована работа со статическими файлами
 * 
 * Использование:
 *   node server/proxy-server.optimized.js
 * 
 * Или через PM2:
 *   pm2 start server/proxy-server.optimized.js --name xui-proxy
 */

import express from 'express'
import axios from 'axios'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import { cache } from './cache.js'
import { startCluster, getWorkerInfo } from './cluster.js'
import { getXuiClient } from './lib/xuiClient.js'

// Загружаем переменные окружения
dotenv.config()

// ========== Функция создания приложения ==========
// Вынесена в отдельную функцию для поддержки cluster mode

async function createApp() {
  const app = express()

  // ========== Безопасность ==========

  // Helmet для базовых заголовков безопасности
  app.use(helmet({
    hsts: {
      maxAge: 31536000, // 1 год
      includeSubDomains: true,
      preload: true
    },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Для CSS-in-JS библиотек
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          // Добавляем XUI_HOST если указан (может быть HTTP для внутренних подключений)
          ...(process.env.XUI_HOST ? [process.env.XUI_HOST] : []),
          // Добавляем FRONTEND_URL если указан
          ...(process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL 
            ? [process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL] 
            : []),
          // В development разрешаем все для удобства
          ...(process.env.NODE_ENV !== 'production' ? ['*'] : [])
        ],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      }
    },
    crossOriginEmbedderPolicy: false, // Может ломать некоторые библиотеки
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }))

  // Принудительное HTTPS в production
  if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
      // Проверяем HTTPS через несколько способов (для разных конфигураций)
      const isSecure = 
        req.secure || // Прямое HTTPS соединение
        req.headers['x-forwarded-proto'] === 'https' || // За nginx/proxy
        req.headers['x-forwarded-ssl'] === 'on' // Альтернативный заголовок
      
      if (!isSecure) {
        const host = req.headers.host || 'localhost'
        return res.redirect(301, `https://${host}${req.url}`)
      }
      next()
    })
  }

  // CORS конфигурация с безопасной проверкой origin
  const getAllowedOrigins = () => {
    if (process.env.NODE_ENV === 'production') {
      // В production используем whitelist из переменных окружения
      const origins = []
      
      // Добавляем origins из ALLOWED_ORIGINS
      if (process.env.ALLOWED_ORIGINS) {
        const parsedOrigins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(o => o)
        origins.push(...parsedOrigins)
      }
      
      // Добавляем FRONTEND_URL если указан
      const frontendUrl = process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL
      if (frontendUrl && !origins.includes(frontendUrl)) {
        origins.push(frontendUrl)
      }
      
      // В production всегда должен быть хотя бы один origin
      if (origins.length === 0) {
        console.warn('⚠️ WARNING: No ALLOWED_ORIGINS specified in production! CORS will be restrictive.')
      }
      
      return origins
    } else {
      // В development разрешаем localhost
      return [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000'
      ]
    }
  }

  const allowedOrigins = getAllowedOrigins()

  app.use(cors({
    origin: (origin, callback) => {
      // Разрешаем запросы без origin (например, Postman, мобильные приложения, server-to-server)
      if (!origin) {
        return callback(null, true)
      }
      
      // В production проверяем whitelist строго
      if (process.env.NODE_ENV === 'production') {
        if (allowedOrigins.length === 0) {
          // Если origins не указаны в production, блокируем все
          console.warn(`🚫 CORS blocked: No allowed origins configured in production`)
          return callback(new Error('CORS: No allowed origins configured'))
        }
        if (allowedOrigins.includes(origin)) {
          callback(null, true)
        } else {
          console.warn(`🚫 CORS blocked origin: ${origin}`)
          callback(new Error('Not allowed by CORS'))
        }
      } else {
        // В development разрешаем если в списке или список пуст (для гибкости)
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
          callback(null, true)
        } else {
          console.warn(`🚫 CORS blocked origin: ${origin}`)
          callback(new Error('Not allowed by CORS'))
        }
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Session-Id'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    maxAge: 86400 // 24 часа для preflight кэша
  }))

  // Дополнительная проверка CORS для production
  if (process.env.NODE_ENV === 'production' && allowedOrigins.length > 0) {
    app.use((req, res, next) => {
      const origin = req.headers.origin
      
      if (origin && !allowedOrigins.includes(origin)) {
        console.warn(`🚫 Blocked request from unauthorized origin: ${origin}`)
        return res.status(403).json({
          success: false,
          msg: 'Forbidden: Origin not allowed'
        })
      }
      next()
    })
  }

  // ========== Middleware ==========
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))
  app.use(cookieParser())

  // Логирование запросов (оптимизировано)
  app.use((req, res, next) => {
    const workerInfo = getWorkerInfo()
    const workerPrefix = workerInfo.isWorker ? `[Worker ${workerInfo.workerId}] ` : ''
    console.log(`${workerPrefix}[${new Date().toISOString()}] ${req.method} ${req.path}`)
    next()
  })

  // Health check endpoint (с информацией о worker)
  app.get('/health', (req, res) => {
    const workerInfo = getWorkerInfo()
    res.json({
      status: 'ok',
      service: 'xui-proxy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      worker: workerInfo,
      cache: cache.getStats()
    })
  })

  // Прокси для всех запросов к 3x-ui через модуль server/lib/xuiClient.js
  // ОПТИМИЗАЦИЯ: кэширование GET-ответов на 30 сек
  app.all('/api/xui/*', async (req, res) => {
    try {
      const xui = getXuiClient()
      if (!xui.configured) {
        return res.status(500).json({
          success: false,
          msg: 'XUI_HOST не настроен в переменных окружения'
        })
      }

      const xuiPath = req.path.replace('/api/xui', '')
      const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''
      const pathWithQuery = xuiPath + queryString

      if (req.method === 'GET') {
        const cacheKey = `xui_api_${req.path}_${req.url}`
        const cached = cache.get(cacheKey)
        if (cached) {
          console.log(`💾 Cache HIT: ${req.path}`)
          return res.status(cached.status).json(cached.data)
        }
      }

      console.log(`🔄 Proxy (xuiClient): ${req.method} ${req.path} → ${xui.baseUrl}${pathWithQuery}`)

      const result = await xui.requestRaw(req.method, pathWithQuery, {
        body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined
      })

      if (req.method === 'GET' && result.status === 200) {
        const cacheKey = `xui_api_${req.path}_${req.url}`
        cache.set(cacheKey, { status: result.status, data: result.data }, 30)
      }

      const setCookie = result.headers['set-cookie']
      if (setCookie) {
        const cookies = Array.isArray(setCookie) ? setCookie : [setCookie]
        cookies.forEach(c => res.setHeader('Set-Cookie', c))
      }

      res.status(result.status).json(result.data)
    } catch (error) {
      console.error('❌ Proxy error:', error.message)
      const statusCode = error.response?.status || 500
      const errorMessage = error.response?.data?.msg || error.message || 'Proxy server error'
      res.status(statusCode).json({
        success: false,
        msg: errorMessage,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    }
  })

  // Прокси для тестирования сессии (специальный endpoint)
  app.post('/api/test-session', async (req, res) => {
    try {
      const { serverIP, serverPort, protocol, randompath, username, password } = req.body

      if (!serverIP || !serverPort) {
        return res.status(400).json({
          success: false,
          msg: 'serverIP и serverPort обязательны'
        })
      }

      // Формируем URL
      const normalizedPath = randompath 
        ? `/${randompath.replace(/^\/+|\/+$/g, '')}` 
        : ''
      const baseUrl = `${protocol || 'http'}://${serverIP}:${serverPort}${normalizedPath}`.replace(/\/+$/, '')
      const loginUrl = `${baseUrl}/login`

      console.log(`🔄 Test Session: POST ${loginUrl}`)

      // Выполняем запрос логина
      const response = await axios.post(loginUrl, {
        username: username || '',
        password: password || ''
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        validateStatus: () => true,
        timeout: 10000
      })

      let sessionCookie = null
      const setCookie = response.headers['set-cookie'] || response.headers['Set-Cookie']
      if (setCookie) {
        const cookies = Array.isArray(setCookie) ? setCookie : [setCookie]
        for (const cookieString of cookies) {
          if (typeof cookieString === 'string' && cookieString.includes('3x-ui=')) {
            const cookieMatch = cookieString.match(/3x-ui=([^;]+)/)
            if (cookieMatch) {
              sessionCookie = cookieMatch[1]
              break
            }
          }
        }
        cookies.forEach((c) => res.append('Set-Cookie', c))
      }

      res.status(response.status).json({
        ...(response.data || {}),
        sessionCookie,
      })

    } catch (error) {
      console.error('❌ Test session error:', error.message)
      res.status(error.response?.status || 500).json({
        success: false,
        msg: error.message || 'Test session failed'
      })
    }
  })

  // ========== ОПТИМИЗАЦИЯ: Асинхронная проверка статических файлов ==========
  // Обслуживание статических файлов frontend
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const distPath = path.join(__dirname, '..', 'dist')

  // Проверяем существование папки dist асинхронно
  let distExists = false
  try {
    await fs.access(distPath)
    distExists = true
  } catch (error) {
    console.warn(`⚠️ Frontend dist folder not found: ${distPath}`)
    console.warn('⚠️ Static files will not be served. Frontend build may be missing.')
    console.warn('💡 Запустите: npm run build')
  }

  if (distExists) {
    // Статические файлы (JS, CSS, images и т.д.)
    // ОПТИМИЗАЦИЯ: Улучшенное кэширование статики
    app.use(express.static(distPath, {
      maxAge: process.env.NODE_ENV === 'production' ? '1y' : '0', // Кэширование только в production
      etag: true,
      lastModified: true,
      index: false, // Не использовать index.html по умолчанию
      // Дополнительные опции для производительности
      immutable: process.env.NODE_ENV === 'production', // Файлы с хешами считаются неизменяемыми
      setHeaders: (res, path) => {
        // Добавляем заголовки для лучшего кэширования
        if (process.env.NODE_ENV === 'production') {
          // Для файлов с хешами (например, main.abc123.js) устанавливаем долгий кэш
          if (path.match(/\.[a-f0-9]{8,}\./)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          }
        }
      }
    }))
    
    // SPA fallback: все остальные запросы (не API) отдаем index.html
    app.get('*', (req, res) => {
      // Пропускаем API запросы - они уже обработаны выше
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ 
          success: false, 
          msg: 'API endpoint not found' 
        })
      }
      
      // Отдаем index.html для SPA роутинга
      res.sendFile(path.join(distPath, 'index.html'))
    })
    
    console.log(`📁 Serving static files from: ${distPath}`)
  }

  // Обработка ошибок
  // ВАЖНО: Error-handling middleware должен быть зарегистрирован ПОСЛЕДНИМ
  app.use((err, req, res, next) => {
    console.error('❌ Server error:', err)
    res.status(500).json({
      success: false,
      msg: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    })
  })

  return app
}

// ========== Запуск сервера ==========
const PORT = process.env.PROXY_PORT || 3001
const HOST = process.env.PROXY_HOST || '0.0.0.0'

// ОПТИМИЗАЦИЯ: Запуск в cluster mode
startCluster(async () => {
  const app = await createApp()
  
  app.listen(PORT, HOST, async () => {
    const workerInfo = getWorkerInfo()
    const workerPrefix = workerInfo.isWorker ? `[Worker ${workerInfo.workerId}] ` : ''
    
    console.log(`${workerPrefix}🚀 XUI Proxy Server запущен на ${HOST}:${PORT}`)
    console.log(`${workerPrefix}🔒 Environment: ${process.env.NODE_ENV || 'development'}`)
    console.log(`${workerPrefix}📡 Проксирует запросы к: ${process.env.XUI_HOST || 'XUI_HOST не установлен'}`)
    
    // Формируем список allowed origins для логирования
    let allowedOriginsList = []
    if (process.env.NODE_ENV === 'production') {
      if (process.env.ALLOWED_ORIGINS) {
        allowedOriginsList = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(o => o)
      }
      const frontendUrl = process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL
      if (frontendUrl && !allowedOriginsList.includes(frontendUrl)) {
        allowedOriginsList.push(frontendUrl)
      }
    } else {
      allowedOriginsList = ['http://localhost:5173', 'http://localhost:3000']
    }
    console.log(`${workerPrefix}🌐 Allowed origins: ${allowedOriginsList.length > 0 ? allowedOriginsList.join(', ') : 'all (development mode)'}`)
    console.log(`${workerPrefix}📊 Health check: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/health`)
    
    // Показываем URL для доступа к frontend
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const distPath = path.join(__dirname, '..', 'dist')
    
    try {
      await fs.access(distPath)
      const frontendUrl = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`
      console.log(`${workerPrefix}🌐 Frontend доступен на: ${frontendUrl}`)
    } catch (error) {
      // dist не существует, не показываем URL
    }
  })
}, {
  enableCluster: process.env.ENABLE_CLUSTER !== 'false', // Можно отключить через переменную окружения
  workers: parseInt(process.env.CLUSTER_WORKERS) || undefined // Можно задать количество workers
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...')
  process.exit(0)
})

export default createApp
