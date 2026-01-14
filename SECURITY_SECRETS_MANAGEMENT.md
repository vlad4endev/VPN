# 🔐 Управление секретами и безопасность проекта

## 🚨 Критичные проблемы безопасности (обнаружены)

### ❌ Проблема 1: Хардкоженные секреты в коде
**Файл:** `update_firebase_env.py`
- **Риск:** КРИТИЧЕСКИЙ ⚠️
- Firebase API ключи и конфигурация захардкожены в Python скрипте
- Эти файлы попадают в Git репозиторий

### ❌ Проблема 2: Пароли в клиентском коде
**Файлы:** Все файлы с `VITE_XUI_USERNAME` и `VITE_XUI_PASSWORD`
- **Риск:** ВЫСОКИЙ ⚠️
- Пароли 3x-ui могут попадать в клиентский код через VITE_ переменные
- Видны всем пользователям в браузерном коде

### ❌ Проблема 3: Отсутствие .env.example
- Нет шаблона для разработчиков
- Секреты могут быть случайно закоммичены

### ❌ Проблема 4: Отсутствие Docker Secrets
- Нет безопасной конфигурации для Docker
- Секреты могут попасть в Docker образы

---

## ✅ Решение: Полная структура управления секретами

### 📁 Структура файлов для безопасного хранения секретов

```
project-root/
├── .env                           # ❌ НИКОГДА НЕ КОММИТИТЬ! (уже в .gitignore)
├── .env.example                   # ✅ Шаблон без секретов (коммитится)
├── .env.local                     # ❌ Локальные переопределения (не коммитится)
├── .env.development               # ✅ Development переменные (без секретов)
├── .env.production                # ❌ Production переменные (не коммитится)
│
├── server/
│   ├── .env.example               # ✅ Шаблон для backend
│   └── .env                       # ❌ Backend секреты (не коммитится)
│
├── .dockerignore                  # ✅ Исключает секреты из Docker образа
├── .gitignore                     # ✅ Обновлен для безопасности
│
└── scripts/
    ├── migrate-secrets.js         # ✅ Скрипт миграции секретов
    └── validate-env.js            # ✅ Валидация переменных окружения
```

---

## 🔧 Шаг 1: Обновление .gitignore

```gitignore
# ========================================
# СЕКРЕТЫ И ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ
# ========================================

# Environment files - ВСЕ версии .env файлов
.env
.env.local
.env.*.local
.env.development.local
.env.test.local
.env.production.local

# Исключения: можно коммитить только шаблоны
!.env.example
!.env.development.example

# Server environment files
server/.env
server/.env.local
server/.env.*.local
!server/.env.example

# ========================================
# КРИТИЧНО: Секреты в коде
# ========================================

# Файлы со скриптами обновления секретов (если содержат секреты)
update_firebase_env.py
*_secrets.py
*_keys.py

# ========================================
# ЛОГИ И ДАННЫЕ
# ========================================

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*
backend.log

# ========================================
# DEPENDENCIES
# ========================================

node_modules/
/.pnp
.pnp.js

# ========================================
# BUILD OUTPUTS
# ========================================

/build
/dist

# ========================================
# EDITOR & IDE
# ========================================

.DS_Store
.vscode/
.idea/
*.swp
*.swo
*~

# ========================================
# DOCKER
# ========================================

# Docker secrets
.docker-secrets/
docker-secrets.txt

# ========================================
# BACKUP & ARCHIVE
# ========================================

*.zip
*.tar.gz
Бекап*.zip
backup*.zip
```

---

## 📝 Шаг 2: Создание .env.example (шаблон)

### `.env.example` (root)

```env
# ========================================
# 🔥 FIREBASE CONFIGURATION
# ========================================
# Получите эти значения из Firebase Console:
# https://console.firebase.google.com/project/YOUR_PROJECT/settings/general

VITE_FIREBASE_API_KEY=your_firebase_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456

# reCAPTCHA для Firebase App Check (опционально, для production)
VITE_RECAPTCHA_SITE_KEY=your_recaptcha_site_key_here

# ========================================
# 🖥️ 3X-UI CONFIGURATION (BACKEND ONLY)
# ========================================
# ⚠️ ВАЖНО: Эти переменные НЕ должны иметь префикс VITE_!
# Они используются только на backend сервере

# Адрес панели 3x-ui (используется на backend)
XUI_HOST=http://localhost:2053

# Учетные данные 3x-ui (только на backend, НЕ в клиенте!)
# ⚠️ НЕ используйте VITE_ префикс - это попадет в клиентский код!
XUI_USERNAME=admin
XUI_PASSWORD=your_password_here
XUI_INBOUND_ID=1

# ========================================
# 🌐 APPLICATION CONFIGURATION
# ========================================

# Режим работы приложения
NODE_ENV=development

# URL фронтенда (для CORS и redirects)
VITE_FRONTEND_URL=http://localhost:5173

# ========================================
# 🔐 BACKEND PROXY SERVER
# ========================================

# Порт для backend proxy сервера
PROXY_PORT=3001
PROXY_HOST=0.0.0.0

# Разрешенные origins для CORS (через запятую)
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# ========================================
# 🔑 VLESS CONFIGURATION (опционально)
# ========================================

VITE_VLESS_SERVER=nl.skyputh.com
VITE_VLESS_PORT=443
VITE_VLESS_PUBLIC_KEY=your-public-key-here
VITE_VLESS_SHORT_ID=your-short-id-here
VITE_VLESS_SNI=www.microsoft.com
VITE_VLESS_FINGERPRINT=chrome
```

### `server/.env.example`

```env
# ========================================
# 🔐 BACKEND SERVER SECRETS
# ========================================
# ⚠️ КРИТИЧНО: Эти секреты НЕ должны попадать в клиентский код!

# 3x-ui Configuration
XUI_HOST=http://localhost:2053
XUI_USERNAME=admin
XUI_PASSWORD=your_password_here
XUI_INBOUND_ID=1

# Server Configuration
NODE_ENV=development
PROXY_PORT=3001
PROXY_HOST=0.0.0.0

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
FRONTEND_URL=http://localhost:5173

# ========================================
# 🔥 FIREBASE ADMIN (если используется)
# ========================================
# Для использования Firebase Admin SDK на backend

# FIREBASE_ADMIN_PROJECT_ID=your-project-id
# FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
# FIREBASE_ADMIN_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

---

## 🐳 Шаг 3: Docker конфигурация для безопасного хранения секретов

### `.dockerignore`

```dockerignore
# Секреты и переменные окружения
.env
.env.*
!.env.example
server/.env
server/.env.*
!server/.env.example

# Файлы с секретами
update_firebase_env.py
*_secrets.py
*_keys.py

# Git
.git
.gitignore

# Dependencies
node_modules
npm-debug.log

# Build artifacts
dist
build

# IDE
.vscode
.idea

# Logs
*.log

# OS
.DS_Store
Thumbs.db
```

### `Dockerfile` (production-ready)

```dockerfile
# ========================================
# 🔐 SECURE DOCKERFILE - НЕ СОДЕРЖИТ СЕКРЕТОВ
# ========================================

# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Копируем package files
COPY package*.json ./
COPY server/package*.json ./server/

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код (БЕЗ .env файлов)
COPY . .

# Собираем frontend
RUN npm run build

# ========================================
# Production stage
# ========================================
FROM node:18-alpine AS production

WORKDIR /app

# Создаем непривилегированного пользователя
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Копируем только необходимые файлы
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/server ./server
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# ⚠️ ВАЖНО: Секреты передаются через:
# 1. Docker Secrets (docker-compose)
# 2. Environment variables при запуске
# 3. Volume mounts для .env файлов (НЕ включать в образ!)

# Переключаемся на непривилегированного пользователя
USER nodejs

# Expose порт
EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Запуск приложения
CMD ["node", "server/proxy-server.js"]
```

### `docker-compose.yml` (с Docker Secrets)

```yaml
version: '3.8'

services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      # Несекретные переменные
      - NODE_ENV=production
      - PROXY_PORT=3001
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-http://localhost:5173}
    
    # ⚠️ ВАЖНО: Секреты через файлы, а не через environment напрямую
    env_file:
      - .env.production  # Монтируется как volume, НЕ копируется в образ
    
    # Или используйте Docker Secrets для продакшена
    secrets:
      - xui_username
      - xui_password
      - xui_host
    
    volumes:
      # Монтируем .env как volume (НЕ включается в образ)
      - ./.env.production:/app/.env.production:ro
    
    restart: unless-stopped
    networks:
      - vpn-network

# ========================================
# 🔐 DOCKER SECRETS (для продакшена)
# ========================================
secrets:
  xui_username:
    file: ./secrets/xui_username.txt
  xui_password:
    file: ./secrets/xui_password.txt
  xui_host:
    file: ./secrets/xui_host.txt

networks:
  vpn-network:
    driver: bridge
```

---

## 🔑 Шаг 4: Интеграция с GitHub Secrets

### Использование в GitHub Actions

`.github/workflows/deploy.yml`

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Create .env file from Secrets
        run: |
          cat > .env << EOF
          # Firebase (из GitHub Secrets)
          VITE_FIREBASE_API_KEY=${{ secrets.FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN=${{ secrets.FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID=${{ secrets.FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET=${{ secrets.FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID=${{ secrets.FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID=${{ secrets.FIREBASE_APP_ID }}
          
          # Backend (из GitHub Secrets)
          XUI_HOST=${{ secrets.XUI_HOST }}
          XUI_USERNAME=${{ secrets.XUI_USERNAME }}
          XUI_PASSWORD=${{ secrets.XUI_PASSWORD }}
          XUI_INBOUND_ID=${{ secrets.XUI_INBOUND_ID }}
          
          # Application
          NODE_ENV=production
          EOF
      
      - name: Build Docker image
        run: docker build -t vpn-app:latest .
      
      - name: Deploy
        run: |
          # Ваша команда деплоя
          echo "Deploying..."
```

### Настройка GitHub Secrets

**В GitHub репозитории:**
1. Settings → Secrets and variables → Actions
2. Добавьте следующие secrets:

```
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
XUI_HOST
XUI_USERNAME
XUI_PASSWORD
XUI_INBOUND_ID
```

---

## 🔄 Шаг 5: Скрипт миграции секретов

### `scripts/migrate-secrets.js`

```javascript
#!/usr/bin/env node

/**
 * Скрипт миграции секретов
 * 
 * Использование:
 *   node scripts/migrate-secrets.js
 * 
 * Проверяет наличие секретов в коде и помогает их мигрировать
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// Файлы для проверки
const DANGEROUS_FILES = [
  'update_firebase_env.py',
  // Добавьте другие файлы со секретами
]

// Паттерны секретов для поиска
const SECRET_PATTERNS = [
  /api[_-]?key\s*[:=]\s*["']([^"']+)["']/gi,
  /password\s*[:=]\s*["']([^"']+)["']/gi,
  /secret\s*[:=]\s*["']([^"']+)["']/gi,
  /token\s*[:=]\s*["']([^"']+)["']/gi,
  /AIza[0-9A-Za-z_-]+/g, // Firebase API keys
]

console.log('🔍 Поиск секретов в проекте...\n')

let issuesFound = false

// Проверка опасных файлов
console.log('📁 Проверка файлов:')
DANGEROUS_FILES.forEach(file => {
  const filePath = path.join(projectRoot, file)
  if (fs.existsSync(filePath)) {
    console.log(`  ⚠️  НАЙДЕН: ${file}`)
    console.log(`     Рекомендуется: Удалить или переместить секреты в переменные окружения\n`)
    issuesFound = true
  }
})

// Проверка .env файлов в git
console.log('\n🔐 Проверка .env файлов:')
const envFiles = [
  '.env',
  '.env.local',
  '.env.production',
  'server/.env',
]

envFiles.forEach(file => {
  const filePath = path.join(projectRoot, file)
  if (fs.existsSync(filePath)) {
    console.log(`  ✅ ${file} существует (должен быть в .gitignore)`)
  } else {
    console.log(`  ℹ️  ${file} не найден (это нормально)`)
  }
})

// Проверка .env.example
const envExamplePath = path.join(projectRoot, '.env.example')
if (!fs.existsSync(envExamplePath)) {
  console.log(`  ⚠️  НЕ НАЙДЕН: .env.example`)
  console.log(`     Рекомендуется: Создать шаблон переменных окружения\n`)
  issuesFound = true
} else {
  console.log(`  ✅ .env.example существует`)
}

console.log('\n' + '='.repeat(60))
if (issuesFound) {
  console.log('⚠️  Обнаружены проблемы безопасности!')
  console.log('📋 Следуйте инструкциям в SECURITY_SECRETS_MANAGEMENT.md')
  process.exit(1)
} else {
  console.log('✅ Проверка безопасности пройдена!')
  process.exit(0)
}
```

---

## ✅ Шаг 6: Безопасное использование секретов в коде

### Frontend (React + Vite)

```javascript
// src/lib/firebase/config.js

/**
 * ✅ ПРАВИЛЬНО: Использование переменных окружения
 * ⚠️ ВАЖНО: VITE_ переменные попадают в клиентский код!
 * Не используйте VITE_ для секретов (паролей, API ключей)
 */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  // ... остальное
}

// ✅ Firebase API Key - это публичный ключ, его можно использовать в клиенте
// ❌ НО: Пароли и токены - НИКОГДА через VITE_!
```

### Backend (Node.js + Express)

```javascript
// server/proxy-server.js

import dotenv from 'dotenv'

// ✅ Загружаем переменные окружения
dotenv.config()

// ✅ ПРАВИЛЬНО: Использование переменных без VITE_ префикса
const xuiHost = process.env.XUI_HOST
const xuiUsername = process.env.XUI_USERNAME  // ✅ Без VITE_
const xuiPassword = process.env.XUI_PASSWORD  // ✅ Без VITE_

// ✅ Валидация обязательных переменных
const requiredEnvVars = ['XUI_HOST', 'XUI_USERNAME', 'XUI_PASSWORD']

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`❌ Отсутствует обязательная переменная окружения: ${envVar}`)
  }
}

// ✅ Использование с проверкой
if (!xuiHost || !xuiUsername || !xuiPassword) {
  throw new Error('Конфигурация 3x-ui неполная. Проверьте переменные окружения.')
}
```

---

## 📋 Шаг 7: План миграции

### Этап 1: Подготовка (15 минут)

```bash
# 1. Обновите .gitignore (скопируйте из раздела выше)

# 2. Создайте .env.example (скопируйте из раздела выше)

# 3. Убедитесь, что .env в .gitignore
git check-ignore .env
# Должно вывести: .env

# 4. Проверьте, нет ли .env в Git
git ls-files | grep .env
# Не должно быть вывода (кроме .env.example)
```

### Этап 2: Удаление секретов из кода (10 минут)

```bash
# 1. Удалите или исправьте update_firebase_env.py
#    Переместите секреты в .env файл

# 2. Проверьте наличие других файлов со секретами
grep -r "AIza" . --exclude-dir=node_modules --exclude-dir=.git
grep -r "password.*=" . --exclude-dir=node_modules --exclude-dir=.git | grep -v ".env"

# 3. Удалите все найденные секреты
```

### Этап 3: Создание структуры файлов (10 минут)

```bash
# 1. Создайте .env.example
cp .env .env.example 2>/dev/null || echo "Создайте .env.example вручную"

# 2. Замените все секреты на placeholder
sed -i '' 's/=.*/=your_value_here/g' .env.example

# 3. Создайте server/.env.example
mkdir -p server
cp server/.env server/.env.example 2>/dev/null || echo "server/.env.example будет создан вручную"

# 4. Создайте структуру для Docker secrets
mkdir -p secrets
touch secrets/.gitkeep
echo "secrets/*" >> .gitignore
```

### Этап 4: Миграция секретов (20 минут)

```bash
# 1. Создайте резервную копию текущего .env
cp .env .env.backup

# 2. Обновите .env файл:
#    - Убедитесь, что нет VITE_ префикса для секретов 3x-ui
#    - Переименуйте VITE_XUI_USERNAME → XUI_USERNAME
#    - Переименуйте VITE_XUI_PASSWORD → XUI_PASSWORD

# 3. Обновите код, который использует эти переменные
#    (уже сделано в предыдущих улучшениях)

# 4. Протестируйте локально
npm run dev
```

### Этап 5: Настройка GitHub Secrets (10 минут)

1. Перейдите в GitHub репозиторий
2. Settings → Secrets and variables → Actions
3. Добавьте все секреты из `.env`
4. Обновите GitHub Actions workflows

### Этап 6: Docker конфигурация (15 минут)

```bash
# 1. Создайте Dockerfile (скопируйте из раздела выше)

# 2. Создайте .dockerignore (скопируйте из раздела выше)

# 3. Создайте docker-compose.yml (скопируйте из раздела выше)

# 4. Создайте secrets файлы (НЕ коммитить!)
echo "admin" > secrets/xui_username.txt
echo "your_password" > secrets/xui_password.txt
echo "http://localhost:2053" > secrets/xui_host.txt

# 5. Тестируйте Docker сборку
docker build -t vpn-app:test .
```

### Этап 7: Проверка и финализация (10 минут)

```bash
# 1. Запустите скрипт проверки
node scripts/migrate-secrets.js

# 2. Проверьте, что нет секретов в Git
git add -A
git status
# Проверьте, что .env файлы не в staging

# 3. Проверьте .gitignore
git check-ignore -v .env
git check-ignore -v server/.env

# 4. Создайте commit (без секретов!)
git add .gitignore .env.example .dockerignore Dockerfile
git commit -m "🔐 Безопасное управление секретами"
```

---

## 🎯 Чек-лист безопасности

### Перед коммитом в Git:

- [ ] `.env` файлы в `.gitignore`
- [ ] `.env.example` создан и не содержит секретов
- [ ] Нет хардкоженных секретов в коде
- [ ] `update_firebase_env.py` не содержит секретов (или удален)
- [ ] Dockerfile не копирует `.env` файлы
- [ ] `.dockerignore` исключает секреты
- [ ] Скрипт миграции успешно выполнен

### Перед деплоем:

- [ ] GitHub Secrets настроены (для CI/CD)
- [ ] Docker secrets настроены (для production)
- [ ] `.env.production` создан на сервере (не в Git)
- [ ] Backend переменные используют правильный префикс (не VITE_)
- [ ] Тесты проходят с переменными окружения

---

## 📚 Дополнительные ресурсы

- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Docker Secrets](https://docs.docker.com/engine/swarm/secrets/)
- [GitHub Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [12 Factor App - Config](https://12factor.net/config)

---

**Дата:** 2025-01-27  
**Версия:** 1.0  
**Статус:** ✅ Готово к применению
