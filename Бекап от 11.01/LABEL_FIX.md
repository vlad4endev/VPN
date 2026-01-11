# 🔧 Исправление проблемы с атрибутом `for` в элементах `<label>`

## Проблема

Браузер выдавал предупреждение:
```
Incorrect use of <label for=FORM_ELEMENT>
The label's for attribute doesn't match any element id.
```

Это нарушение доступности (accessibility), которое может:
- Предотвратить правильное автозаполнение форм браузером
- Нарушить работу инструментов доступности (screen readers)
- Ухудшить пользовательский опыт

## Найденная проблема

### LoginForm.jsx
**Проблема:** Несоответствие между `htmlFor` и `id` для поля пароля.

**Было:**
```jsx
<label htmlFor={`${authMode}-password`}>Пароль</label>
<input
  id="login-password"  // ❌ Всегда "login-password", даже когда authMode === 'register'
  ...
/>
```

**Проблема:** 
- Когда `authMode === 'login'`: `htmlFor="login-password"` ✅ совпадает с `id="login-password"`
- Когда `authMode === 'register'`: `htmlFor="register-password"` ❌ не совпадает с `id="login-password"`

**Исправлено:**
```jsx
<label htmlFor={`${authMode}-password`}>Пароль</label>
<input
  id={`${authMode}-password`}  // ✅ Теперь динамический, соответствует htmlFor
  ...
/>
```

## Проверенные компоненты

### ✅ LoginForm.jsx
- `htmlFor="login-email"` → `id="login-email"` ✅
- `htmlFor="register-name"` → `id="register-name"` ✅
- `htmlFor={`${authMode}-password`}` → `id={`${authMode}-password`}` ✅ (исправлено)

### ✅ Dashboard.jsx
- `htmlFor="profile-email"` → `id="profile-email"` ✅
- `htmlFor="profile-name"` → `id="profile-name"` ✅
- `htmlFor="profile-phone"` → `id="profile-phone"` ✅

### ✅ AdminPanel.jsx
Все поля серверов и тарифов имеют правильные соответствия:
- `htmlFor={`server-${editingServer.id || 'new'}-name`}` → `id={`server-${editingServer.id || 'new'}-name`}` ✅
- `htmlFor={`server-${editingServer.id || 'new'}-ip`}` → `id={`server-${editingServer.id || 'new'}-ip`}` ✅
- `htmlFor={`server-${editingServer.id || 'new'}-port`}` → `id={`server-${editingServer.id || 'new'}-port`}` ✅
- И так далее для всех полей... ✅

## Результат

✅ Все `htmlFor` атрибуты теперь соответствуют `id` элементов формы
✅ Улучшена доступность (accessibility)
✅ Браузер сможет правильно автозаполнять формы
✅ Screen readers смогут корректно работать с формами
✅ Предупреждение браузера должно исчезнуть

## Измененные файлы

- `src/features/auth/components/LoginForm.jsx` - исправлен id поля пароля

