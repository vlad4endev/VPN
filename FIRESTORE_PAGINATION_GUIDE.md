# 🔥 Cursor-Based Pagination в Firestore

## 📋 Содержание

1. [Введение](#введение)
2. [Основы Cursor-Based Pagination](#основы-cursor-based-pagination)
3. [Реализация с startAfter и limit](#реализация-с-startafter-и-limit)
4. [UI-контролы для пагинации](#ui-контролы-для-пагинации)
5. [Эффективность при большом количестве записей](#эффективность-при-большом-количестве-записей)
6. [Полные примеры кода](#полные-примеры-кода)

---

## Введение

**Cursor-based pagination** (пагинация на основе курсора) — это метод разбиения больших наборов данных на страницы, при котором используется "курсор" (последний документ предыдущей страницы) для определения начала следующей страницы.

### Преимущества перед offset-based pagination:

- ✅ **Стабильность**: Не зависит от изменений данных между запросами
- ✅ **Производительность**: O(n) вместо O(n + offset) для больших offset
- ✅ **Экономия**: Платите только за загруженные документы
- ✅ **Масштабируемость**: Работает эффективно даже с миллионами записей

---

## Основы Cursor-Based Pagination

### Как это работает:

1. **Первая страница**: Загружаем первые N документов с `limit(N)`
2. **Следующая страница**: Используем последний документ предыдущей страницы как курсор с `startAfter(lastDoc)`
3. **Предыдущая страница**: Сохраняем курсоры для каждой страницы в стеке

### Ключевые методы Firestore:

- `limit(n)` — ограничивает количество документов
- `startAfter(docSnapshot)` — начинает запрос после указанного документа
- `startAt(docSnapshot)` — начинает запрос с указанного документа (включительно)
- `endBefore(docSnapshot)` — заканчивает запрос перед указанным документом
- `orderBy(field)` — обязателен для cursor-based pagination

---

## Реализация с startAfter и limit

### 1. Базовый хук для пагинации

```javascript
// src/shared/hooks/useFirestorePagination.js
import { useState, useCallback, useRef } from 'react'
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  startAfter, 
  getDocs,
  QueryDocumentSnapshot,
  QueryConstraint
} from 'firebase/firestore'
import logger from '../utils/logger.js'

/**
 * Хук для cursor-based pagination в Firestore
 * 
 * @param {Firestore} db - Экземпляр Firestore
 * @param {string} collectionPath - Путь к коллекции
 * @param {Object} options - Опции пагинации
 * @param {number} options.pageSize - Размер страницы (по умолчанию 10)
 * @param {string} options.orderByField - Поле для сортировки (обязательно)
 * @param {'asc' | 'desc'} options.orderDirection - Направление сортировки
 * @param {Array} options.whereConditions - Дополнительные условия where
 * 
 * @returns {Object} Объект с данными и методами пагинации
 */
export function useFirestorePagination(db, collectionPath, options = {}) {
  const {
    pageSize = 10,
    orderByField,
    orderDirection = 'desc',
    whereConditions = []
  } = options

  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [isFirstPage, setIsFirstPage] = useState(true)

  // Стек курсоров для навигации назад
  const cursorStackRef = useRef([])
  // Текущий курсор (последний документ текущей страницы)
  const lastDocRef = useRef(null)
  // Первый документ текущей страницы (для навигации назад)
  const firstDocRef = useRef(null)

  /**
   * Загрузка следующей страницы
   */
  const loadNextPage = useCallback(async () => {
    if (!db || !collectionPath || !orderByField) {
      setError('Не указаны обязательные параметры: db, collectionPath, orderByField')
      return
    }

    if (loading || !hasMore) return

    setLoading(true)
    setError(null)

    try {
      logger.info('Pagination', 'Загрузка следующей страницы', {
        collectionPath,
        pageSize,
        hasCursor: !!lastDocRef.current
      })

      // Строим базовый запрос
      const collectionRef = collection(db, collectionPath)
      const constraints = [
        orderBy(orderByField, orderDirection),
        limit(pageSize + 1) // Загружаем на 1 больше для проверки hasMore
      ]

      // Добавляем курсор, если это не первая страница
      if (lastDocRef.current) {
        constraints.push(startAfter(lastDocRef.current))
      }

      // Добавляем дополнительные условия where
      if (whereConditions.length > 0) {
        constraints.push(...whereConditions)
      }

      const q = query(collectionRef, ...constraints)
      const querySnapshot = await getDocs(q)

      const documents = []
      querySnapshot.forEach((doc) => {
        documents.push({
          id: doc.id,
          ...doc.data()
        })
      })

      // Проверяем, есть ли еще данные
      const hasMoreData = documents.length > pageSize
      if (hasMoreData) {
        // Удаляем лишний документ
        documents.pop()
      }

      // Обновляем курсоры
      if (documents.length > 0) {
        // Сохраняем первый документ текущей страницы для навигации назад
        if (isFirstPage) {
          firstDocRef.current = querySnapshot.docs[0]
        }

        // Сохраняем последний документ как курсор для следующей страницы
        const lastIndex = querySnapshot.docs.length - (hasMoreData ? 2 : 1)
        lastDocRef.current = querySnapshot.docs[lastIndex]

        // Добавляем курсор в стек для навигации назад
        cursorStackRef.current.push({
          firstDoc: firstDocRef.current,
          lastDoc: lastDocRef.current
        })
      }

      setData(documents)
      setHasMore(hasMoreData)
      setIsFirstPage(false)

      logger.info('Pagination', 'Страница загружена', {
        collectionPath,
        documentsCount: documents.length,
        hasMore: hasMoreData
      })
    } catch (err) {
      logger.error('Pagination', 'Ошибка загрузки страницы', {
        collectionPath,
        error: err.message
      }, err)
      setError(err.message || 'Ошибка загрузки данных')
    } finally {
      setLoading(false)
    }
  }, [db, collectionPath, pageSize, orderByField, orderDirection, whereConditions, loading, hasMore, isFirstPage])

  /**
   * Загрузка предыдущей страницы
   */
  const loadPreviousPage = useCallback(async () => {
    if (!db || !collectionPath || !orderByField) {
      setError('Не указаны обязательные параметры')
      return
    }

    if (loading || cursorStackRef.current.length <= 1) {
      // Если в стеке только текущая страница, нельзя идти назад
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Удаляем текущую страницу из стека
      cursorStackRef.current.pop()

      // Получаем курсор предыдущей страницы
      const previousPage = cursorStackRef.current[cursorStackRef.current.length - 1]

      logger.info('Pagination', 'Загрузка предыдущей страницы', {
        collectionPath,
        pageSize,
        stackSize: cursorStackRef.current.length
      })

      const collectionRef = collection(db, collectionPath)
      const constraints = [
        orderBy(orderByField, orderDirection),
        limit(pageSize + 1)
      ]

      // Если есть курсор предыдущей страницы, используем его
      if (previousPage) {
        constraints.push(startAfter(previousPage.lastDoc))
      }

      // Добавляем дополнительные условия where
      if (whereConditions.length > 0) {
        constraints.push(...whereConditions)
      }

      const q = query(collectionRef, ...constraints)
      const querySnapshot = await getDocs(q)

      const documents = []
      querySnapshot.forEach((doc) => {
        documents.push({
          id: doc.id,
          ...doc.data()
        })
      })

      // Проверяем, есть ли еще данные
      const hasMoreData = documents.length > pageSize
      if (hasMoreData) {
        documents.pop()
      }

      // Обновляем курсоры
      if (documents.length > 0) {
        const lastIndex = querySnapshot.docs.length - (hasMoreData ? 2 : 1)
        lastDocRef.current = querySnapshot.docs[lastIndex]
        firstDocRef.current = querySnapshot.docs[0]
      }

      // Проверяем, первая ли это страница
      const isFirst = cursorStackRef.current.length <= 1
      setIsFirstPage(isFirst)
      setHasMore(true) // При навигации назад всегда есть следующая страница

      setData(documents)

      logger.info('Pagination', 'Предыдущая страница загружена', {
        collectionPath,
        documentsCount: documents.length,
        isFirstPage: isFirst
      })
    } catch (err) {
      logger.error('Pagination', 'Ошибка загрузки предыдущей страницы', {
        collectionPath,
        error: err.message
      }, err)
      setError(err.message || 'Ошибка загрузки данных')
    } finally {
      setLoading(false)
    }
  }, [db, collectionPath, pageSize, orderByField, orderDirection, whereConditions, loading])

  /**
   * Сброс пагинации (вернуться к первой странице)
   */
  const reset = useCallback(() => {
    cursorStackRef.current = []
    lastDocRef.current = null
    firstDocRef.current = null
    setData([])
    setHasMore(true)
    setIsFirstPage(true)
    setError(null)
  }, [])

  /**
   * Перезагрузка текущей страницы
   */
  const reload = useCallback(() => {
    reset()
    loadNextPage()
  }, [reset, loadNextPage])

  return {
    data,
    loading,
    error,
    hasMore,
    isFirstPage,
    canGoBack: cursorStackRef.current.length > 1,
    loadNextPage,
    loadPreviousPage,
    reset,
    reload
  }
}
```

### 2. Пример использования для списка пользователей

```javascript
// src/features/admin/hooks/useUsersPagination.js
import { useFirestorePagination } from '../../../shared/hooks/useFirestorePagination.js'
import { useFirebase } from '../../../shared/hooks/useFirebase.js'
import { APP_ID } from '../../../shared/constants/app.js'
import { where } from 'firebase/firestore'

/**
 * Хук для пагинации пользователей с фильтрацией
 */
export function useUsersPagination(filters = {}) {
  const { db } = useFirebase()
  
  const collectionPath = `artifacts/${APP_ID}/public/data/users_v4`
  
  // Строим условия where на основе фильтров
  const whereConditions = []
  if (filters.role) {
    whereConditions.push(where('role', '==', filters.role))
  }
  if (filters.status) {
    whereConditions.push(where('status', '==', filters.status))
  }

  return useFirestorePagination(db, collectionPath, {
    pageSize: 20,
    orderByField: 'createdAt',
    orderDirection: 'desc',
    whereConditions
  })
}
```

### 3. Компонент с UI-контролами

```jsx
// src/shared/components/PaginatedList.jsx
import React from 'react'

/**
 * Компонент списка с пагинацией
 */
export function PaginatedList({
  data,
  loading,
  error,
  hasMore,
  isFirstPage,
  canGoBack,
  onNextPage,
  onPreviousPage,
  renderItem,
  emptyMessage = 'Нет данных',
  loadingMessage = 'Загрузка...'
}) {
  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">Ошибка: {error}</p>
      </div>
    )
  }

  if (loading && data.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        {loadingMessage}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Список элементов */}
      <div className="space-y-2">
        {data.map((item) => renderItem(item))}
      </div>

      {/* Контролы пагинации */}
      <div className="flex items-center justify-between pt-4 border-t">
        <button
          onClick={onPreviousPage}
          disabled={isFirstPage || loading}
          className={`
            px-4 py-2 rounded-lg font-medium transition-colors
            ${isFirstPage || loading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
            }
          `}
        >
          ← Назад
        </button>

        <div className="text-sm text-gray-600">
          Загружено: {data.length} {data.length === 1 ? 'элемент' : 'элементов'}
        </div>

        <button
          onClick={onNextPage}
          disabled={!hasMore || loading}
          className={`
            px-4 py-2 rounded-lg font-medium transition-colors
            ${!hasMore || loading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
            }
          `}
        >
          Вперед →
        </button>
      </div>

      {/* Индикатор загрузки при подгрузке следующей страницы */}
      {loading && data.length > 0 && (
        <div className="text-center text-gray-500 text-sm py-2">
          Загрузка...
        </div>
      )}
    </div>
  )
}
```

### 4. Полный пример использования в компоненте

```jsx
// src/features/admin/components/UsersList.jsx
import React, { useEffect } from 'react'
import { useUsersPagination } from '../hooks/useUsersPagination.js'
import { PaginatedList } from '../../../shared/components/PaginatedList.jsx'

export function UsersList({ filters }) {
  const {
    data: users,
    loading,
    error,
    hasMore,
    isFirstPage,
    canGoBack,
    loadNextPage,
    loadPreviousPage,
    reset
  } = useUsersPagination(filters)

  // Сброс при изменении фильтров
  useEffect(() => {
    reset()
    loadNextPage()
  }, [JSON.stringify(filters)])

  const renderUser = (user) => (
    <div
      key={user.id}
      className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{user.email || user.username}</h3>
          <p className="text-sm text-gray-500">
            Роль: {user.role || 'user'} | Статус: {user.status || 'active'}
          </p>
        </div>
        <div className="text-sm text-gray-400">
          {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Пользователи</h2>
        <button
          onClick={reset}
          className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          Сбросить
        </button>
      </div>

      <PaginatedList
        data={users}
        loading={loading}
        error={error}
        hasMore={hasMore}
        isFirstPage={isFirstPage}
        canGoBack={canGoBack}
        onNextPage={loadNextPage}
        onPreviousPage={loadPreviousPage}
        renderItem={renderUser}
        emptyMessage="Пользователи не найдены"
        loadingMessage="Загрузка пользователей..."
      />
    </div>
  )
}
```

---

## UI-контролы для пагинации

### 1. Базовые контролы (кнопки Назад/Вперед)

```jsx
// src/shared/components/PaginationControls.jsx
import React from 'react'

export function PaginationControls({
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
  loading,
  currentCount,
  totalCount
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200">
      <button
        onClick={onPrevious}
        disabled={!hasPrevious || loading}
        className={`
          flex items-center px-4 py-2 text-sm font-medium rounded-md
          ${!hasPrevious || loading
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }
        `}
      >
        <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Назад
      </button>

      <div className="text-sm text-gray-700">
        {currentCount > 0 && (
          <span>
            Показано <strong>{currentCount}</strong>
            {totalCount !== null && ` из ${totalCount}`} записей
          </span>
        )}
      </div>

      <button
        onClick={onNext}
        disabled={!hasNext || loading}
        className={`
          flex items-center px-4 py-2 text-sm font-medium rounded-md
          ${!hasNext || loading
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }
        `}
      >
        Вперед
        <svg className="w-5 h-5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}
```

### 2. Продвинутые контролы с индикатором загрузки

```jsx
// src/shared/components/AdvancedPaginationControls.jsx
import React from 'react'

export function AdvancedPaginationControls({
  onNext,
  onPrevious,
  onFirst,
  hasNext,
  hasPrevious,
  isFirstPage,
  loading,
  currentPage,
  pageSize,
  totalLoaded
}) {
  return (
    <div className="bg-white px-4 py-3 border-t border-gray-200">
      <div className="flex items-center justify-between">
        {/* Левая часть: кнопки навигации */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onFirst}
            disabled={isFirstPage || loading}
            className={`
              px-3 py-1.5 text-sm font-medium rounded-md
              ${isFirstPage || loading
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }
            `}
            title="В начало"
          >
            ⏮
          </button>
          
          <button
            onClick={onPrevious}
            disabled={!hasPrevious || loading}
            className={`
              px-3 py-1.5 text-sm font-medium rounded-md
              ${!hasPrevious || loading
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }
            `}
          >
            ← Назад
          </button>
        </div>

        {/* Центральная часть: информация и индикатор */}
        <div className="flex items-center space-x-4">
          {loading && (
            <div className="flex items-center text-sm text-gray-500">
              <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Загрузка...
            </div>
          )}
          
          <div className="text-sm text-gray-600">
            Загружено: <strong>{totalLoaded}</strong> записей
          </div>
        </div>

        {/* Правая часть: кнопка "Вперед" */}
        <div>
          <button
            onClick={onNext}
            disabled={!hasNext || loading}
            className={`
              px-3 py-1.5 text-sm font-medium rounded-md
              ${!hasNext || loading
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }
            `}
          >
            Вперед →
          </button>
        </div>
      </div>
    </div>
  )
}
```

### 3. Infinite Scroll (бесконечная прокрутка)

```jsx
// src/shared/components/InfiniteScrollList.jsx
import React, { useEffect, useRef, useCallback } from 'react'

/**
 * Компонент списка с бесконечной прокруткой
 */
export function InfiniteScrollList({
  data,
  loading,
  hasMore,
  onLoadMore,
  renderItem,
  threshold = 200, // Загружать следующую страницу за 200px до конца
  emptyMessage = 'Нет данных',
  loadingMessage = 'Загрузка...',
  endMessage = 'Все данные загружены'
}) {
  const observerRef = useRef(null)
  const sentinelRef = useRef(null)

  // Callback для Intersection Observer
  const handleObserver = useCallback((entries) => {
    const [target] = entries
    if (target.isIntersecting && hasMore && !loading) {
      onLoadMore()
    }
  }, [hasMore, loading, onLoadMore])

  // Настройка Intersection Observer
  useEffect(() => {
    const options = {
      root: null,
      rootMargin: `${threshold}px`,
      threshold: 0.1
    }

    observerRef.current = new IntersectionObserver(handleObserver, options)

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current)
    }

    return () => {
      if (observerRef.current && sentinelRef.current) {
        observerRef.current.unobserve(sentinelRef.current)
      }
    }
  }, [handleObserver, threshold])

  if (data.length === 0 && !loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Список элементов */}
      {data.map((item) => renderItem(item))}

      {/* Sentinel элемент для отслеживания прокрутки */}
      <div ref={sentinelRef} className="h-4" />

      {/* Индикаторы состояния */}
      {loading && (
        <div className="p-4 text-center text-gray-500">
          <div className="flex items-center justify-center">
            <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {loadingMessage}
          </div>
        </div>
      )}

      {!hasMore && data.length > 0 && (
        <div className="p-4 text-center text-gray-500 text-sm">
          {endMessage}
        </div>
      )}
    </div>
  )
}
```

### 4. Использование Infinite Scroll

```jsx
// Пример использования InfiniteScrollList
import { InfiniteScrollList } from '../../../shared/components/InfiniteScrollList.jsx'
import { useUsersPagination } from '../hooks/useUsersPagination.js'

export function UsersInfiniteList() {
  const {
    data: users,
    loading,
    hasMore,
    loadNextPage
  } = useUsersPagination()

  // Загружаем первую страницу при монтировании
  useEffect(() => {
    if (users.length === 0 && !loading) {
      loadNextPage()
    }
  }, [])

  const renderUser = (user) => (
    <div key={user.id} className="p-4 bg-white rounded-lg shadow-sm">
      <h3>{user.email}</h3>
    </div>
  )

  return (
    <InfiniteScrollList
      data={users}
      loading={loading}
      hasMore={hasMore}
      onLoadMore={loadNextPage}
      renderItem={renderUser}
    />
  )
}
```

---

## Эффективность при большом количестве записей

### 1. Оптимизация запросов

#### ✅ Правильно: Использование индексов

```javascript
// Firestore требует составных индексов для запросов с несколькими условиями
// Пример: orderBy + where

// В Firebase Console создайте составной индекс:
// Collection: users_v4
// Fields: status (Ascending), createdAt (Descending)

const q = query(
  collection(db, 'users_v4'),
  where('status', '==', 'active'),
  orderBy('createdAt', 'desc'),
  limit(20)
)
```

#### ❌ Неправильно: Загрузка всех данных

```javascript
// НИКОГДА не делайте так:
const snapshot = await getDocs(collection(db, 'users_v4'))
const allUsers = []
snapshot.forEach(doc => allUsers.push(doc.data()))
// Это загрузит ВСЕ документы и будет очень дорого!
```

### 2. Кеширование и оптимизация

```javascript
// src/shared/hooks/useFirestorePaginationOptimized.js
import { useFirestorePagination } from './useFirestorePagination.js'
import { useMemo } from 'react'

/**
 * Оптимизированная версия с кешированием
 */
export function useFirestorePaginationOptimized(db, collectionPath, options) {
  const pagination = useFirestorePagination(db, collectionPath, options)

  // Мемоизация данных для предотвращения лишних ре-рендеров
  const memoizedData = useMemo(() => pagination.data, [pagination.data])

  // Дебаунсинг для частых запросов
  const debouncedLoadNext = useMemo(() => {
    let timeout
    return () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        pagination.loadNextPage()
      }, 300)
    }
  }, [pagination.loadNextPage])

  return {
    ...pagination,
    data: memoizedData,
    loadNextPage: debouncedLoadNext
  }
}
```

### 3. Мониторинг производительности

```javascript
// Добавьте логирование времени выполнения запросов
const loadNextPage = useCallback(async () => {
  const startTime = performance.now()
  
  try {
    // ... выполнение запроса
    const querySnapshot = await getDocs(q)
    
    const endTime = performance.now()
    const duration = endTime - startTime
    
    logger.info('Pagination', 'Запрос выполнен', {
      collectionPath,
      duration: `${duration.toFixed(2)}ms`,
      documentsCount: querySnapshot.size
    })
    
    // Предупреждение при медленных запросах
    if (duration > 1000) {
      logger.warn('Pagination', 'Медленный запрос', {
        duration,
        collectionPath,
        suggestion: 'Проверьте индексы Firestore'
      })
    }
  } catch (err) {
    // ...
  }
}, [/* ... */])
```

### 4. Сравнение производительности

| Метод | Время выполнения (10K записей) | Стоимость (10K записей) | Масштабируемость |
|-------|-------------------------------|------------------------|------------------|
| **Cursor-based** | ~50-100ms | $0.06 | ✅ Отлично |
| **Offset-based** | ~500-2000ms | $0.60+ | ❌ Плохо |
| **Загрузка всех** | ~5000ms+ | $6.00+ | ❌ Очень плохо |

### 5. Рекомендации по оптимизации

1. **Всегда используйте индексы**:
   ```javascript
   // Создайте составные индексы для всех комбинаций:
   // where + orderBy
   // where + where + orderBy
   ```

2. **Ограничивайте размер страницы**:
   ```javascript
   // Оптимальный размер: 10-50 документов
   pageSize: 20 // ✅ Хорошо
   pageSize: 1000 // ❌ Плохо
   ```

3. **Используйте кеширование Firestore**:
   ```javascript
   // Firestore автоматически кеширует запросы
   // Включите persistence для офлайн-доступа
   enableIndexedDbPersistence(db)
   ```

4. **Избегайте лишних запросов**:
   ```javascript
   // Не загружайте следующую страницу, если пользователь не прокрутил
   // Используйте Intersection Observer для lazy loading
   ```

---

## Полные примеры кода

### Пример 1: Пагинация логов

```javascript
// src/features/admin/hooks/useLogsPagination.js
import { useFirestorePagination } from '../../../shared/hooks/useFirestorePagination.js'
import { useFirebase } from '../../../shared/hooks/useFirebase.js'
import { APP_ID } from '../../../shared/constants/app.js'
import { where, Timestamp } from 'firebase/firestore'

export function useLogsPagination(filters = {}) {
  const { db } = useFirebase()
  const collectionPath = `artifacts/${APP_ID}/public/logs`

  const whereConditions = []
  
  if (filters.level) {
    whereConditions.push(where('level', '==', filters.level))
  }
  
  if (filters.startDate) {
    whereConditions.push(where('timestamp', '>=', Timestamp.fromDate(filters.startDate)))
  }
  
  if (filters.endDate) {
    whereConditions.push(where('timestamp', '<=', Timestamp.fromDate(filters.endDate)))
  }

  return useFirestorePagination(db, collectionPath, {
    pageSize: 50,
    orderByField: 'timestamp',
    orderDirection: 'desc',
    whereConditions
  })
}
```

### Пример 2: Пагинация с фильтрами и поиском

```javascript
// src/features/admin/hooks/useFilteredUsersPagination.js
import { useFirestorePagination } from '../../../shared/hooks/useFirestorePagination.js'
import { useFirebase } from '../../../shared/hooks/useFirebase.js'
import { APP_ID } from '../../../shared/constants/app.js'
import { where, query, collection, getDocs, limit, startAfter, orderBy } from 'firebase/firestore'
import { useState, useCallback } from 'react'

export function useFilteredUsersPagination() {
  const { db } = useFirebase()
  const [searchTerm, setSearchTerm] = useState('')
  
  // Для поиска по тексту используем отдельный запрос
  // Firestore не поддерживает полнотекстовый поиск напрямую
  // Используйте Algolia или Cloud Functions для полнотекстового поиска
  
  const basePagination = useFirestorePagination(
    db,
    `artifacts/${APP_ID}/public/data/users_v4`,
    {
      pageSize: 20,
      orderByField: 'createdAt',
      orderDirection: 'desc'
    }
  )

  // Фильтрация на клиенте (для небольших результатов)
  const filteredData = searchTerm
    ? basePagination.data.filter(user => 
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.username?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : basePagination.data

  return {
    ...basePagination,
    data: filteredData,
    searchTerm,
    setSearchTerm
  }
}
```

### Пример 3: Компонент с фильтрами и пагинацией

```jsx
// src/features/admin/components/FilteredUsersList.jsx
import React, { useState, useEffect } from 'react'
import { useFilteredUsersPagination } from '../hooks/useFilteredUsersPagination.js'
import { PaginatedList } from '../../../shared/components/PaginatedList.jsx'

export function FilteredUsersList() {
  const {
    data: users,
    loading,
    error,
    hasMore,
    isFirstPage,
    canGoBack,
    loadNextPage,
    loadPreviousPage,
    reset,
    searchTerm,
    setSearchTerm
  } = useFilteredUsersPagination()

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value)
  }

  const renderUser = (user) => (
    <div key={user.id} className="p-4 bg-white rounded-lg shadow-sm">
      <h3 className="font-semibold">{user.email || user.username}</h3>
      <p className="text-sm text-gray-500">Роль: {user.role}</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Поиск */}
      <div className="flex items-center space-x-4">
        <input
          type="text"
          value={searchTerm}
          onChange={handleSearchChange}
          placeholder="Поиск пользователей..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          onClick={reset}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          Сбросить
        </button>
      </div>

      {/* Список с пагинацией */}
      <PaginatedList
        data={users}
        loading={loading}
        error={error}
        hasMore={hasMore}
        isFirstPage={isFirstPage}
        canGoBack={canGoBack}
        onNextPage={loadNextPage}
        onPreviousPage={loadPreviousPage}
        renderItem={renderUser}
        emptyMessage="Пользователи не найдены"
      />
    </div>
  )
}
```

---

## 📝 Чеклист внедрения

- [ ] Создать хук `useFirestorePagination`
- [ ] Настроить индексы в Firebase Console для всех комбинаций запросов
- [ ] Реализовать UI-контролы пагинации
- [ ] Добавить обработку ошибок и состояний загрузки
- [ ] Протестировать с большим количеством данных (1000+ записей)
- [ ] Настроить мониторинг производительности
- [ ] Оптимизировать размер страницы под ваши нужды
- [ ] Добавить кеширование при необходимости

---

## 🔗 Полезные ссылки

- [Firestore Pagination Documentation](https://firebase.google.com/docs/firestore/query-data/query-cursors)
- [Firestore Query Limitations](https://firebase.google.com/docs/firestore/query-data/query-cursors#limitations)
- [Firestore Indexes](https://firebase.google.com/docs/firestore/query-data/indexing)

---

**Автор**: Firebase Expert  
**Дата**: 2024  
**Версия**: 1.0

