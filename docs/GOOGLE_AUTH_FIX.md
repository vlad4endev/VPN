# Google Authentication Fix

## Обзор изменений

Этот документ описывает исправления, внесенные в систему Google-авторизации для улучшения стабильности и безопасности.

## Изменения

### 1. Задержка стабилизации Firestore-канала (300 мс)

**Файл:** `src/app/App.jsx`

**Проблема:** После успешной Google-авторизации Firestore-канал мог закрыться до полной синхронизации данных.

**Решение:** Добавлена задержка 300 мс перед закрытием сессии для стабилизации канала:

```javascript
// Добавляем задержку 300 мс для стабилизации Firestore-канала перед закрытием сессии
logger.debug('Auth', 'Ожидание стабилизации Firestore-канала (300 мс)', { uid: firebaseUser.uid })
await new Promise(resolve => setTimeout(resolve, 300))
```

### 2. Перенаправление через onAuthStateChanged

**Файл:** `src/app/App.jsx`

**Проблема:** После Google-авторизации происходило немедленное перенаправление на '/', что могло привести к гонке состояний.

**Решение:** 
- Убрано немедленное перенаправление из `processGoogleSignInUser`
- Добавлена логика перенаправления в `onAuthStateChanged` после подтверждения статуса "authenticated"
- Используется `window.location.replace('/dashboard')` для перенаправления без добавления в историю браузера

```javascript
// Проверяем, был ли вход через Google (по провайдеру)
const isGoogleSignIn = firebaseUser.providerData?.some((p) => p.providerId === 'google.com')

// Если это Google-авторизация и мы на странице логина/регистрации - перенаправляем на dashboard
if (isGoogleSignIn && (view === 'login' || view === 'register' || view === 'welcome')) {
  logger.info('Auth', 'Google-авторизация завершена, перенаправление на /dashboard', { 
    uid: firebaseUser.uid, 
    role: effectiveRole 
  })
  // Используем location.replace для перенаправления без добавления в историю
  window.location.replace('/dashboard')
  return
}
```

### 3. Firestore Security Rules - Custom Claims для админов

**Файл:** `firestore.rules`

**Проблема:** Доступ к коллекции `users` проверялся только через Firestore, что создавало дополнительные операции чтения и потенциальные уязвимости.

**Решение:** 
- Добавлена проверка кастомного claim `admin: true` в токене Firebase Auth
- Обновлена функция `isAdmin()` для проверки claim вместо чтения из Firestore
- Добавлена fallback-функция `isAdminFromFirestore()` для обратной совместимости

```javascript
// Вспомогательная функция для проверки, является ли пользователь админом
// ОБНОВЛЕНО: Проверяем кастомный claim 'admin' в токене Firebase Auth
// Если claim отсутствует или не равен true - доступ запрещен
function isAdmin() {
  return request.auth != null && 
    request.auth.token.admin == true;
}
```

**Правила для коллекции users:**

```javascript
// Чтение: только свой документ или админы с кастомным claim
// ВАЖНО: Для чтения других пользователей требуется кастомный claim admin: true
allow read: if request.auth != null && (
  isOwner(userId) || 
  (isAdmin() && request.auth.token.admin == true)
);
```

### 4. Улучшенная обработка ошибок

**Файлы:** 
- `src/features/auth/services/authService.js`
- `src/app/App.jsx`

**Изменения:**
- Добавлено специальное сообщение об ошибке для `permission-denied` с указанием на отсутствие admin claim
- Улучшена обработка ошибок в `loadUserData` с проверкой на `permission-denied`

```javascript
'permission-denied': 'Нет доступа к базе данных. У вас отсутствуют необходимые права администратора (custom claim admin: true). Обратитесь к администратору системы.'
```

## Настройка Custom Claims

Для работы новых правил безопасности необходимо настроить Custom Claims для администраторов.

### Через Firebase Admin SDK (Backend)

```javascript
const admin = require('firebase-admin');

// Установить admin claim для пользователя
await admin.auth().setCustomUserClaims(uid, { admin: true });

// Проверить claims пользователя
const user = await admin.auth().getUser(uid);
console.log(user.customClaims); // { admin: true }
```

### Через Cloud Functions

```javascript
exports.setAdminClaim = functions.https.onCall(async (data, context) => {
  // Проверка прав вызывающего
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Только администраторы могут назначать роли'
    );
  }

  const uid = data.uid;
  
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  
  return { message: `Admin claim установлен для пользователя ${uid}` };
});
```

## Тестирование

### 1. Тест Google-авторизации

1. Откройте страницу входа
2. Нажмите "Войти через Google"
3. Выберите аккаунт Google
4. Проверьте, что:
   - Появляется задержка 300 мс (проверьте логи)
   - Перенаправление происходит на `/dashboard`
   - Нет ошибок в консоли

### 2. Тест Admin Claims

1. Попробуйте получить доступ к панели администратора без admin claim
2. Проверьте, что появляется ошибка: "Нет доступа к базе данных. У вас отсутствуют необходимые права администратора"
3. Установите admin claim через Firebase Admin SDK
4. Обновите токен (перелогиньтесь)
5. Проверьте, что доступ к панели администратора работает

### 3. Проверка логов

Проверьте логи в консоли браузера:

```
Auth: Ожидание стабилизации Firestore-канала (300 мс)
Auth: Успешный вход через Google, ожидание onAuthStateChanged для перенаправления
App: onAuthStateChanged
Auth: Google-авторизация завершена, перенаправление на /dashboard
```

## Миграция существующих администраторов

Для существующих администраторов необходимо установить custom claim:

```javascript
// Скрипт миграции (выполнить на backend)
const admin = require('firebase-admin');
const db = admin.firestore();

async function migrateAdmins() {
  const usersSnapshot = await db
    .collection('artifacts/skyputh/public/data/users_v4')
    .where('role', '==', 'admin')
    .get();

  for (const doc of usersSnapshot.docs) {
    const uid = doc.id;
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    console.log(`Admin claim установлен для ${uid}`);
  }
}

migrateAdmins();
```

## Известные ограничения

1. **Custom Claims обновляются только при новом входе**: После установки claim пользователь должен перелогиниться
2. **Размер Custom Claims ограничен**: Максимум 1000 байт для всех claims
3. **Firestore Rules не могут изменять Claims**: Claims устанавливаются только через Admin SDK

## Дополнительные ресурсы

- [Firebase Custom Claims Documentation](https://firebase.google.com/docs/auth/admin/custom-claims)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase Auth State Persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence)
