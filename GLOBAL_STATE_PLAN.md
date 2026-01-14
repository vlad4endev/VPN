# План внедрения глобального состояния в React приложение

## 1. Выбор инструмента: React Query + Zustand (комбинированный подход)

### Почему React Query?
- ✅ **Автоматическое кеширование** - идеально для API запросов (3x-ui, Firestore)
- ✅ **Синхронизация данных** - background refetch, stale-while-revalidate
- ✅ **Оптимистичные обновления** - мгновенный UI feedback
- ✅ **Обработка загрузок и ошибок** - встроенные состояния `isLoading`, `isError`
- ✅ **Deduplication** - предотвращает дублирующие запросы
- ✅ **Автоматическая инвалидация** - после мутаций

### Почему Zustand?
- ✅ **Легковесный** (1KB) - для UI состояния (view, modals, editing states)
- ✅ **Простой API** - без boilerplate кода
- ✅ **TypeScript friendly** - отличная типизация
- ✅ **Не требует Provider** - можно использовать без обертки (опционально)

### Альтернатива: Только React Query
Если хотите один инструмент, React Query может управлять и UI состоянием через `queryClient.setQueryData`, но Zustand удобнее для локального UI состояния.

---

## 2. Установка зависимостей

```bash
npm install @tanstack/react-query zustand
```

---

## 3. Настройка QueryClientProvider

### 3.1. Создание QueryClient конфигурации

**Файл: `src/lib/react-query/config.js`**

```javascript
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Время, после которого данные считаются устаревшими
      staleTime: 5 * 60 * 1000, // 5 минут
      // Время хранения неиспользуемых данных в кеше
      cacheTime: 10 * 60 * 1000, // 10 минут
      // Автоматический refetch при фокусе окна
      refetchOnWindowFocus: true,
      // Retry при ошибках
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      // Retry для мутаций
      retry: 1,
    },
  },
})
```

### 3.2. Обертка приложения в QueryClientProvider

**Файл: `src/app/App.jsx`** (обновить существующий)

```javascript
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '../lib/react-query/config.js'
import VPNServiceApp from '../VPNServiceApp.jsx'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <VPNServiceApp />
    </QueryClientProvider>
  )
}

export default App
```

---

## 4. Создание Zustand store для UI состояния

**Файл: `src/lib/store/uiStore.js`**

```javascript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useUIStore = create(
  persist(
    (set) => ({
      // Текущий view (landing, dashboard, admin)
      view: 'landing',
      setView: (view) => set({ view }),

      // Модальные окна
      showKeyModal: false,
      setShowKeyModal: (show) => set({ showKeyModal: show }),

      showLogger: false,
      setShowLogger: (show) => set({ showLogger }),

      // Табы в админ-панели
      adminTab: 'users',
      setAdminTab: (tab) => set({ adminTab: tab }),

      // Табы в dashboard
      dashboardTab: 'subscription',
      setDashboardTab: (tab) => set({ dashboardTab: tab }),

      // Режимы редактирования
      editingUser: null,
      setEditingUser: (user) => set({ editingUser: user }),

      editingServer: null,
      setEditingServer: (server) => set({ editingServer: server }),

      editingTariff: null,
      setEditingTariff: (tariff) => set({ editingTariff: tariff }),

      editingProfile: false,
      setEditingProfile: (editing) => set({ editingProfile: editing }),

      // Временные данные форм
      profileData: { name: '', phone: '' },
      setProfileData: (data) => set({ profileData: data }),

      // Сообщения
      success: '',
      setSuccess: (message) => set({ success: message }),
      error: '',
      setError: (message) => set({ error: message }),

      // Очистка сообщений
      clearMessages: () => set({ success: '', error: '' }),
    }),
    {
      name: 'vpn-ui-storage',
      // Сохраняем только view и табы
      partialize: (state) => ({
        view: state.view,
        adminTab: state.adminTab,
        dashboardTab: state.dashboardTab,
      }),
    }
  )
)
```

---

## 5. Создание кастомных хуков для данных

### 5.1. Хук для пользователей (useUsers)

**Файл: `src/features/admin/hooks/useUsers.js`**

```javascript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collection, getDocs, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore'
import { useFirebase } from '../../../shared/hooks/useFirebase.js'
import { APP_ID } from '../../../shared/constants/app.js'
import logger from '../../../shared/utils/logger.js'
import ThreeXUI from '../../vpn/services/ThreeXUI.js'

/**
 * Хук для получения списка всех пользователей
 */
export function useUsers() {
  const { db } = useFirebase()

  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      if (!db) throw new Error('Firebase не инициализирован')

      const usersRef = collection(db, `artifacts/${APP_ID}/users`)
      const snapshot = await getDocs(usersRef)
      
      const users = []
      snapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() })
      })

      logger.info('Users', 'Загружены пользователи', { count: users.length })
      return users
    },
    enabled: !!db, // Запрос выполнится только если db доступен
    staleTime: 2 * 60 * 1000, // 2 минуты
  })
}

/**
 * Хук для обновления пользователя
 */
export function useUpdateUser() {
  const { db, auth } = useFirebase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, updates }) => {
      if (!db || !auth.currentUser) {
        throw new Error('Не авторизован или Firebase не инициализирован')
      }

      const userRef = doc(db, `artifacts/${APP_ID}/users/${userId}`)
      await updateDoc(userRef, {
        ...updates,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser.uid,
      })

      logger.info('Users', 'Пользователь обновлен', { userId, updates })
      return { userId, updates }
    },
    onSuccess: () => {
      // Инвалидируем кеш пользователей
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

/**
 * Хук для удаления пользователя
 */
export function useDeleteUser() {
  const { db, auth } = useFirebase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, email }) => {
      if (!db || !auth.currentUser) {
        throw new Error('Не авторизован или Firebase не инициализирован')
      }

      // Удаляем из Firestore
      const userRef = doc(db, `artifacts/${APP_ID}/users/${userId}`)
      await deleteDoc(userRef)

      // Удаляем из 3x-ui (если есть email)
      if (email) {
        try {
          const inboundId = import.meta.env.VITE_XUI_INBOUND_ID
          if (inboundId) {
            await ThreeXUI.deleteClient(inboundId, email)
          }
        } catch (err) {
          logger.warn('Users', 'Ошибка удаления из 3x-ui (игнорируем)', { email }, err)
        }
      }

      logger.info('Users', 'Пользователь удален', { userId, email })
      return { userId }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
```

### 5.2. Хук для серверов (useServers)

**Файл: `src/features/admin/hooks/useServers.js`**

```javascript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useFirebase } from '../../../shared/hooks/useFirebase.js'
import { APP_ID } from '../../../shared/constants/app.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Хук для получения настроек (включая серверы)
 */
export function useSettings() {
  const { db } = useFirebase()

  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      if (!db) throw new Error('Firebase не инициализирован')

      const settingsRef = doc(db, `artifacts/${APP_ID}/public/settings`)
      const snapshot = await getDoc(settingsRef)

      if (!snapshot.exists()) {
        // Возвращаем настройки по умолчанию
        return {
          serverIP: import.meta.env.VITE_XUI_HOST || 'http://localhost',
          serverPort: Number(import.meta.env.VITE_XUI_PORT) || 2053,
          xuiUsername: import.meta.env.VITE_XUI_USERNAME || '',
          xuiPassword: import.meta.env.VITE_XUI_PASSWORD || '',
          xuiInboundId: import.meta.env.VITE_XUI_INBOUND_ID || '',
          servers: [],
        }
      }

      const data = snapshot.data()
      logger.info('Settings', 'Настройки загружены', { 
        serversCount: data.servers?.length || 0 
      })
      return data
    },
    enabled: !!db,
    staleTime: 5 * 60 * 1000, // 5 минут
  })
}

/**
 * Хук для получения списка серверов
 */
export function useServers() {
  const { data: settings } = useSettings()

  return {
    servers: settings?.servers || [],
    isLoading: !settings,
  }
}

/**
 * Хук для сохранения настроек (включая серверы)
 */
export function useSaveSettings() {
  const { db, auth } = useFirebase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings) => {
      if (!db || !auth.currentUser) {
        throw new Error('Не авторизован или Firebase не инициализирован')
      }

      const settingsRef = doc(db, `artifacts/${APP_ID}/public/settings`)
      await setDoc(settingsRef, {
        ...settings,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser.uid,
      }, { merge: true })

      logger.info('Settings', 'Настройки сохранены', { 
        serversCount: settings.servers?.length || 0 
      })
      return settings
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}

/**
 * Хук для тестирования сессии сервера
 */
export function useTestServerSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ serverId, server }) => {
      // Логика тестирования сессии
      // ... (ваш существующий код)
      
      return { serverId, sessionData: {} }
    },
    onSuccess: (data) => {
      // Обновляем кеш настроек с результатами теста
      queryClient.setQueryData(['settings'], (old) => {
        if (!old) return old
        return {
          ...old,
          servers: old.servers.map((s) =>
            s.id === data.serverId
              ? { ...s, sessionTested: true, sessionTestedAt: Date.now() }
              : s
          ),
        }
      })
    },
  })
}
```

### 5.3. Хук для тарифов (useTariffs)

**Файл: `src/features/dashboard/hooks/useTariffs.js`**

```javascript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore'
import { useFirebase } from '../../../shared/hooks/useFirebase.js'
import { APP_ID } from '../../../shared/constants/app.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Хук для получения тарифов
 */
export function useTariffs() {
  const { db } = useFirebase()

  return useQuery({
    queryKey: ['tariffs'],
    queryFn: async () => {
      if (!db) throw new Error('Firebase не инициализирован')

      const tariffsRef = collection(db, `artifacts/${APP_ID}/tariffs`)
      const snapshot = await getDocs(tariffsRef)

      const tariffs = []
      snapshot.forEach((doc) => {
        tariffs.push({ id: doc.id, ...doc.data() })
      })

      // Фильтруем только SUPER и MULTI
      const filtered = tariffs.filter((t) => {
        const plan = t.plan?.toLowerCase()
        const name = t.name?.toLowerCase()
        return plan === 'super' || plan === 'multi' || name === 'super' || name === 'multi'
      })

      logger.info('Tariffs', 'Тарифы загружены', { 
        total: tariffs.length, 
        filtered: filtered.length 
      })
      return filtered
    },
    enabled: !!db,
    staleTime: 10 * 60 * 1000, // 10 минут (тарифы редко меняются)
  })
}

/**
 * Хук для сохранения тарифа
 */
export function useSaveTariff() {
  const { db, auth } = useFirebase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ tariffId, tariff }) => {
      if (!db || !auth.currentUser) {
        throw new Error('Не авторизован или Firebase не инициализирован')
      }

      const tariffRef = doc(db, `artifacts/${APP_ID}/tariffs/${tariffId}`)
      await setDoc(tariffRef, {
        ...tariff,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser.uid,
      }, { merge: true })

      logger.info('Tariffs', 'Тариф сохранен', { tariffId })
      return { tariffId, tariff }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tariffs'] })
    },
  })
}

/**
 * Хук для удаления тарифа
 */
export function useDeleteTariff() {
  const { db } = useFirebase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ tariffId }) => {
      if (!db) throw new Error('Firebase не инициализирован')

      const tariffRef = doc(db, `artifacts/${APP_ID}/tariffs/${tariffId}`)
      await deleteDoc(tariffRef)

      logger.info('Tariffs', 'Тариф удален', { tariffId })
      return { tariffId }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tariffs'] })
    },
  })
}
```

### 5.4. Хук для текущего пользователя (useCurrentUser)

**Файл: `src/features/auth/hooks/useCurrentUser.js`**

```javascript
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { useFirebase } from '../../../shared/hooks/useFirebase.js'
import { APP_ID } from '../../../shared/constants/app.js'

/**
 * Хук для получения текущего пользователя
 */
export function useCurrentUser() {
  const { auth, db } = useFirebase()
  const [firebaseUser, setFirebaseUser] = useState(null)

  // Отслеживаем изменения авторизации
  useEffect(() => {
    if (!auth) return

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user)
    })

    return unsubscribe
  }, [auth])

  // Загружаем данные пользователя из Firestore
  const { data: userData, isLoading, error } = useQuery({
    queryKey: ['currentUser', firebaseUser?.uid],
    queryFn: async () => {
      if (!firebaseUser || !db) return null

      const userRef = doc(db, `artifacts/${APP_ID}/users/${firebaseUser.uid}`)
      const snapshot = await getDoc(userRef)

      if (!snapshot.exists()) {
        return {
          id: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || '',
          role: 'user',
          plan: 'free',
        }
      }

      return {
        id: firebaseUser.uid,
        email: firebaseUser.email,
        ...snapshot.data(),
      }
    },
    enabled: !!firebaseUser && !!db,
    staleTime: 1 * 60 * 1000, // 1 минута
  })

  return {
    user: userData,
    isLoading,
    error,
    firebaseUser,
  }
}
```

### 5.5. Хук для платежей (usePayments)

**Файл: `src/features/dashboard/hooks/usePayments.js`**

```javascript
import { useQuery } from '@tanstack/react-query'
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore'
import { useFirebase } from '../../../shared/hooks/useFirebase.js'
import { APP_ID } from '../../../shared/constants/app.js'

/**
 * Хук для получения платежей пользователя
 */
export function usePayments(userId) {
  const { db } = useFirebase()

  return useQuery({
    queryKey: ['payments', userId],
    queryFn: async () => {
      if (!db || !userId) return []

      const paymentsRef = collection(db, `artifacts/${APP_ID}/payments`)
      const q = query(
        paymentsRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(50)
      )

      const snapshot = await getDocs(q)
      const payments = []
      snapshot.forEach((doc) => {
        payments.push({ id: doc.id, ...doc.data() })
      })

      return payments
    },
    enabled: !!db && !!userId,
    staleTime: 2 * 60 * 1000, // 2 минуты
  })
}
```

---

## 6. Интеграция с компонентами

### 6.1. Обновление VPNServiceApp.jsx

**Пример использования в компоненте:**

```javascript
import { useCurrentUser } from './features/auth/hooks/useCurrentUser.js'
import { useUsers } from './features/admin/hooks/useUsers.js'
import { useServers, useSaveSettings } from './features/admin/hooks/useServers.js'
import { useTariffs } from './features/dashboard/hooks/useTariffs.js'
import { usePayments } from './features/dashboard/hooks/usePayments.js'
import { useUIStore } from './lib/store/uiStore.js'

export default function VPNServiceApp() {
  // UI состояние из Zustand
  const {
    view,
    setView,
    showKeyModal,
    setShowKeyModal,
    adminTab,
    setAdminTab,
    dashboardTab,
    setDashboardTab,
    success,
    error,
    setSuccess,
    setError,
    clearMessages,
  } = useUIStore()

  // Данные из React Query
  const { user: currentUser, isLoading: userLoading } = useCurrentUser()
  const { data: users = [], isLoading: usersLoading } = useUsers()
  const { servers, isLoading: serversLoading } = useServers()
  const { data: tariffs = [], isLoading: tariffsLoading } = useTariffs()
  const { data: payments = [], isLoading: paymentsLoading } = usePayments(currentUser?.id)

  // Мутации
  const saveSettingsMutation = useSaveSettings()

  // Обработчики
  const handleSaveSettings = async () => {
    try {
      await saveSettingsMutation.mutateAsync(settings)
      setSuccess('Настройки сохранены')
    } catch (err) {
      setError('Ошибка сохранения настроек')
    }
  }

  // Автоматическая очистка сообщений
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => clearMessages(), 3000)
      return () => clearTimeout(timer)
    }
  }, [success, error, clearMessages])

  if (userLoading) {
    return <div>Загрузка...</div>
  }

  return (
    <div>
      {/* Ваш JSX */}
    </div>
  )
}
```

### 6.2. Обновление Dashboard.jsx

```javascript
import { useTariffs } from '../hooks/useTariffs.js'
import { usePayments } from '../hooks/usePayments.js'
import { useCurrentUser } from '../../auth/hooks/useCurrentUser.js'
import { useUIStore } from '../../../lib/store/uiStore.js'

export default function Dashboard() {
  const { user: currentUser } = useCurrentUser()
  const { data: tariffs = [] } = useTariffs()
  const { data: payments = [] } = usePayments(currentUser?.id)
  
  const {
    dashboardTab,
    setDashboardTab,
    showKeyModal,
    setShowKeyModal,
  } = useUIStore()

  // ... остальной код
}
```

### 6.3. Обновление AdminPanel.jsx

```javascript
import { useUsers, useUpdateUser, useDeleteUser } from '../hooks/useUsers.js'
import { useServers, useSaveSettings } from '../hooks/useServers.js'
import { useTariffs, useSaveTariff, useDeleteTariff } from '../hooks/useTariffs.js'
import { useUIStore } from '../../../lib/store/uiStore.js'

export default function AdminPanel() {
  const { data: users = [] } = useUsers()
  const { servers } = useServers()
  const { data: tariffs = [] } = useTariffs()
  
  const updateUserMutation = useUpdateUser()
  const deleteUserMutation = useDeleteUser()
  const saveSettingsMutation = useSaveSettings()

  const {
    adminTab,
    setAdminTab,
    editingUser,
    setEditingUser,
    editingServer,
    setEditingServer,
    editingTariff,
    setEditingTariff,
  } = useUIStore()

  const handleUpdateUser = async (userId, updates) => {
    try {
      await updateUserMutation.mutateAsync({ userId, updates })
      setEditingUser(null)
    } catch (err) {
      // Ошибка обработается автоматически
    }
  }

  // ... остальной код
}
```

---

## 7. Миграция существующего кода

### Шаги миграции:

1. **Установить зависимости:**
   ```bash
   npm install @tanstack/react-query zustand
   ```

2. **Создать структуру файлов:**
   ```
   src/
     lib/
       react-query/
         config.js
       store/
         uiStore.js
     features/
       admin/
         hooks/
           useUsers.js
           useServers.js
       dashboard/
         hooks/
           useTariffs.js
           usePayments.js
       auth/
         hooks/
           useCurrentUser.js
   ```

3. **Обернуть App в QueryClientProvider** (в `src/app/App.jsx`)

4. **Постепенно заменять useState на хуки:**
   - Сначала данные (users, servers, tariffs) → React Query
   - Затем UI состояние (view, modals) → Zustand

5. **Удалить старые useState** после миграции

---

## 8. Преимущества после миграции

✅ **Автоматическое кеширование** - данные не перезагружаются без необходимости  
✅ **Оптимистичные обновления** - UI обновляется мгновенно  
✅ **Меньше кода** - нет ручного управления loading/error состояниями  
✅ **Лучшая производительность** - deduplication запросов  
✅ **Проще тестирование** - хуки легко мокать  
✅ **TypeScript поддержка** - отличная типизация из коробки  

---

## 9. Дополнительные возможности

### 9.1. Prefetching данных

```javascript
// Предзагрузка данных при наведении
const queryClient = useQueryClient()

const handleMouseEnter = () => {
  queryClient.prefetchQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  })
}
```

### 9.2. Infinite Queries для пагинации

```javascript
import { useInfiniteQuery } from '@tanstack/react-query'

export function useInfiniteUsers() {
  return useInfiniteQuery({
    queryKey: ['users', 'infinite'],
    queryFn: ({ pageParam = 0 }) => fetchUsers({ offset: pageParam, limit: 20 }),
    getNextPageParam: (lastPage, pages) => lastPage.nextOffset,
  })
}
```

### 9.3. Оптимистичные обновления

```javascript
const updateUserMutation = useMutation({
  mutationFn: updateUser,
  onMutate: async (newUser) => {
    // Отменяем исходящие запросы
    await queryClient.cancelQueries({ queryKey: ['users'] })
    
    // Сохраняем предыдущее значение
    const previousUsers = queryClient.getQueryData(['users'])
    
    // Оптимистично обновляем
    queryClient.setQueryData(['users'], (old) =>
      old.map((u) => (u.id === newUser.id ? newUser : u))
    )
    
    return { previousUsers }
  },
  onError: (err, newUser, context) => {
    // Откатываем при ошибке
    queryClient.setQueryData(['users'], context.previousUsers)
  },
})
```

---

## 10. Checklist миграции

- [ ] Установить `@tanstack/react-query` и `zustand`
- [ ] Создать `QueryClient` конфигурацию
- [ ] Обернуть App в `QueryClientProvider`
- [ ] Создать `uiStore` для UI состояния
- [ ] Создать хуки для данных (useUsers, useServers, useTariffs)
- [ ] Заменить useState на хуки в VPNServiceApp
- [ ] Обновить Dashboard компонент
- [ ] Обновить AdminPanel компонент
- [ ] Удалить старые useState и useEffect
- [ ] Протестировать все функции
- [ ] Проверить производительность

---

## Заключение

Этот план обеспечивает:
- ✅ Четкое разделение серверных данных (React Query) и UI состояния (Zustand)
- ✅ Автоматическое кеширование и синхронизацию
- ✅ Упрощение кода и улучшение производительности
- ✅ Легкую миграцию существующего кода

Начните с малого: сначала мигрируйте один модуль (например, users), затем остальные.

