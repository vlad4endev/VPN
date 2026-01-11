# Руководство по безопасности: HTTPS, CORS и CSP

## Содержание
1. [Принудительное HTTPS](#1-принудительное-https)
2. [Ограничение CORS для production](#2-ограничение-cors-для-production)
3. [Content Security Policy (CSP)](#3-content-security-policy-csp)
4. [Примеры конфигураций](#4-примеры-конфигураций)
5. [Важность для безопасности](#5-важность-для-безопасности)

---

## 1. Принудительное HTTPS

### 1.1. Express.js

#### Вариант A: Использование middleware `helmet` (рекомендуется)

```javascript
import express from 'express'
import helmet from 'helmet'

const app = express()

// Принудительное перенаправление на HTTPS
app.use(helmet({
  hsts: {
    maxAge: 31536000, // 1 год
    includeSubDomains: true,
    preload: true
  },
  contentSecurityPolicy: {
    // Настройки CSP (см. раздел 3)
  }
}))

// Дополнительная проверка в production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Проверка заголовка X-Forwarded-Proto (если за nginx)
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`)
    }
    next()
  })
}
```

#### Вариант B: Ручная проверка

```javascript
// Middleware для принудительного HTTPS
app.use((req, res, next) => {
  // В production всегда перенаправляем на HTTPS
  if (process.env.NODE_ENV === 'production') {
    const isSecure = 
      req.secure || // Прямое HTTPS соединение
      req.headers['x-forwarded-proto'] === 'https' || // За прокси
      req.headers['x-forwarded-ssl'] === 'on' // Альтернативный заголовок
    
    if (!isSecure) {
      return res.redirect(301, `https://${req.headers.host}${req.url}`)
    }
  }
  next()
})
```

#### Вариант C: Использование `express-enforces-ssl`

```javascript
import express from 'express'
import enforceSSL from 'express-enforces-ssl'

const app = express()

// Принудительное HTTPS только в production
if (process.env.NODE_ENV === 'production') {
  app.use(enforceSSL())
}
```

### 1.2. Nginx

#### Базовая конфигурация с принудительным HTTPS

```nginx
# /etc/nginx/sites-available/your-app

# HTTP сервер - перенаправляет на HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Перенаправление всех HTTP запросов на HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS сервер
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    # SSL сертификаты (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # SSL настройки безопасности
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;
    
    # HSTS (HTTP Strict Transport Security)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    
    # Дополнительные заголовки безопасности
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Проксирование на Express приложение
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### Расширенная конфигурация с OCSP Stapling

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # OCSP Stapling для улучшения производительности
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/letsencrypt/live/yourdomain.com/chain.pem;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;
    
    # Современные SSL настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # HSTS
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    
    location / {
        proxy_pass http://localhost:3001;
        # ... остальные proxy настройки
    }
}
```

---

## 2. Ограничение CORS для production

### 2.1. Express.js

#### Безопасная конфигурация CORS

```javascript
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()

// Whitelist разрешенных доменов
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [
      'https://yourdomain.com',
      'https://www.yourdomain.com',
      'https://app.yourdomain.com'
    ]
  : [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173'
    ]

// CORS middleware с валидацией origin
app.use(cors({
  origin: (origin, callback) => {
    // Разрешаем запросы без origin (например, Postman, мобильные приложения)
    if (!origin) {
      return callback(null, true)
    }
    
    // Проверяем, есть ли origin в whitelist
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      console.warn(`🚫 CORS blocked origin: ${origin}`)
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true, // Разрешаем cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Session-Id',
    'Accept'
  ],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
  maxAge: 86400 // 24 часа для preflight кэша
}))

// Дополнительная проверка для production
if (process.env.NODE_ENV === 'production') {
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
```

#### Альтернатива: Ручная настройка CORS заголовков

```javascript
// CORS middleware без библиотеки cors
app.use((req, res, next) => {
  const origin = req.headers.origin
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://yourdomain.com', 'https://www.yourdomain.com']
    : ['http://localhost:5173']
  
  // Устанавливаем Access-Control-Allow-Origin только для разрешенных доменов
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Id')
    res.setHeader('Access-Control-Max-Age', '86400')
  }
  
  // Обработка preflight запросов
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }
  
  next()
})
```

### 2.2. Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    # CORS заголовки только для разрешенных доменов
    set $cors_origin "";
    
    # Проверка origin и установка CORS заголовков
    if ($http_origin ~* "^https://(yourdomain\.com|www\.yourdomain\.com|app\.yourdomain\.com)$") {
        set $cors_origin $http_origin;
    }
    
    # Установка CORS заголовков
    add_header 'Access-Control-Allow-Origin' $cors_origin always;
    add_header 'Access-Control-Allow-Credentials' 'true' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS, PATCH' always;
    add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Session-Id, Accept' always;
    add_header 'Access-Control-Max-Age' '86400' always;
    
    # Обработка preflight запросов
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' $cors_origin always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS, PATCH' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Session-Id, Accept' always;
        add_header 'Access-Control-Max-Age' '86400' always;
        add_header 'Content-Type' 'text/plain; charset=utf-8';
        add_header 'Content-Length' 0;
        return 204;
    }
    
    location / {
        proxy_pass http://localhost:3001;
        # ... остальные proxy настройки
    }
}
```

#### Более гибкий вариант с map

```nginx
# В начале конфигурации nginx (в http блоке)
map $http_origin $cors_origin {
    default "";
    "~^https://yourdomain\.com$" $http_origin;
    "~^https://www\.yourdomain\.com$" $http_origin;
    "~^https://app\.yourdomain\.com$" $http_origin;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    # CORS заголовки
    add_header 'Access-Control-Allow-Origin' $cors_origin always;
    add_header 'Access-Control-Allow-Credentials' 'true' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization' always;
    
    location / {
        proxy_pass http://localhost:3001;
        # ... остальные proxy настройки
    }
}
```

---

## 3. Content Security Policy (CSP)

### 3.1. Express.js

#### Использование helmet для CSP

```javascript
import helmet from 'helmet'

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Только если необходимо (не рекомендуется)
        "https://cdn.jsdelivr.net", // Если используете CDN
        "https://unpkg.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Для inline стилей (Tailwind, styled-components)
        "https://fonts.googleapis.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "data:"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https:", // Разрешаем все HTTPS изображения
        "blob:"
      ],
      connectSrc: [
        "'self'",
        "https://yourdomain.com", // Ваш API
        "https://api.yourdomain.com", // Внешние API
        "wss://yourdomain.com" // WebSocket соединения
      ],
      frameSrc: ["'none'"], // Запрещаем iframe
      objectSrc: ["'none'"], // Запрещаем object/embed
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      blockAllMixedContent: true
    },
    reportOnly: false // В production установить false, в dev можно true для тестирования
  }
}))
```

#### Строгая CSP для production

```javascript
const cspDirectives = process.env.NODE_ENV === 'production'
  ? {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        // Убираем 'unsafe-inline' в production
        // Используйте nonce или hash для inline скриптов
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Может быть необходимо для CSS-in-JS
      ],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'",
        `https://${process.env.DOMAIN || 'yourdomain.com'}`,
      ],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    }
  : {
      // Более мягкая политика для development
      defaultSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "http://localhost:*", "ws://localhost:*"],
    }

app.use(helmet({
  contentSecurityPolicy: {
    directives: cspDirectives
  }
}))
```

#### CSP с nonce для inline скриптов

```javascript
import crypto from 'crypto'

// Middleware для генерации nonce
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64')
  next()
})

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.nonce}'`
      ],
      // ... остальные директивы
    }
  }
}))

// В шаблоне HTML используйте nonce:
// <script nonce="<%= nonce %>">...</script>
```

### 3.2. Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    # Content Security Policy
    add_header Content-Security-Policy "
        default-src 'self';
        script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
        style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
        font-src 'self' https://fonts.gstatic.com data:;
        img-src 'self' data: https: blob:;
        connect-src 'self' https://yourdomain.com wss://yourdomain.com;
        frame-src 'none';
        object-src 'none';
        base-uri 'self';
        form-action 'self';
        upgrade-insecure-requests;
        block-all-mixed-content;
    " always;
    
    # Report URI для мониторинга нарушений CSP (опционально)
    # add_header Content-Security-Policy-Report-Only "..." always;
    
    location / {
        proxy_pass http://localhost:3001;
        # ... остальные proxy настройки
    }
}
```

#### Многострочная CSP в nginx (более читаемо)

```nginx
# В начале файла конфигурации
map $host $csp_header {
    default "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://yourdomain.com; frame-src 'none'; object-src 'none'; upgrade-insecure-requests;";
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    add_header Content-Security-Policy $csp_header always;
    
    location / {
        proxy_pass http://localhost:3001;
    }
}
```

---

## 4. Примеры конфигураций

### 4.1. Полная конфигурация Express.js

```javascript
// server/secure-server.js
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'

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
      scriptSrc: [
        "'self'",
        // Добавьте CDN если используете
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Для CSS-in-JS библиотек
      ],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'",
        `https://${process.env.DOMAIN || 'yourdomain.com'}`,
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
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`)
    }
    next()
  })
}

// CORS конфигурация
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGINS?.split(',') || [
      `https://${process.env.DOMAIN}`,
      `https://www.${process.env.DOMAIN}`
    ])
  : ['http://localhost:5173', 'http://localhost:3000']

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      console.warn(`🚫 CORS blocked: ${origin}`)
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Id'],
  maxAge: 86400
}))

// ========== Middleware ==========
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())

// ========== Routes ==========
// Ваши роуты здесь

// ========== Error handling ==========
app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(err.status || 500).json({
    success: false,
    msg: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  })
})

// ========== Server ==========
const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`🚀 Secure server running on port ${PORT}`)
  console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`🌐 Allowed origins: ${allowedOrigins.join(', ')}`)
})
```

### 4.2. Полная конфигурация Nginx

```nginx
# /etc/nginx/sites-available/your-app

# HTTP -> HTTPS редирект
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Let's Encrypt verification
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    # Все остальное перенаправляем на HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS сервер
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    # ========== SSL конфигурация ==========
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/yourdomain.com/chain.pem;
    
    # Современные протоколы
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    
    # SSL оптимизация
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;
    
    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;
    
    # ========== Безопасность заголовков ==========
    
    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    
    # X-Frame-Options
    add_header X-Frame-Options "SAMEORIGIN" always;
    
    # X-Content-Type-Options
    add_header X-Content-Type-Options "nosniff" always;
    
    # X-XSS-Protection
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Referrer Policy
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Permissions Policy
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
    
    # ========== CORS ==========
    map $http_origin $cors_origin {
        default "";
        "~^https://yourdomain\.com$" $http_origin;
        "~^https://www\.yourdomain\.com$" $http_origin;
    }
    
    add_header 'Access-Control-Allow-Origin' $cors_origin always;
    add_header 'Access-Control-Allow-Credentials' 'true' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS, PATCH' always;
    add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Session-Id' always;
    add_header 'Access-Control-Max-Age' '86400' always;
    
    # Preflight requests
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' $cors_origin always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS, PATCH' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Session-Id' always;
        add_header 'Access-Control-Max-Age' '86400' always;
        add_header 'Content-Length' 0;
        add_header 'Content-Type' 'text/plain';
        return 204;
    }
    
    # ========== Content Security Policy ==========
    add_header Content-Security-Policy "
        default-src 'self';
        script-src 'self' 'unsafe-inline';
        style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
        font-src 'self' https://fonts.gstatic.com data:;
        img-src 'self' data: https: blob:;
        connect-src 'self' https://yourdomain.com wss://yourdomain.com;
        frame-src 'none';
        object-src 'none';
        base-uri 'self';
        form-action 'self';
        upgrade-insecure-requests;
        block-all-mixed-content;
    " always;
    
    # ========== Проксирование на Express ==========
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        
        # Заголовки для прокси
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        
        # Таймауты
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Кэширование
        proxy_cache_bypass $http_upgrade;
        
        # Буферизация
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
    }
    
    # ========== Статические файлы (опционально) ==========
    location /static/ {
        alias /var/www/your-app/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
    
    # ========== Логирование ==========
    access_log /var/log/nginx/your-app-access.log;
    error_log /var/log/nginx/your-app-error.log;
}
```

### 4.3. package.json зависимости

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "cookie-parser": "^1.4.6",
    "dotenv": "^16.3.1"
  }
}
```

### 4.4. .env пример

```bash
# Environment
NODE_ENV=production

# Server
PORT=3001
DOMAIN=yourdomain.com

# CORS
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# SSL (если используете самоподписанные сертификаты)
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
```

---

## 5. Важность для безопасности

### 5.1. Принудительное HTTPS

**Почему это важно:**

1. **Шифрование данных в пути**
   - Защита от перехвата трафика (Man-in-the-Middle атаки)
   - Защита паролей, токенов, персональных данных
   - Соответствие требованиям GDPR, PCI DSS

2. **Защита от подмены (Spoofing)**
   - SSL/TLS сертификаты подтверждают подлинность сервера
   - Пользователи видят, что соединение защищено

3. **SEO преимущества**
   - Google и другие поисковики отдают приоритет HTTPS сайтам
   - Улучшение ранжирования в поисковой выдаче

4. **Требования браузеров**
   - Современные браузеры блокируют смешанный контент (HTTP + HTTPS)
   - Некоторые API (например, Geolocation) работают только через HTTPS

5. **HSTS защита**
   - Предотвращает downgrade атаки
   - Браузер запоминает, что сайт должен использовать только HTTPS

### 5.2. Ограничение CORS

**Почему это важно:**

1. **Защита от CSRF атак**
   - Ограничение источников запросов предотвращает подделку межсайтовых запросов
   - Злоумышленники не могут делать запросы с других доменов

2. **Контроль доступа к API**
   - Только разрешенные домены могут обращаться к вашему API
   - Защита от несанкционированного использования API

3. **Защита конфиденциальных данных**
   - Cookies и credentials не отправляются на неразрешенные домены
   - Предотвращение утечки сессий и токенов

4. **Соответствие политике безопасности**
   - Многие стандарты безопасности требуют ограничения CORS
   - Улучшение общей безопасности приложения

**Риски неправильной настройки:**
- `Access-Control-Allow-Origin: *` - позволяет любому сайту делать запросы
- Отсутствие проверки origin - уязвимость к CSRF
- Слишком широкий whitelist - увеличивает поверхность атаки

### 5.3. Content Security Policy (CSP)

**Почему это важно:**

1. **Защита от XSS (Cross-Site Scripting)**
   - Блокирует выполнение вредоносных скриптов
   - Предотвращает инъекцию кода через пользовательский ввод

2. **Защита от Clickjacking**
   - `frame-src 'none'` предотвращает встраивание сайта в iframe
   - Защита от атак типа "подделка интерфейса"

3. **Контроль загружаемых ресурсов**
   - Ограничение источников скриптов, стилей, изображений
   - Предотвращение загрузки вредоносного контента

4. **Защита от data exfiltration**
   - Ограничение `connect-src` предотвращает отправку данных на сторонние серверы
   - Защита от утечки конфиденциальной информации

5. **Соответствие стандартам**
   - Требование многих стандартов безопасности (OWASP Top 10)
   - Улучшение рейтинга безопасности приложения

**Типы атак, которые предотвращает CSP:**
- XSS (Cross-Site Scripting)
- Clickjacking
- Code injection
- Data exfiltration
- Mixed content attacks

### 5.4. Комплексная защита

**Совместное использование всех мер:**

1. **Многоуровневая защита**
   - HTTPS защищает данные в пути
   - CORS ограничивает источники запросов
   - CSP предотвращает выполнение вредоносного кода

2. **Defense in Depth**
   - Даже если один слой защиты пробит, другие продолжают работать
   - Уменьшение риска успешной атаки

3. **Соответствие стандартам**
   - OWASP Top 10
   - PCI DSS (для платежных систем)
   - GDPR (для обработки персональных данных)

4. **Улучшение репутации**
   - Пользователи доверяют защищенным сайтам
   - Улучшение конверсии и удержания пользователей

### 5.5. Чеклист безопасности

- [ ] HTTPS принудительно включен
- [ ] HSTS заголовки настроены
- [ ] CORS ограничен только production доменами
- [ ] CSP настроен и протестирован
- [ ] SSL сертификаты валидны и не истекли
- [ ] Современные SSL протоколы (TLS 1.2+)
- [ ] OCSP Stapling включен
- [ ] Заголовки безопасности настроены (X-Frame-Options, X-Content-Type-Options)
- [ ] Логирование блокированных запросов
- [ ] Регулярное обновление зависимостей
- [ ] Мониторинг нарушений CSP
- [ ] Тестирование конфигурации в staging окружении

---

## Дополнительные ресурсы

- [OWASP Security Headers](https://owasp.org/www-project-secure-headers/)
- [Mozilla Security Guidelines](https://infosec.mozilla.org/guidelines/web_security)
- [Let's Encrypt](https://letsencrypt.org/) - бесплатные SSL сертификаты
- [SSL Labs SSL Test](https://www.ssllabs.com/ssltest/) - проверка SSL конфигурации
- [CSP Evaluator](https://csp-evaluator.withgoogle.com/) - проверка CSP политики

---

## Быстрый старт

1. **Установите зависимости:**
   ```bash
   cd server
   npm install helmet cors
   ```

2. **Обновите proxy-server.js** с конфигурацией из раздела 4.1

3. **Настройте nginx** используя конфигурацию из раздела 4.2

4. **Получите SSL сертификат:**
   ```bash
   sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
   ```

5. **Проверьте конфигурацию:**
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

6. **Протестируйте:**
   - [SSL Labs](https://www.ssllabs.com/ssltest/)
   - [Security Headers](https://securityheaders.com/)
   - [CSP Evaluator](https://csp-evaluator.withgoogle.com/)

