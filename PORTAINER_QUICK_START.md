# ⚡ Быстрая установка через Portainer

> Краткая инструкция для развертывания за 3 минуты

---

## 🚀 Шаг 1: Создание Stack в Portainer

1. Откройте **Portainer UI**
2. Перейдите в **Stacks** → **Add stack**
3. **Name**: `skyputh-vpn`

---

## 📥 Шаг 2: Настройка источника

### Вариант A: Из Git (рекомендуется)

- **Build method**: **Repository**
- **Repository URL**: `https://github.com/vlad4endev/VPN.git`
- **Reference**: `main`
- **Compose path**: `portainer-stack.yml`

### Вариант B: Web Editor

- **Build method**: **Web editor**
- Скопируйте содержимое `portainer-stack.yml` в редактор

---

## ⚙️ Шаг 3: Переменные окружения

Добавьте следующие переменные в секцию **Environment variables**:

### Обязательные:

```
XUI_HOST=http://your-3xui-server:2053
XUI_USERNAME=admin
XUI_PASSWORD=your_password
XUI_INBOUND_ID=1

VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

ALLOWED_ORIGINS=https://yourdomain.com
FRONTEND_URL=https://yourdomain.com
```

### Опциональные:

```
VITE_LOG_LEVEL=warn
VITE_RECAPTCHA_SITE_KEY=your_key
```

---

## ✅ Шаг 4: Запуск

1. Нажмите **Deploy the stack**
2. Дождитесь сборки и запуска
3. Проверьте статус контейнера

---

## 🔍 Проверка

1. Откройте **Containers** → `skyputh-vpn`
2. Проверьте **Status** (должен быть "Running")
3. Проверьте **Health** (должен быть "Healthy")
4. Откройте **Logs** для просмотра

---

## 📱 Доступ к приложению

- **Локально**: `http://your-server-ip:3001`
- **Через домен**: `https://yourdomain.com` (если настроен Nginx)

---

## 🔄 Обновление

1. **Stacks** → `skyputh-vpn` → **Editor**
2. Внесите изменения
3. **Update the stack**

Или включите **Auto-update** при создании для автоматических обновлений из Git.

---

**Готово!** Приложение запущено через Portainer. 🎉
