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
import compression from 'compression'
import axios from 'axios'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { getXuiClient } from './lib/xuiClient.js'

// Загружаем переменные окружения
dotenv.config()

const app = express()

app.use(compression())

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

// Прокси к полному бэкенду (n8n-webhook-proxy), если задан BACKEND_URL или по умолчанию на 3002.
// Когда на 3001 запущен proxy-server, полный API может быть на том же порту (n8n-webhook-proxy) или на другом (BACKEND_URL).
const BACKEND_URL = process.env.BACKEND_URL || process.env.N8N_PROXY_URL
// По умолчанию: если proxy-server на 3001, бэкенд ожидается на 3002 (запуск: PORT=3002 node server/n8n-webhook-proxy.js)
const backendBase = (BACKEND_URL && BACKEND_URL.replace(/\/+$/, '')) || 'http://127.0.0.1:3002'
// пути относительно /api (в app.use('/api', ...) req.path будет /vpn/..., /payment/...)
const BACKEND_API_PREFIXES = ['/vpn', '/payment', '/auth', '/admin', '/analytics', '/promocodes', '/ai', '/public', '/init', '/referral']

// ——— Локальная обработка client-stats / client-stats-direct / client-traffics-by-id (без полного бэкенда) ———
// Использует один XUI из env (XUI_HOST, XUI_USERNAME, XUI_PASSWORD).
app.post('/api/vpn/client-stats', async (req, res) => {
  try {
    const xui = getXuiClient()
    if (!xui || !xui.configured) {
      return res.status(503).json({ success: false, error: '3x-ui не настроен (XUI_HOST, XUI_USERNAME, XUI_PASSWORD)' })
    }
    const body = req.body || {}
    const id = body.uuid || body.clientId
    let stats
    if (id) {
      stats = await xui.getClientStats(id)
    } else {
      const found = await xui.findClientByEmail(body.email || '')
      if (!found) return res.status(404).json({ success: false, error: 'Клиент не найден' })
      stats = await xui.getClientStats(found.client.id)
    }
    return res.json({ success: true, stats, data: stats })
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Ошибка получения статистики' })
  }
})

app.post('/api/vpn/client-stats-direct', async (req, res) => {
  try {
    const xui = getXuiClient()
    if (!xui || !xui.configured) {
      return res.status(503).json({ success: false, error: '3x-ui не настроен (XUI_HOST, XUI_USERNAME, XUI_PASSWORD)' })
    }
    const body = req.body || {}
    const id = body.uuid || body.clientId
    let stats
    if (id) {
      stats = await xui.getClientStats(id)
    } else {
      const found = await xui.findClientByEmail(body.email || '')
      if (!found) return res.status(404).json({ success: false, error: 'Клиент не найден' })
      stats = await xui.getClientStats(found.client.id)
    }
    return res.json({ success: true, stats, data: stats })
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Ошибка получения статистики' })
  }
})

app.post('/api/vpn/client-traffics-by-id', async (req, res) => {
  try {
    const body = req.body || {}
    const uuid = body.uuid || body.clientId
    if (!uuid || !String(uuid).trim()) {
      return res.status(400).json({ success: false, error: 'invalid UUID', msg: 'uuid обязателен' })
    }
    const xui = getXuiClient()
    if (!xui || !xui.configured) {
      return res.status(503).json({ success: false, error: '3x-ui не настроен (XUI_HOST, XUI_USERNAME, XUI_PASSWORD)' })
    }
    const data = await xui.getClientTrafficsById(String(uuid).trim())
    return res.json({ success: true, data })
  } catch (err) {
    const status = err.response?.status === 404 ? 404 : err.response?.status === 401 ? 401 : 500
    return res.status(status).json({ success: false, error: err.message || 'Ошибка получения трафика по UUID' })
  }
})

app.use('/api', (req, res, next) => {
  if (!BACKEND_API_PREFIXES.some((p) => req.path.startsWith(p))) return next()
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  const targetUrl = `${backendBase}/api${req.path}${query}`
  axios({
    method: req.method,
    url: targetUrl,
    data: req.body,
    headers: {
      'Content-Type': req.headers['content-type'] || 'application/json',
      'Accept': req.headers['accept'] || 'application/json',
      ...(req.headers.authorization && { Authorization: req.headers.authorization }),
      ...(req.headers['x-app-id'] && { 'X-App-Id': req.headers['x-app-id'] }),
    },
    validateStatus: () => true,
    timeout: 60000,
  })
    .then((backendRes) => {
      res.status(backendRes.status).json(backendRes.data)
    })
    .catch((err) => {
      res.status(502).json({ success: false, error: err.message || 'Backend unavailable' })
    })
})
if (BACKEND_URL) {
  console.log(`🔄 BACKEND_URL задан: запросы к ${BACKEND_API_PREFIXES.join(', ')} проксируются на ${backendBase}`)
} else {
  console.log(`🔄 API проксируется на ${backendBase} (по умолчанию). Задайте BACKEND_URL для своего бэкенда.`)
  console.log(`💡 Чтобы работала Аналитика и др.: запустите n8n-webhook-proxy на 3002: PORT=3002 node server/n8n-webhook-proxy.js`)
}

// Прокси для всех запросов к 3x-ui через модуль server/lib/xuiClient.js
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

    console.log(`🔄 Proxy (xuiClient): ${req.method} ${req.path} → ${xui.baseUrl}${pathWithQuery}`)

    const result = await xui.requestRaw(req.method, pathWithQuery, {
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined
    })

    // Проброс Set-Cookie от 3x-ui к клиенту (сессия)
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

// Выполнение произвольного запроса к 3x-ui с учётом выбранного сервера из настроек (для раздела «HTTP запросы» в админке)
app.post('/api/xui-request', async (req, res) => {
  try {
    const { method, path, body } = req.body || {}

    if (!method || !path) {
      return res.status(400).json({
        success: false,
        msg: 'method и path обязательны'
      })
    }

    // Security: всегда используем только backend env (без передачи credentials с клиента)
    const xui = getXuiClient()

    if (!xui.configured) {
      return res.status(400).json({
        success: false,
        msg: 'Не заданы baseUrl и учётные данные (сервер в настройках или XUI_HOST/XUI_USERNAME/XUI_PASSWORD)'
      })
    }

    const pathNorm = path.startsWith('/') ? path : `/${path}`
    const opts = {}
    if (['POST', 'PUT', 'PATCH'].includes(String(method).toUpperCase()) && body !== undefined) {
      opts.body = body
    }

    const result = await xui.requestRaw(String(method).toUpperCase(), pathNorm, opts)

    const setCookie = result.headers['set-cookie']
    if (setCookie) {
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie]
      cookies.forEach(c => res.setHeader('Set-Cookie', c))
    }

    res.status(result.status).json(result.data)
  } catch (error) {
    console.error('❌ xui-request error:', error.message)
    res.status(error.response?.status || 500).json({
      success: false,
      msg: error.message || 'xui-request failed',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

// Прокси для тестирования сессии (специальный endpoint)
app.post('/api/test-session', async (req, res) => {
  try {
    const xui = getXuiClient()
    if (!xui || !xui.configured) {
      return res.status(503).json({
        success: false,
        msg: '3x-ui не настроен (XUI_HOST, XUI_USERNAME, XUI_PASSWORD)'
      })
    }

    const session = await xui.login()
    if (!session) {
      return res.status(401).json({
        success: false,
        msg: 'Авторизация в 3x-ui не удалась'
      })
    }

    return res.status(200).json({
      success: true,
      msg: 'Сессия 3x-ui активна'
    })

  } catch (error) {
    console.error('❌ Test session error:', error.message)
    res.status(error.response?.status || 500).json({
      success: false,
      msg: error.message || 'Test session failed'
    })
  }
})

// Обслуживание статических файлов frontend
// ВАЖНО: Размещается ПОСЛЕ всех API маршрутов, но ПЕРЕД обработкой ошибок
// Работает если dist существует (независимо от NODE_ENV)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distPath = path.join(__dirname, '..', 'dist')

// Проверяем существование папки dist
if (fs.existsSync(distPath)) {
  // Статические файлы (JS, CSS, images и т.д.)
  app.use(express.static(distPath, {
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : '0', // Кэширование только в production
    etag: true,
    lastModified: true,
    index: false // Не использовать index.html по умолчанию
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
} else {
  console.warn(`⚠️ Frontend dist folder not found: ${distPath}`)
  console.warn('⚠️ Static files will not be served. Frontend build may be missing.')
  console.warn('💡 Запустите: npm run build')
}

// Обработка ошибок
// ВАЖНО: Error-handling middleware должен быть зарегистрирован ПОСЛЕДНИМ
// Он должен идти после всех маршрутов, включая статические файлы и SPA fallback
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
  console.log(`📊 Health check: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/health`)
  
  // Показываем URL для доступа к frontend
  const distPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
  if (fs.existsSync(distPath)) {
    const frontendUrl = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`
    console.log(`🌐 Frontend доступен на: ${frontendUrl}`)
  }
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

