# 🚀 Быстрый старт на Windows

Минимальная инструкция для запуска проекта за 5 минут.

## 📋 Шаг 1: Установка Node.js

Если Node.js еще не установлен:

1. Скачайте с [nodejs.org](https://nodejs.org/) (LTS версия)
2. Или используйте winget: `winget install OpenJS.NodeJS.LTS`
3. Проверьте: `node -v` (должна быть версия >= 18)

## ⚡ Шаг 2: Установка проекта

### Вариант 1: PowerShell (рекомендуется)

```powershell
# Разрешите выполнение скриптов (только первый раз)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Перейдите в директорию проекта
cd C:\Projects\VPN

# Запустите установку
.\install-windows.ps1
```

### Вариант 2: Вручную

```cmd
cd C:\Projects\VPN
npm install
cd server
npm install
cd ..
```

## ⚙️ Шаг 3: Настройка

```cmd
copy .env.example .env
notepad .env
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

## ✅ Шаг 4: Проверка

```cmd
node check-env.js
```

## 🚀 Шаг 5: Запуск

### PowerShell:

```powershell
.\start-all.ps1
```

### Batch файл:

```cmd
start-all.bat
```

### Вручную:

```cmd
REM Терминал 1:
cd server
npm start

REM Терминал 2:
npm run dev
```

Откройте в браузере: **http://localhost:5173**

---

## 📚 Подробная документация

- **Полная инструкция**: `WINDOWS_DEPLOY.md`
- **Основная документация**: `README.md`

---

## ❓ Проблемы?

### Ошибка "execution of scripts is disabled"

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Порт занят

```cmd
netstat -ano | findstr :3001
taskkill /F /PID <PID>
```

### Node.js не найден

1. Установите Node.js с [nodejs.org](https://nodejs.org/)
2. Перезапустите терминал
3. Проверьте: `node -v`

---

**Готово! Проект запущен.** 🎉
