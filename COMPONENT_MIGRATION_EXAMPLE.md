# 📝 Пример миграции компонента на Proxy

## Пример: Обновление компонента для добавления VPN клиента

### ❌ БЫЛО (старый код):

```javascript
// src/features/admin/components/UserCard.jsx
import { useState } from 'react'
import { useXUI } from '../../vpn/hooks/useXUI.js'
import ThreeXUI from '../../vpn/services/ThreeXUI.js' // ❌ УДАЛИТЬ
import { updateDoc, doc } from 'firebase/firestore'
import { db } from '../../../lib/firebase/config.js'

function UserCard({ user, settings }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleAddVPN = async () => {
    setLoading(true)
    setError(null)

    try {
      // ❌ Старый способ: прямой вызов ThreeXUI
      const uuid = ThreeXUI.generateUUID()
      await ThreeXUI.addClient(
        settings.xuiInboundId,
        user.email,
        uuid,
        {
          totalGB: user.trafficGB || 0,
          expiryTime: user.expiresAt ? new Date(user.expiresAt).getTime() : 0,
          limitIp: user.devices || 1,
        },
        server
      )

      // ❌ Прямая запись в Firestore
      const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
      await updateDoc(userDoc, {
        vpnUuid: uuid,
        vpnStatus: 'active',
        vpnInboundId: settings.xuiInboundId,
        status: 'active',
      })

      alert('VPN клиент добавлен!')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button onClick={handleAddVPN} disabled={loading}>
        {loading ? 'Добавление...' : 'Добавить VPN'}
      </button>
      {error && <div className="error">{error}</div>}
    </div>
  )
}
```

### ✅ СТАЛО (новый код):

```javascript
// src/features/admin/components/UserCard.jsx
import { useState } from 'react'
import { useXUI } from '../../vpn/hooks/useXUI.js'
// ❌ УДАЛЕНО: import ThreeXUI
// ❌ УДАЛЕНО: import { updateDoc, doc } from 'firebase/firestore'
// ❌ УДАЛЕНО: import { db }

function UserCard({ user, settings }) {
  const { addClient, initialized } = useXUI() // ✅ Используем Proxy
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleAddVPN = async () => {
    if (!initialized) {
      setError('Proxy недоступен')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // ✅ Новый способ: через Proxy (Backend выполняет транзакцию)
      const result = await addClient({
        userId: user.id, // ✅ Backend обновит Firestore
        email: user.email,
        inboundId: settings.xuiInboundId,
        totalGB: user.trafficGB || 0,
        expiryTime: user.expiresAt ? new Date(user.expiresAt).getTime() : 0,
        limitIp: user.devices || 1,
      })

      // ✅ Firestore уже обновлен Backend'ом!
      // Просто показываем успех
      alert(`VPN клиент добавлен! UUID: ${result.vpnUuid}`)
      
      // Опционально: обновить локальное состояние, если нужно
      // (данные уже в Firestore, можно перезагрузить список)
    } catch (err) {
      // ✅ Backend уже обновил Firestore с status: 'error'
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button onClick={handleAddVPN} disabled={loading || !initialized}>
        {loading ? 'Добавление...' : 'Добавить VPN'}
      </button>
      {error && <div className="error">{error}</div>}
      {!initialized && <div className="warning">Proxy недоступен</div>}
    </div>
  )
}
```

---

## Ключевые изменения:

### 1. Импорты

**Удалить:**
```javascript
import ThreeXUI from '../../vpn/services/ThreeXUI.js'
import { updateDoc, doc } from 'firebase/firestore'
import { db } from '../../../lib/firebase/config.js'
```

**Добавить/Использовать:**
```javascript
import { useXUI } from '../../vpn/hooks/useXUI.js'
```

### 2. Методы

**Было:**
```javascript
const uuid = ThreeXUI.generateUUID()
await ThreeXUI.addClient(inboundId, email, uuid, options, server)
await updateDoc(userDoc, { vpnUuid: uuid, vpnStatus: 'active' })
```

**Стало:**
```javascript
const { addClient, generateUUID } = useXUI()
const result = await addClient({
  userId: user.id,
  email: user.email,
  inboundId: settings.xuiInboundId,
  // ... options
})
// Firestore уже обновлен!
```

### 3. Обработка ошибок

**Было:**
```javascript
try {
  await ThreeXUI.addClient(...)
  await updateDoc(...) // Может упасть здесь
} catch (err) {
  // Нужно обрабатывать rollback вручную
}
```

**Стало:**
```javascript
try {
  await addClient({...})
  // Все уже сделано (транзакция на backend)
} catch (err) {
  // Backend уже обновил Firestore с status: 'error'
  // Просто показываем ошибку
}
```

### 4. Проверка инициализации

**Добавить:**
```javascript
const { initialized } = useXUI()

if (!initialized) {
  // Proxy недоступен
  return <div>Proxy недоступен</div>
}
```

---

## Чеклист миграции:

- [ ] Удалить импорты `ThreeXUI`
- [ ] Удалить импорты `updateDoc`, `doc`, `db` для VPN операций
- [ ] Добавить `useXUI()` хук
- [ ] Заменить `ThreeXUI.addClient()` на `addClient({...})`
- [ ] Убрать прямые записи в Firestore для VPN статуса
- [ ] Добавить проверку `initialized`
- [ ] Обновить обработку ошибок
- [ ] Протестировать через Proxy

---

**Дата:** 2025-01-27
