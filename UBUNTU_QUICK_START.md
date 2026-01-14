# 🚀 Быстрый старт на Ubuntu 22.04

Минимальная инструкция для запуска проекта за 5 минут.

## 📋 Шаг 1: Установка

```bash
# Клонируйте проект
git clone <repository-url>
cd VPN

# Запустите автоматическую установку
chmod +x install-ubuntu.sh
./install-ubuntu.sh
```

## ⚙️ Шаг 2: Настройка

```bash
# Создайте .env файл
cp .env.example .env

# Откройте и заполните переменные
nano .env
```

**Минимально необходимые переменные:**

```env
# Firebase (обязательно)
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# 3x-ui (обязательно)
XUI_HOST=http://your-server:2053
XUI_USERNAME=admin
XUI_PASSWORD=your_password
XUI_INBOUND_ID=1
```

## ✅ Шаг 3: Проверка

```bash
node check-env.js
```

## 🚀 Шаг 4: Запуск

```bash
./start-all.sh
```

Откройте в браузере: **http://localhost:5173**

---

## 📚 Подробная документация

- **Полная инструкция**: `UBUNTU_DEPLOY.md`
- **Основная документация**: `README.md`

---

## ❓ Проблемы?

```bash
# Проверьте версию Node.js (должна быть >= 18)
node -v

# Проверьте порты
sudo netstat -tulpn | grep -E ':(3001|5173)'

# Просмотрите логи
tail -f backend.log
```
