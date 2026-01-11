# Руководство по виртуализации списков в React

## Содержание
1. [Почему виртуализация ускоряет UI](#1-почему-виртуализация-ускоряет-ui)
2. [Интеграция react-window](#2-интеграция-react-window)
3. [Пример кода списка пользователей](#3-пример-кода-списка-пользователей)
4. [Шаги миграции от .map к виртуализации](#4-шаги-миграции-от-map-к-виртуализации)
5. [Быстрые тесты производительности](#5-быстрые-тесты-производительности)

---

## 1. Почему виртуализация ускоряет UI

### Проблема без виртуализации

Когда вы рендерите большой список через `.map()`, React создает DOM-элементы для **всех** элементов, даже тех, которые не видны на экране:

```jsx
// ❌ ПЛОХО: Рендерит 1000 элементов, даже если видно только 10
{users.map(user => (
  <tr key={user.id}>
    <td>{user.email}</td>
    <td>{user.role}</td>
  </tr>
))}
```

**Проблемы:**
- **Медленный первоначальный рендер**: 1000 элементов = 1000 DOM-узлов
- **Высокое потребление памяти**: все элементы хранятся в памяти
- **Медленный скролл**: браузер пересчитывает layout для всех элементов
- **Плохая производительность на мобильных**: ограниченные ресурсы

### Решение: виртуализация

Виртуализация рендерит **только видимые элементы** + небольшой буфер сверху/снизу:

```
┌─────────────────────────┐
│  Видимая область        │ ← Рендерится только это
│  ┌─────────────────┐    │
│  │ Элемент 1       │    │
│  │ Элемент 2       │    │
│  │ Элемент 3       │    │ ← Видимые элементы
│  │ Элемент 4       │    │
│  │ Элемент 5       │    │
│  └─────────────────┘    │
│                         │
│  [Буфер сверху]         │ ← Невидимые, но готовы
│  [Буфер снизу]          │
└─────────────────────────┘

Всего элементов: 1000
Рендерится: ~10-15 элементов
```

**Преимущества:**
- ✅ **Быстрый рендер**: только 10-15 элементов вместо 1000
- ✅ **Низкое потребление памяти**: хранятся только видимые элементы
- ✅ **Плавный скролл**: браузер обрабатывает минимум DOM-узлов
- ✅ **Масштабируемость**: работает одинаково для 100 и 100,000 элементов

### Технические детали

**Без виртуализации:**
```
1000 элементов × 5 DOM-узлов = 5000 DOM-узлов
Время рендера: ~500-1000ms
Память: ~50-100MB
```

**С виртуализацией:**
```
15 элементов × 5 DOM-узлов = 75 DOM-узлов
Время рендера: ~10-20ms
Память: ~1-2MB
```

**Ускорение: 25-50x** 🚀

---

## 2. Интеграция react-window

### Установка

```bash
npm install react-window
# или
yarn add react-window
```

### Основные компоненты

#### `FixedSizeList` - для фиксированной высоты элементов
```jsx
import { FixedSizeList } from 'react-window'
```

#### `VariableSizeList` - для переменной высоты элементов
```jsx
import { VariableSizeList } from 'react-window'
```

#### `FixedSizeGrid` - для таблиц с фиксированными размерами
```jsx
import { FixedSizeGrid } from 'react-window'
```

### Базовый пример

```jsx
import { FixedSizeList } from 'react-window'

const Row = ({ index, style, data }) => (
  <div style={style}>
    {data[index].name}
  </div>
)

const VirtualizedList = ({ items }) => (
  <FixedSizeList
    height={600}        // Высота контейнера
    itemCount={items.length}  // Количество элементов
    itemSize={50}       // Высота каждого элемента
    width="100%"
    itemData={items}    // Данные передаются через itemData
  >
    {Row}
  </FixedSizeList>
)
```

### Параметры компонентов

| Параметр | Тип | Описание |
|----------|-----|----------|
| `height` | number | Высота видимой области (px) |
| `width` | number/string | Ширина контейнера |
| `itemCount` | number | Общее количество элементов |
| `itemSize` | number | Высота элемента (для FixedSizeList) |
| `itemData` | any | Данные, передаваемые в Row компонент |
| `overscanCount` | number | Количество элементов вне видимой области (буфер) |

---

## 3. Пример кода списка пользователей

### Вариант 1: Виртуализированная таблица (FixedSizeList)

```jsx
import { FixedSizeList } from 'react-window'
import { useMemo } from 'react'
import { Edit2, Trash2, Copy, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { getUserStatus } from '../../../shared/utils/userStatus.js'

const VirtualizedUserTable = ({
  users,
  editingUser,
  onSetEditingUser,
  onHandleUpdateUser,
  onHandleDeleteUser,
  onHandleCopy,
  currentUser,
  formatDate,
  handleUserRoleChange,
  handleUserPlanChange,
  handleUserDevicesChange,
  handleUserExpiresAtChange,
}) => {
  // Высота строки таблицы
  const ROW_HEIGHT = 80
  
  // Компонент строки
  const Row = ({ index, style, data }) => {
    const user = data.users[index]
    const userStatus = getUserStatus(user)
    const isEditing = editingUser?.id === user.id

    return (
      <div
        style={style}
        className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
      >
        <div className="grid grid-cols-8 gap-4 px-6 py-4 items-center">
          {/* Email */}
          <div className="text-slate-200 truncate" title={user.email}>
            {user.email}
          </div>

          {/* UUID */}
          <div className="flex items-center gap-2">
            {user.uuid ? (
              <>
                <span
                  className="text-slate-400 font-mono text-xs max-w-[220px] truncate"
                  title={user.uuid}
                >
                  {user.uuid}
                </span>
                <button
                  onClick={() => onHandleCopy(user.uuid)}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                  title="Копировать UUID"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </>
            ) : (
              <span className="text-slate-500 text-xs">—</span>
            )}
          </div>

          {/* Роль */}
          <div>
            {isEditing ? (
              <select
                value={editingUser.role}
                onChange={handleUserRoleChange}
                className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
              >
                <option value="user">Пользователь</option>
                <option value="admin">Админ</option>
              </select>
            ) : (
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                user.role === 'admin' ? 'bg-purple-900/30 text-purple-300' : 'bg-slate-700 text-slate-300'
              }`}>
                {user.role === 'admin' ? 'Админ' : 'Пользователь'}
              </span>
            )}
          </div>

          {/* План */}
          <div>
            {isEditing ? (
              <select
                value={editingUser.plan}
                onChange={handleUserPlanChange}
                className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
              >
                <option value="free">Бесплатный</option>
                <option value="premium">Премиум</option>
              </select>
            ) : (
              <span className="text-slate-200">
                {user.plan === 'premium' ? 'Премиум' : 'Бесплатный'}
              </span>
            )}
          </div>

          {/* Устройства */}
          <div>
            {isEditing ? (
              <input
                type="number"
                min="1"
                value={editingUser.devices || 1}
                onChange={handleUserDevicesChange}
                className="w-20 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
              />
            ) : (
              <span className="text-slate-200">{user.devices || 1}</span>
            )}
          </div>

          {/* Статус */}
          <div>
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
              userStatus.status === 'active' ? 'bg-green-900/30 text-green-400' :
              userStatus.status === 'expired' ? 'bg-red-900/30 text-red-400' :
              'bg-slate-700 text-slate-400'
            }`}>
              {userStatus.status === 'active' && <CheckCircle2 className="w-3 h-3" />}
              {userStatus.status === 'expired' && <XCircle className="w-3 h-3" />}
              {userStatus.status === 'no-key' && <AlertCircle className="w-3 h-3" />}
              {userStatus.label}
            </div>
          </div>

          {/* Истекает */}
          <div>
            {isEditing ? (
              <input
                type="datetime-local"
                value={editingUser.expiresAt ? new Date(editingUser.expiresAt).toISOString().slice(0, 16) : ''}
                onChange={handleUserExpiresAtChange}
                className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
              />
            ) : (
              <span className="text-slate-400 text-sm">
                {user.expiresAt ? formatDate(user.expiresAt) : '—'}
              </span>
            )}
          </div>

          {/* Действия */}
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={() => onHandleUpdateUser(user.id, editingUser)}
                  className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors flex items-center gap-1"
                >
                  Сохранить
                </button>
                <button
                  onClick={() => onSetEditingUser(null)}
                  className="px-3 py-1 bg-slate-600 hover:bg-slate-700 text-white rounded text-sm transition-colors flex items-center gap-1"
                >
                  Отмена
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onSetEditingUser({ ...user })}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" />
                  Редактировать
                </button>
                <button
                  onClick={() => onHandleDeleteUser(user.id)}
                  disabled={user.id === currentUser.id}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded text-sm transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Удалить
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 rounded-lg shadow-xl border border-slate-800 overflow-hidden">
      <div className="p-6 border-b border-slate-800">
        <h2 className="text-xl font-bold text-slate-200">Управление пользователями</h2>
        <p className="text-slate-400 text-sm mt-1">
          Всего пользователей: {users.length}
        </p>
      </div>

      {/* Заголовок таблицы */}
      <div className="bg-slate-800 grid grid-cols-8 gap-4 px-6 py-3">
        <div className="text-xs font-medium text-slate-300 uppercase">Email</div>
        <div className="text-xs font-medium text-slate-300 uppercase">UUID</div>
        <div className="text-xs font-medium text-slate-300 uppercase">Роль</div>
        <div className="text-xs font-medium text-slate-300 uppercase">План</div>
        <div className="text-xs font-medium text-slate-300 uppercase">Устройства</div>
        <div className="text-xs font-medium text-slate-300 uppercase">Статус</div>
        <div className="text-xs font-medium text-slate-300 uppercase">Истекает</div>
        <div className="text-xs font-medium text-slate-300 uppercase">Действия</div>
      </div>

      {/* Виртуализированный список */}
      <FixedSizeList
        height={600} // Высота видимой области
        itemCount={users.length}
        itemSize={ROW_HEIGHT}
        width="100%"
        itemData={{ users, editingUser }}
        overscanCount={5} // Буфер: рендерим 5 элементов сверху/снизу
        className="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900"
      >
        {Row}
      </FixedSizeList>
    </div>
  )
}

export default VirtualizedUserTable
```

### Вариант 2: Виртуализированная таблица с VariableSizeList (для переменной высоты)

```jsx
import { VariableSizeList } from 'react-window'
import { useMemo, useRef, useEffect } from 'react'

const VirtualizedUserTableVariable = ({ users, ...props }) => {
  const listRef = useRef(null)
  const rowHeights = useRef({})

  // Функция для получения высоты строки
  const getItemSize = (index) => {
    // Если строка редактируется, она выше
    const user = users[index]
    const isEditing = props.editingUser?.id === user.id
    return isEditing ? 120 : 80
  }

  // Кэшируем высоты строк
  const setRowHeight = (index, height) => {
    if (rowHeights.current[index] !== height) {
      rowHeights.current[index] = height
      if (listRef.current) {
        listRef.current.resetAfterIndex(index)
      }
    }
  }

  // Сбрасываем кэш при изменении editingUser
  useEffect(() => {
    if (listRef.current) {
      listRef.current.resetAfterIndex(0)
    }
  }, [props.editingUser])

  const Row = ({ index, style, data }) => {
    const rowRef = useRef(null)

    useEffect(() => {
      if (rowRef.current) {
        setRowHeight(index, rowRef.current.getBoundingClientRect().height)
      }
    }, [index])

    const user = data.users[index]
    // ... остальной код как в предыдущем примере

    return (
      <div ref={rowRef} style={style}>
        {/* Содержимое строки */}
      </div>
    )
  }

  return (
    <VariableSizeList
      ref={listRef}
      height={600}
      itemCount={users.length}
      itemSize={getItemSize}
      width="100%"
      itemData={{ users, ...props }}
      overscanCount={5}
    >
      {Row}
    </VariableSizeList>
  )
}
```

### Вариант 3: Использование react-window с CSS Grid (рекомендуется для таблиц)

```jsx
import { FixedSizeList } from 'react-window'
import { useMemo } from 'react'

const VirtualizedUserTableGrid = ({ users, ...props }) => {
  const ROW_HEIGHT = 80
  const COLUMN_WIDTHS = {
    email: '25%',
    uuid: '20%',
    role: '10%',
    plan: '10%',
    devices: '8%',
    status: '12%',
    expires: '10%',
    actions: '15%',
  }

  const Row = ({ index, style, data }) => {
    const user = data.users[index]
    const isEditing = data.editingUser?.id === user.id

    return (
      <div
        style={{
          ...style,
          display: 'grid',
          gridTemplateColumns: Object.values(COLUMN_WIDTHS).join(' '),
          gap: '1rem',
          padding: '0 1.5rem',
          alignItems: 'center',
        }}
        className="border-b border-slate-800 hover:bg-slate-800/50"
      >
        {/* Ячейки таблицы */}
        <div className="text-slate-200 truncate">{user.email}</div>
        {/* ... остальные ячейки */}
      </div>
    )
  }

  return (
    <div className="bg-slate-900 rounded-lg shadow-xl border border-slate-800">
      {/* Заголовок */}
      <div
        className="bg-slate-800 grid gap-4 px-6 py-3"
        style={{
          gridTemplateColumns: Object.values(COLUMN_WIDTHS).join(' '),
        }}
      >
        {Object.keys(COLUMN_WIDTHS).map(key => (
          <div key={key} className="text-xs font-medium text-slate-300 uppercase">
            {key}
          </div>
        ))}
      </div>

      {/* Виртуализированный список */}
      <FixedSizeList
        height={600}
        itemCount={users.length}
        itemSize={ROW_HEIGHT}
        width="100%"
        itemData={{ users, ...props }}
        overscanCount={5}
      >
        {Row}
      </FixedSizeList>
    </div>
  )
}
```

---

## 4. Шаги миграции от .map к виртуализации

### Шаг 1: Установка зависимостей

```bash
npm install react-window
```

### Шаг 2: Анализ текущего кода

Найдите все места, где используется `.map()` для больших списков:

```jsx
// ❌ До миграции
<tbody>
  {users.map((user) => (
    <tr key={user.id}>
      {/* ... */}
    </tr>
  ))}
</tbody>
```

### Шаг 3: Создание компонента Row

Вынесите логику рендера одной строки в отдельный компонент:

```jsx
// ✅ Компонент строки
const UserRow = ({ index, style, data }) => {
  const user = data.users[index]
  // ... логика рендера строки
  return (
    <div style={style}>
      {/* содержимое */}
    </div>
  )
}
```

### Шаг 4: Замена структуры

**Было:**
```jsx
<table>
  <thead>...</thead>
  <tbody>
    {users.map(...)}
  </tbody>
</table>
```

**Стало:**
```jsx
<div>
  {/* Заголовок как отдельный div */}
  <div className="table-header">...</div>
  
  {/* Виртуализированный список */}
  <FixedSizeList
    height={600}
    itemCount={users.length}
    itemSize={80}
    itemData={{ users }}
  >
    {UserRow}
  </FixedSizeList>
</div>
```

### Шаг 5: Настройка стилей

Замените табличные стили на flex/grid:

```css
/* Было */
.table-row {
  display: table-row;
}

/* Стало */
.table-row {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 1rem;
}
```

### Шаг 6: Обработка событий

Убедитесь, что обработчики событий работают корректно:

```jsx
// ✅ События работают как обычно
<button onClick={() => onHandleEdit(user.id)}>
  Редактировать
</button>
```

### Шаг 7: Тестирование

1. Проверьте рендер с малым количеством элементов (< 10)
2. Проверьте рендер с большим количеством (> 100)
3. Проверьте скролл
4. Проверьте редактирование элементов
5. Проверьте на мобильных устройствах

### Полный пример миграции

**До:**
```jsx
// AdminPanel.jsx
<tbody className="divide-y divide-slate-800">
  {users.map((user) => {
    const userStatus = getUserStatus(user)
    const isEditing = editingUser?.id === user.id
    return (
      <tr key={user.id} className="hover:bg-slate-800/50">
        <td className="px-6 py-4">{user.email}</td>
        {/* ... */}
      </tr>
    )
  })}
</tbody>
```

**После:**
```jsx
// AdminPanel.jsx
import { FixedSizeList } from 'react-window'
import VirtualizedUserTable from './VirtualizedUserTable.jsx'

// В компоненте:
<VirtualizedUserTable
  users={users}
  editingUser={editingUser}
  onSetEditingUser={onSetEditingUser}
  onHandleUpdateUser={onHandleUpdateUser}
  onHandleDeleteUser={onHandleDeleteUser}
  onHandleCopy={onHandleCopy}
  currentUser={currentUser}
  formatDate={formatDate}
  handleUserRoleChange={handleUserRoleChange}
  handleUserPlanChange={handleUserPlanChange}
  handleUserDevicesChange={handleUserDevicesChange}
  handleUserExpiresAtChange={handleUserExpiresAtChange}
/>
```

---

## 5. Быстрые тесты производительности

### Тест 1: Измерение времени рендера

```jsx
// performance-test.jsx
import { useEffect, useRef } from 'react'

const PerformanceTest = ({ users, useVirtualization }) => {
  const renderStartRef = useRef(null)
  const renderEndRef = useRef(null)

  useEffect(() => {
    if (renderStartRef.current) {
      renderEndRef.current = performance.now()
      const renderTime = renderEndRef.current - renderStartRef.current
      console.log(`⏱️ Render time: ${renderTime.toFixed(2)}ms`)
      console.log(`📊 Elements: ${users.length}`)
      console.log(`🚀 Virtualization: ${useVirtualization ? 'ON' : 'OFF'}`)
    }
  }, [users, useVirtualization])

  useEffect(() => {
    renderStartRef.current = performance.now()
  }, [])

  return null
}
```

### Тест 2: Измерение FPS при скролле

```jsx
// scroll-performance-test.jsx
import { useEffect, useRef } from 'react'

const ScrollPerformanceTest = () => {
  const fpsRef = useRef(0)
  const frameCountRef = useRef(0)
  const lastTimeRef = useRef(performance.now())

  useEffect(() => {
    const measureFPS = () => {
      frameCountRef.current++
      const currentTime = performance.now()
      
      if (currentTime >= lastTimeRef.current + 1000) {
        fpsRef.current = frameCountRef.current
        frameCountRef.current = 0
        lastTimeRef.current = currentTime
        
        console.log(`🎮 FPS: ${fpsRef.current}`)
        
        if (fpsRef.current < 30) {
          console.warn('⚠️ Low FPS detected! Consider using virtualization.')
        }
      }
      
      requestAnimationFrame(measureFPS)
    }

    const rafId = requestAnimationFrame(measureFPS)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div className="fixed top-4 right-4 bg-slate-900 p-2 rounded text-white text-sm">
      FPS: {fpsRef.current}
    </div>
  )
}
```

### Тест 3: Измерение памяти

```jsx
// memory-test.jsx
const measureMemory = () => {
  if (performance.memory) {
    const memory = performance.memory
    console.log('💾 Memory usage:')
    console.log(`  Used: ${(memory.usedJSHeapSize / 1048576).toFixed(2)} MB`)
    console.log(`  Total: ${(memory.totalJSHeapSize / 1048576).toFixed(2)} MB`)
    console.log(`  Limit: ${(memory.jsHeapSizeLimit / 1048576).toFixed(2)} MB`)
  } else {
    console.log('Memory API not available')
  }
}

// Вызывайте перед и после рендера
measureMemory()
```

### Тест 4: Сравнительный тест

```jsx
// comparison-test.jsx
import { useState, useEffect } from 'react'
import { FixedSizeList } from 'react-window'

const ComparisonTest = () => {
  const [users] = useState(() => 
    Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      email: `user${i}@example.com`,
      role: 'user',
    }))
  )
  const [useVirtualization, setUseVirtualization] = useState(false)
  const [renderTime, setRenderTime] = useState(0)

  useEffect(() => {
    const start = performance.now()
    // Симуляция рендера
    setTimeout(() => {
      const end = performance.now()
      setRenderTime(end - start)
    }, 0)
  }, [useVirtualization, users])

  return (
    <div className="p-6">
      <div className="mb-4 flex gap-4">
        <button
          onClick={() => setUseVirtualization(false)}
          className={`px-4 py-2 rounded ${
            !useVirtualization ? 'bg-blue-600' : 'bg-slate-600'
          }`}
        >
          Без виртуализации
        </button>
        <button
          onClick={() => setUseVirtualization(true)}
          className={`px-4 py-2 rounded ${
            useVirtualization ? 'bg-blue-600' : 'bg-slate-600'
          }`}
        >
          С виртуализацией
        </button>
      </div>

      <div className="mb-4">
        <p>Время рендера: {renderTime.toFixed(2)}ms</p>
        <p>Элементов: {users.length}</p>
      </div>

      {useVirtualization ? (
        <FixedSizeList
          height={600}
          itemCount={users.length}
          itemSize={50}
          width="100%"
          itemData={users}
        >
          {({ index, style, data }) => (
            <div style={style} className="p-2 border-b">
              {data[index].email}
            </div>
          )}
        </FixedSizeList>
      ) : (
        <div style={{ height: 600, overflow: 'auto' }}>
          {users.map(user => (
            <div key={user.id} className="p-2 border-b">
              {user.email}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

### Тест 5: Lighthouse Performance Score

Запустите Lighthouse в Chrome DevTools:

1. Откройте DevTools (F12)
2. Перейдите на вкладку "Lighthouse"
3. Выберите "Performance"
4. Нажмите "Analyze page load"
5. Сравните результаты до и после виртуализации

**Ожидаемые улучшения:**
- **First Contentful Paint (FCP)**: -30% до -50%
- **Time to Interactive (TTI)**: -40% до -60%
- **Total Blocking Time (TBT)**: -50% до -70%

### Тест 6: React DevTools Profiler

```jsx
// Включите Profiler в React DevTools
// 1. Установите React DevTools extension
// 2. Откройте вкладку "Profiler"
// 3. Нажмите "Record"
// 4. Взаимодействуйте со списком (скролл, редактирование)
// 5. Остановите запись
// 6. Сравните время рендера компонентов
```

### Быстрый скрипт для тестирования

```jsx
// quick-performance-test.jsx
export const runPerformanceTest = (componentName, renderFn) => {
  const iterations = 10
  const times = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    renderFn()
    const end = performance.now()
    times.push(end - start)
  }

  const avg = times.reduce((a, b) => a + b, 0) / iterations
  const min = Math.min(...times)
  const max = Math.max(...times)

  console.log(`📊 ${componentName} Performance:`)
  console.log(`  Average: ${avg.toFixed(2)}ms`)
  console.log(`  Min: ${min.toFixed(2)}ms`)
  console.log(`  Max: ${max.toFixed(2)}ms`)
  
  return { avg, min, max, times }
}

// Использование:
// runPerformanceTest('UserList', () => renderUserList(users))
```

### Чеклист для тестирования

- [ ] Рендер с 10 элементами работает корректно
- [ ] Рендер с 100 элементами работает корректно
- [ ] Рендер с 1000+ элементами работает корректно
- [ ] Скролл плавный (60 FPS)
- [ ] Редактирование элементов работает
- [ ] Удаление элементов работает
- [ ] Фильтрация работает
- [ ] Поиск работает
- [ ] На мобильных устройствах работает плавно
- [ ] Нет утечек памяти при длительном использовании

---

## Дополнительные оптимизации

### 1. Мемоизация компонента Row

```jsx
import { memo } from 'react'

const Row = memo(({ index, style, data }) => {
  // ... код строки
}, (prevProps, nextProps) => {
  // Кастомная функция сравнения
  return (
    prevProps.data.users[prevProps.index].id === 
    nextProps.data.users[nextProps.index].id &&
    prevProps.data.editingUser?.id !== prevProps.data.users[prevProps.index].id
  )
})
```

### 2. Использование useMemo для данных

```jsx
const itemData = useMemo(() => ({
  users,
  editingUser,
  onSetEditingUser,
  // ... другие пропсы
}), [users, editingUser, onSetEditingUser])
```

### 3. Динамическая высота с кэшированием

```jsx
const rowHeights = useRef(new Map())

const getItemSize = (index) => {
  return rowHeights.current.get(index) || 80
}

const setRowHeight = (index, height) => {
  rowHeights.current.set(index, height)
  listRef.current?.resetAfterIndex(index)
}
```

---

## Заключение

Виртуализация списков - это критически важная оптимизация для приложений с большими списками данных. Она обеспечивает:

- ✅ **25-50x ускорение** рендера
- ✅ **Плавный скролл** даже с тысячами элементов
- ✅ **Низкое потребление памяти**
- ✅ **Отличный UX** на всех устройствах

Начните с простого `FixedSizeList` и переходите к более сложным вариантам по мере необходимости.

