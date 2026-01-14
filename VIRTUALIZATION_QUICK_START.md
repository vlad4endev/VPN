# Быстрый старт: Виртуализация списков

## Установка

```bash
npm install react-window
```

## Использование в AdminPanel

### Шаг 1: Импортируйте компонент

```jsx
// src/features/admin/pages/AdminPage.jsx
import VirtualizedUserTable from '../components/VirtualizedUserTable.jsx'
```

### Шаг 2: Замените обычную таблицу

**Было:**
```jsx
<table className="w-full">
  <thead>...</thead>
  <tbody>
    {users.map((user) => (
      <tr key={user.id}>...</tr>
    ))}
  </tbody>
</table>
```

**Стало:**
```jsx
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

### Шаг 3: Готово! 🎉

Теперь ваш список пользователей виртуализирован и будет работать быстро даже с тысячами элементов.

## Тестирование производительности

```jsx
import PerformanceComparison from '../components/PerformanceComparison.jsx'

// Используйте для сравнения производительности
<PerformanceComparison />
```

## Когда использовать виртуализацию?

✅ **Используйте**, если:
- Список содержит 100+ элементов
- Элементы сложные (много DOM-узлов)
- Нужен плавный скролл
- Важна производительность на мобильных

❌ **Не используйте**, если:
- Список содержит < 50 элементов
- Элементы очень простые
- Нужна нативная таблица HTML

## Дополнительная информация

См. полное руководство: `VIRTUALIZATION_GUIDE.md`

