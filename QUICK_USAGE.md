# Быстрый старт - Использование компонентов

## 🚀 Запуск Proxy Server

Если вы находитесь в директории `server`:

```bash
# Установите зависимости (если еще не установлены)
npm install

# Запустите proxy server
npm start

# Или с автоперезагрузкой (dev режим)
npm run dev
```

**Важно:** Proxy server должен быть запущен **отдельно** от frontend приложения.

---

## 📝 Использование TransactionManager в коде

`TransactionManager` используется **внутри JavaScript файлов**, а не в терминале.

### Пример использования в VPNServiceApp.jsx:

```javascript
// В начале файла VPNServiceApp.jsx
import TransactionManager from './services/TransactionManager.js'
import ThreeXUI from './services/ThreeXUI.js'
import { db } from './firebase.js' // или как у вас настроен Firebase

// Создайте инстанс TransactionManager
const transactionManager = new TransactionManager(
  ThreeXUI.getInstance(),
  db
)

// В функции handleGetKey (вместо прямого вызова ThreeXUI.addClient):
async function handleGetKey(email, userData) {
  try {
    // Вместо:
    // await ThreeXUI.addClient(inboundId, email, uuid)
    
    // Используйте:
    const result = await transactionManager.addClientTransaction(
      email,
      {
        inboundId: import.meta.env.VITE_XUI_INBOUND_ID,
        uuid: ThreeXUI.generateUUID(),
        options: {
          totalGB: userData.totalGB || 0,
          expiryTime: userData.expiryTime || 0,
          limitIp: 1,
          enable: true
        }
      },
      {
        email: email,
        role: 'user',
        plan: userData.plan || 'free',
        createdAt: new Date().toISOString(),
        // ... другие поля для Firestore
      }
    )
    
    console.log('✅ Transaction successful:', result)
    return result
  } catch (error) {
    console.error('❌ Transaction failed:', error)
    throw error
  }
}
```

---

## 🔍 Проверка работы компонентов

### 1. Проверка Proxy Server:

```bash
# В терминале (не в shell, а через curl или браузер)
curl http://localhost:3001/health

# Должен вернуть:
# {"status":"ok","service":"xui-proxy","timestamp":"...","uptime":...}
```

### 2. Проверка ThreeXUI:

```javascript
// В браузерной консоли или в коде
import ThreeXUI from './services/ThreeXUI.js'

// Health check
const health = await ThreeXUI.healthCheck()
console.log(health)
```

### 3. Проверка TransactionManager:

```javascript
// В коде приложения
import TransactionManager from './services/TransactionManager.js'

// Получить список failed rollbacks
const failed = await transactionManager.getFailedRollbacks()
console.log('Failed rollbacks:', failed)
```

---

## ⚠️ Частые ошибки

### Ошибка: "zsh: command not found: import"

**Причина:** Вы пытаетесь выполнить JavaScript код в терминале.

**Решение:** 
- `import` используется только в `.js`/`.jsx` файлах
- Для запуска proxy server используйте: `npm start`
- Для проверки API используйте: `curl` или браузер

### Ошибка: "Cannot find module './services/TransactionManager.js'"

**Причина:** Неправильный путь импорта.

**Решение:**
- Убедитесь, что файл существует: `src/services/TransactionManager.js`
- Используйте относительный путь от вашего файла
- Проверьте, что вы в правильной директории

### Ошибка: "TransactionManager is not a constructor"

**Причина:** Неправильный импорт.

**Решение:**
```javascript
// ✅ Правильно
import TransactionManager from './services/TransactionManager.js'
const tm = new TransactionManager(ThreeXUI.getInstance(), db)

// ❌ Неправильно
import { TransactionManager } from './services/TransactionManager.js'
```

---

## 📚 Дополнительная документация

- **PRODUCTION_SETUP.md** - Полная настройка для production
- **3XUI_API_INTEGRATION_REPORT.md** - Детальная документация API
- **README.md** - Общая информация о проекте

---

**Нужна помощь?** Проверьте логи:
- Proxy server: смотрите вывод в терминале где запущен `npm start`
- Frontend: откройте DevTools в браузере (F12)
- Firestore: проверьте консоль Firebase

