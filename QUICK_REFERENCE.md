# Google Auth Fix - Быстрая справка

## 🚀 Быстрый старт

### Локально (из корня проекта)
```bash
node scripts/set-admin-claim.js admin@example.com
node scripts/set-admin-claim.js --migrate
node scripts/set-admin-claim.js --info user@example.com
```

### На сервере (скрипт в папке server/, деплоится с бэкендом)
```bash
cd /opt/my-frontend/server
node set-admin-claim.js --migrate
node set-admin-claim.js admin@example.com
node set-admin-claim.js --info user@example.com
```
Если `scripts/set-admin-claim.js` на сервере нет — используйте `server/set-admin-claim.js` (см. `server/ADMIN_CLAIM_README.md`).

### Задеплоить Firestore Rules
```bash
firebase deploy --only firestore:rules
```

## 📝 Что изменилось

### 1. Задержка 300 мс после Google-авторизации
```javascript
// src/app/App.jsx, строка ~1442
await new Promise(resolve => setTimeout(resolve, 300))
```

### 2. Перенаправление через onAuthStateChanged
```javascript
// src/app/App.jsx, строка ~752
if (isGoogleSignIn && (view === 'login' || view === 'register' || view === 'welcome')) {
  window.location.replace('/dashboard')
}
```

### 3. Проверка admin claim в Firestore Rules
```javascript
// firestore.rules, строка ~9
function isAdmin() {
  return request.auth != null && 
    request.auth.token.admin == true;
}
```

## 🔧 Как установить admin claim

### Вариант 1: Через скрипт (рекомендуется)
```bash
node scripts/set-admin-claim.js admin@example.com
```

### Вариант 2: Через Firebase Admin SDK
```javascript
const admin = require('firebase-admin');
await admin.auth().setCustomUserClaims(uid, { admin: true });
```

### Вариант 3: Через Firebase Console
1. Authentication → Users
2. Найти пользователя
3. Custom claims → `{"admin": true}`

## ⚠️ Важно помнить

1. **После установки claim пользователь должен перелогиниться**
2. **Custom claims ограничены 1000 байтами**
3. **Claims устанавливаются только через Admin SDK**
4. **Firestore Rules применяются на уровне базы данных**

## 🐛 Частые проблемы

### Ошибка: "permission-denied"
**Причина:** Нет admin claim  
**Решение:** Установить claim и перелогиниться

### Ошибка: "firebase-service-account.json not found"
**Причина:** Файл не найден  
**Решение:** Положить файл в `server/firebase-service-account.json`

### Задержка слишком большая
**Причина:** 300 мс может быть много  
**Решение:** Изменить в `src/app/App.jsx`, строка ~1442

## 📚 Документация

- **Полная документация:** `docs/GOOGLE_AUTH_FIX.md`
- **Краткая сводка:** `GOOGLE_AUTH_FIX_SUMMARY.md`
- **Тестовый план:** `tests/google-auth-fix.test.md`

## 🔗 Полезные ссылки

- [Firebase Custom Claims](https://firebase.google.com/docs/auth/admin/custom-claims)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase Auth State](https://firebase.google.com/docs/auth/web/auth-state-persistence)

## 📞 Контакты

При возникновении проблем обращайтесь к администратору системы.
