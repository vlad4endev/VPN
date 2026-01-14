# Production Setup Guide

## 🚀 Критически важные настройки для production

### 1. Production Proxy Server

**Проблема:** Vite прокси работает только в dev-режиме. В production приложение сломается из-за CORS.

**Решение:** Используйте отдельный proxy server.

#### Установка:

```bash
cd server
npm install
```

#### Настройка переменных окружения:

Создайте файл `server/.env`:

```env
# 3x-ui настройки
XUI_HOST=https://your-server-ip:port/path
# Пример: XUI_HOST=https://84.201.161.204:40919/Gxckr4KcZGtB6aOZdw

# Frontend URL (для CORS)
FRONTEND_URL=https://your-frontend-domain.com
# Или для dev: FRONTEND_URL=http://localhost:5173

# Порт proxy сервера
PROXY_PORT=3001
PROXY_HOST=0.0.0.0
```

#### Запуск:

```bash
# Обычный запуск
npm start

# С PM2 (рекомендуется для production)
npm run pm2:start

# С автоперезагрузкой (dev)
npm run dev
```

#### Docker:

```dockerfile
# Dockerfile.proxy
FROM node:18-alpine

WORKDIR /app

COPY server/package*.json ./
RUN npm install --only=production

COPY server/proxy-server.js ./

EXPOSE 3001

CMD ["node", "proxy-server.js"]
```

```bash
docker build -f Dockerfile.proxy -t xui-proxy .
docker run -d \
  --name xui-proxy \
  -p 3001:3001 \
  --env-file server/.env \
  xui-proxy
```

#### Docker Compose:

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "80:80"
    environment:
      - VITE_API_PROXY_URL=http://proxy:3001
    depends_on:
      - proxy

  proxy:
    build:
      context: .
      dockerfile: Dockerfile.proxy
    environment:
      - XUI_HOST=${XUI_HOST}
      - FRONTEND_URL=${FRONTEND_URL}
    ports:
      - "3001:3001"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

### 2. Безопасное хранение Credentials

#### Вариант 1: Переменные окружения сервера (рекомендуется)

**Для production сервера:**

```bash
# Установите переменные окружения на уровне системы
export XUI_USERNAME="your_username"
export XUI_PASSWORD="your_password"
export XUI_HOST="https://your-server:port/path"
export XUI_INBOUND_ID="your_inbound_id"
```

**Для PM2:**

```bash
# Создайте ecosystem.config.js
module.exports = {
  apps: [{
    name: 'xui-proxy',
    script: './proxy-server.js',
    env: {
      XUI_USERNAME: 'your_username',
      XUI_PASSWORD: 'your_password',
      XUI_HOST: 'https://your-server:port/path',
      XUI_INBOUND_ID: 'your_inbound_id'
    }
  }]
}

pm2 start ecosystem.config.js
```

#### Вариант 2: AWS Secrets Manager

```bash
# Установите AWS SDK
npm install aws-sdk

# Настройте переменные окружения
export AWS_REGION=us-east-1
export AWS_SECRETS_MANAGER_SECRET_ID=xui-credentials

# Создайте secret в AWS:
aws secretsmanager create-secret \
  --name xui-credentials \
  --secret-string '{"username":"your_username","password":"your_password","host":"https://...","inboundId":"..."}'
```

#### Вариант 3: Azure Key Vault

```bash
# Установите Azure SDK
npm install @azure/keyvault-secrets @azure/identity

# Настройте переменные окружения
export AZURE_KEY_VAULT_URL=https://your-vault.vault.azure.net/
```

#### Важно для Git:

```bash
# .gitignore
.env
.env.local
.env.*.local
server/.env
server/ecosystem.config.js

# ✅ Коммитим только шаблон
# .env.template
XUI_HOST=
XUI_USERNAME=
XUI_PASSWORD=
XUI_INBOUND_ID=
```

---

### 3. Использование TransactionManager

**В вашем коде:**

```javascript
import TransactionManager from './services/TransactionManager.js'
import ThreeXUI from './services/ThreeXUI.js'
import { db } from './firebase.js'

// Создайте инстанс
const transactionManager = new TransactionManager(
  ThreeXUI.getInstance(),
  db
)

// Вместо прямого вызова addClient
async function handleGetKey(email, userData) {
  try {
    const result = await transactionManager.addClientTransaction(
      email,
      {
        inboundId: import.meta.env.VITE_XUI_INBOUND_ID,
        uuid: ThreeXUI.generateUUID(),
        options: {
          totalGB: userData.totalGB || 0,
          expiryTime: userData.expiryTime || 0
        }
      },
      {
        email: email,
        role: 'user',
        plan: userData.plan || 'free',
        // ... другие поля
      }
    )
    
    console.log('✅ Transaction successful:', result)
    return result
  } catch (error) {
    console.error('❌ Transaction failed:', error)
    // Показать пользователю ошибку
    throw error
  }
}
```

**Обработка failed rollbacks:**

```javascript
// В админ-панели
async function handleFailedRollbacks() {
  const failed = await transactionManager.getFailedRollbacks()
  
  // Показать список для ручной обработки
  failed.forEach(rollback => {
    console.log(`Pending rollback: ${rollback.email} (${rollback.system})`)
  })
}

// После ручной обработки
await transactionManager.markRollbackResolved(rollbackId, currentUser.id)
```

---

### 4. Настройка Frontend для Production

**Обновите `vite.config.js` для production:**

```javascript
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    // ...
    build: {
      // ...
      rollupOptions: {
        output: {
          // ...
        }
      }
    },
    // В production используем proxy server
    server: {
      proxy: mode === 'development' ? {
        '/api/xui': {
          target: env.XUI_HOST || 'http://localhost:2053',
          // ...
        }
      } : undefined
    }
  }
})
```

**Обновите `ThreeXUI.js` для использования proxy в production:**

```javascript
class ThreeXUI {
  constructor() {
    // В production используем proxy server
    const isProduction = import.meta.env.PROD
    const proxyUrl = import.meta.env.VITE_API_PROXY_URL || 'http://localhost:3001'
    
    this.baseURL = isProduction 
      ? `${proxyUrl}/api/xui`  // Production: через proxy
      : '/api/xui'              // Development: через Vite proxy
    // ...
  }
}
```

---

### 5. Мониторинг и Health Checks

**Health check endpoint:**

```bash
# Проверка proxy server
curl http://localhost:3001/health

# Проверка 3x-ui через proxy
curl http://localhost:3001/api/xui/panel/api/inbounds
```

**Настройка мониторинга (PM2):**

```bash
# PM2 monitoring
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

**Настройка алертов:**

```javascript
// В TransactionManager.js при критических ошибках
async logFailedRollback(system, transaction, rollbackError, originalError) {
  // ... существующий код ...
  
  // Отправка алерта (пример)
  if (process.env.ALERT_WEBHOOK_URL) {
    await axios.post(process.env.ALERT_WEBHOOK_URL, {
      text: `🚨 CRITICAL: Failed rollback for ${transaction.email}`,
      system: system,
      error: rollbackError.message
    })
  }
}
```

---

### 6. Чеклист перед Production

```
[ ] Production proxy server настроен и запущен
[ ] Credentials в безопасном хранилище (не в git!)
[ ] TransactionManager интегрирован в код
[ ] Health check endpoints работают
[ ] Мониторинг настроен (PM2, Docker health checks)
[ ] Алерты для критических ошибок настроены
[ ] Backup стратегия для failed_rollbacks
[ ] Логирование структурировано
[ ] CORS правильно настроен
[ ] Frontend использует proxy URL в production
[ ] Тестирование на staging окружении
[ ] Документация обновлена
```

---

### 7. Troubleshooting

**Проблема: CORS ошибки в production**

**Решение:**
1. Убедитесь, что proxy server запущен
2. Проверьте `FRONTEND_URL` в proxy server
3. Проверьте, что frontend использует правильный `VITE_API_PROXY_URL`

**Проблема: Failed rollbacks накапливаются**

**Решение:**
1. Регулярно проверяйте коллекцию `failed_rollbacks` в Firestore
2. Создайте админ-панель для обработки
3. Настройте автоматические алерты

**Проблема: Circuit breaker постоянно открыт**

**Решение:**
1. Проверьте доступность 3x-ui сервера
2. Проверьте credentials
3. Проверьте логи proxy server
4. Увеличьте threshold или timeout в CircuitBreaker

---

**Дата создания:** 2025-01-27  
**Версия:** 1.0.0

