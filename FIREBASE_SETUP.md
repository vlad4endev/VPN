# 🔥 Настройка Firebase для SKYFLOW

## ⚠️ Важно

Проект использует **Firestore Database** и **Firebase Authentication**!

## 📋 Пошаговая настройка Firebase

### Шаг 1: Откройте Firebase Console

Перейдите: https://console.firebase.google.com/project/skypathvpn

### Шаг 2: Создайте Firestore Database

1. В левом меню найдите **"Firestore Database"**
2. Если база данных еще не создана:
   - Нажмите **"Create database"**
   - Выберите режим: **"Start in test mode"** (для разработки)
   - Выберите регион (например, `asia-southeast1` или ближайший к вам)
   - Нажмите **"Enable"**

### Шаг 3: Включите Email/Password авторизацию

1. В левом меню найдите **"Authentication"**
2. Перейдите на вкладку **"Sign-in method"**
3. Найдите **"Email/Password"** в списке провайдеров
4. Нажмите на **"Email/Password"**
5. Включите переключатель **"Enable"**
6. Нажмите **"Save"**

### Шаг 4: Включите Google авторизацию

1. В том же списке провайдеров найдите **"Google"**
2. Нажмите на **"Google"**
3. Включите переключатель **"Enable"**
4. Укажите **"Project support email"** (ваш email)
5. Нажмите **"Save"**

### Шаг 5: Настройте правила безопасности Firestore

1. Перейдите в **"Firestore Database"** → **"Rules"**
2. Для разработки можно использовать:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Документ пользователя доступен только самому пользователю или админам
    match /artifacts/{appId}/public/data/users_v4/{userId} {
      allow read: if request.auth != null && (
        request.auth.uid == userId || 
        get(/databases/$(database)/documents/artifacts/$(appId)/public/data/users_v4/$(request.auth.uid)).data.role == 'admin'
      );
      allow write: if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null && request.auth.uid == userId;
    }
    
    // Админы могут читать всех пользователей
    match /artifacts/{appId}/public/data/users_v4/{userId} {
      allow read: if request.auth != null && 
        get(/databases/$(database)/documents/artifacts/$(appId)/public/data/users_v4/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Другие коллекции (payments, tariffs, settings)
    match /artifacts/{appId}/public/data/{collection=**} {
      allow read, write: if request.auth != null;
    }
    
    // Публичные данные (для чтения админами)
    match /artifacts/{appId}/public/settings {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/artifacts/$(appId)/public/data/users_v4/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

3. Нажмите **"Publish"**

### Шаг 6: Создайте коллекцию (вручную или автоматически)

Коллекция будет создана автоматически при первом использовании, но можно создать вручную:

1. Перейдите в **"Firestore Database"** → **"Data"**
2. Нажмите **"Start collection"**
3. Collection ID: `artifacts`
4. Document ID: `skyputh`
5. Добавьте поле: `type` = `string`, значение = `app`
6. Нажмите **"Save"**

Затем создайте вложенную структуру:
- `artifacts/skyputh/public/data/users_v4` (будет создана автоматически)
- `artifacts/skyputh/public/data/payments` (будет создана автоматически)
- `artifacts/skyputh/public/data/tariffs` (будет создана автоматически)
- `artifacts/skyputh/public/settings` (будет создана автоматически)

## ✅ Проверка настройки

После настройки:

1. **Перезапустите dev сервер:**
   ```bash
   # Остановите (Ctrl+C)
   npm run dev
   ```

2. **Откройте браузер:** http://localhost:5173

3. **Проверьте консоль браузера (F12):**
   - Должно быть: `✅ Firebase успешно инициализирован!`
   - Должно быть: `✅ Firebase компоненты инициализированы`
   - НЕ должно быть ошибок авторизации

4. **Попробуйте зарегистрироваться:**
   - Перейдите на страницу регистрации
   - Заполните форму
   - После регистрации должен быть создан пользователь в Firebase Auth и документ в Firestore

## 🐛 Устранение проблем

### Ошибка: "auth/operation-not-allowed"
- ✅ Убедитесь, что Email/Password авторизация включена (Шаг 3)
- ✅ Убедитесь, что Google авторизация включена (Шаг 4)

### Ошибка: "permission-denied"
- ✅ Проверьте правила безопасности Firestore (Шаг 5)
- ✅ Убедитесь, что пользователь авторизован через Firebase Auth

### Ошибка: "auth/popup-blocked" (для Google Sign-In)
- ✅ Разрешите всплывающие окна в браузере
- ✅ Попробуйте другой браузер

### Переменные окружения не загружаются
- ✅ Остановите dev сервер (Ctrl+C)
- ✅ Запустите заново: `npm run dev`
- ✅ Обновите страницу в браузере

## 📝 Текущая конфигурация

Проект: **skypathvpn**
- API Key: `AIzaSy...` (получите в Firebase Console)
- Auth Domain: `your-project-id.firebaseapp.com`
- Project ID: `your-project-id`
- Storage Bucket: `your-project-id.firebasestorage.app`

## 🔑 Методы авторизации

Проект поддерживает:
- ✅ **Email/Password** - регистрация и вход через email и пароль
- ✅ **Google Sign-In** - быстрый вход через Google аккаунт

## 📊 Структура данных

**Firebase Authentication:**
- Email/Password аккаунты
- Google аккаунты
- UID - уникальный идентификатор пользователя

**Firestore:**
- `artifacts/skyputh/public/data/users_v4/{uid}` - данные пользователя (UID = Firebase Auth UID)
- `artifacts/skyputh/public/data/payments` - платежи
- `artifacts/skyputh/public/data/tariffs` - тарифы
- `artifacts/skyputh/public/settings` - настройки приложения

## 🔗 Полезные ссылки

- [Firebase Console](https://console.firebase.google.com/project/skypathvpn)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Firebase Auth Documentation](https://firebase.google.com/docs/auth)
- [Firebase Auth Email/Password](https://firebase.google.com/docs/auth/web/password-auth)
- [Firebase Auth Google Sign-In](https://firebase.google.com/docs/auth/web/google-signin)
