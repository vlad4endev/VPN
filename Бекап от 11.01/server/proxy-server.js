/**
 * Production Proxy Server для 3x-ui API
 * Решает проблему CORS в production окружении
 * 
 * Использование:
 *   node server/proxy-server.js
 * 
 * Или через PM2:
 *   pm2 start server/proxy-server.js --name xui-proxy
 * 
 * Или через Docker:
 *   docker build -t xui-proxy .
 *   docker run -p 3001:3001 xui-proxy
 */

import express from 'express'
import axios from 'axios'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'

// Загружаем переменные окружения
dotenv.config()

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

// Логирование запросов
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'xui-proxy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })
})

// Прокси для всех запросов к 3x-ui
app.all('/api/xui/*', async (req, res) => {
  try {
    const xuiPath = req.path.replace('/api/xui', '')
    const xuiHost = process.env.XUI_HOST

    if (!xuiHost) {
      return res.status(500).json({
        success: false,
        msg: 'XUI_HOST не настроен в переменных окружения'
      })
    }

    // Формируем полный URL с правильной обработкой query параметров
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''
    const xuiUrl = `${xuiHost}${xuiPath}${queryString}`

    console.log(`🔄 Proxy: ${req.method} ${req.path} → ${xuiUrl}`)

    // Настройка запроса
    const requestConfig = {
      method: req.method,
      url: xuiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      validateStatus: () => true, // Не бросать ошибку на любой статус
      timeout: 30000 // 30 секунд таймаут
    }

    // Добавляем тело запроса для POST/PUT
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      requestConfig.data = req.body
    }

    // Проброс cookies из запроса клиента
    if (req.headers.cookie) {
      requestConfig.headers['Cookie'] = req.headers.cookie
    }

    // Проброс авторизации если есть
    if (req.headers.authorization) {
      requestConfig.headers['Authorization'] = req.headers.authorization
    }

    // Выполняем запрос
    const response = await axios(requestConfig)

    // Проброс всех заголовков обратно (особенно cookies)
    // НЕ устанавливаем CORS заголовки здесь - они уже установлены cors middleware
    Object.entries(response.headers).forEach(([key, value]) => {
      // Пропускаем некоторые заголовки и CORS заголовки (они уже установлены middleware)
      const lowerKey = key.toLowerCase()
      if (!['content-encoding', 'transfer-encoding', 'connection', 
            'access-control-allow-origin', 'access-control-allow-credentials',
            'access-control-allow-methods', 'access-control-allow-headers'].includes(lowerKey)) {
        res.setHeader(key, value)
      }
    })

    // Отправляем ответ
    res.status(response.status).json(response.data)

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

    res.status(response.status).json(response.data)

  } catch (error) {
    console.error('❌ Test session error:', error.message)
    res.status(error.response?.status || 500).json({
      success: false,
      msg: error.message || 'Test session failed'
    })
  }
})

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err)
  res.status(500).json({
    success: false,
    msg: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  })
})

// Запуск сервера
const PORT = process.env.PROXY_PORT || 3001
const HOST = process.env.PROXY_HOST || '0.0.0.0'

app.listen(PORT, HOST, () => {
  console.log(`🚀 XUI Proxy Server запущен на ${HOST}:${PORT}`)
  console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`📡 Проксирует запросы к: ${process.env.XUI_HOST || 'XUI_HOST не установлен'}`)
  console.log(`🌐 Allowed origins: ${allowedOrigins.length > 0 ? allowedOrigins.join(', ') : 'all (development mode)'}`)
  console.log(`📊 Health check: http://${HOST}:${PORT}/health`)
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

export default app

