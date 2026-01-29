# 🪟 Развертывание SKYPATH FLOW на Windows

Полное руководство по установке и запуску проекта на Windows 10/11.

---

## 📋 Содержание

- [Требования](#-требования)
- [Быстрая установка](#-быстрая-установка)
- [Ручная установка](#-ручная-установка)
- [Настройка](#-настройка)
- [Запуск](#-запуск)
- [Production развертывание](#-production-развертывание)
- [Устранение неполадок](#-устранение-неполадок)

---

## ✅ Требования

### Системные требования

- **ОС**: Windows 10 (версия 1809 или новее) или Windows 11
- **RAM**: Минимум 4GB (рекомендуется 8GB+)
- **Диск**: Минимум 5GB свободного места
- **Процессор**: Любой современный процессор

### Программное обеспечение

- **Node.js**: >= 18.0.0 (рекомендуется 20.x LTS)
- **npm**: >= 9.0.0 (устанавливается вместе с Node.js)
- **Git**: для клонирования репозитория (опционально)
- **PowerShell**: 5.0 или выше (встроен в Windows 10/11)

---

## ⚡ Быстрая установка

### Автоматическая установка (рекомендуется)

#### Вариант 1: PowerShell (рекомендуется)

```powershell
# 1. Откройте PowerShell от имени администратора
#    Нажмите Win+X и выберите "Windows PowerShell (Admin)" или "Terminal (Admin)"

# 2. Разрешите выполнение скриптов (только первый раз)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 3. Клонируйте репозиторий (или распакуйте архив)
cd C:\Projects
git clone <repository-url>
cd VPN

# 4. Запустите скрипт установки
.\install-windows.ps1

# 5. Настройте переменные окружения
Copy-Item .env.example .env
notepad .env  # Заполните все переменные

# 6. Проверьте конфигурацию
node check-env.js

# 7. Запустите приложение
.\start-all.ps1
```

#### Вариант 2: Batch файл

```cmd
REM 1. Откройте командную строку (cmd)
REM    Нажмите Win+R, введите cmd и нажмите Enter

REM 2. Перейдите в директорию проекта
cd C:\Projects\VPN

REM 3. Установите зависимости вручную
npm install
cd server
npm install
cd ..

REM 4. Создайте .env файл
copy .env.example .env
notepad .env

REM 5. Запустите приложение
start-all.bat
```

Готово! Приложение будет доступно по адресу `http://localhost:5173`

---

## 🔧 Ручная установка

Если вы предпочитаете установку вручную:

### Шаг 1: Установка Node.js

1. Перейдите на [nodejs.org](https://nodejs.org/)
2. Скачайте **LTS версию** (рекомендуется 20.x)
3. Запустите установщик и следуйте инструкциям
4. Проверьте установку:

```cmd
node -v
npm -v
```

**Альтернатива через winget (Windows 11):**

```powershell
winget install OpenJS.NodeJS.LTS
```

### Шаг 2: Установка Git (опционально)

1. Перейдите на [git-scm.com](https://git-scm.com/download/win)
2. Скачайте и установите Git
3. Или используйте winget:

```powershell
winget install Git.Git
```

### Шаг 3: Клонирование проекта

```cmd
cd C:\Projects
git clone <repository-url>
cd VPN
```

Или распакуйте архив проекта в нужную директорию.

### Шаг 4: Установка зависимостей

```cmd
# Установка зависимостей frontend
npm install

# Установка зависимостей backend
cd server
npm install
cd ..
```

### Шаг 5: Установка PM2 (опционально, для production)

```cmd
npm install -g pm2
```

---

## ⚙️ Настройка

### 1. Создание файла .env

```cmd
copy .env.example .env
notepad .env
```

Или в PowerShell:

```powershell
Copy-Item .env.example .env
notepad .env
```

### 2. Настройка Firebase

1. Перейдите на [Firebase Console](https://console.firebase.google.com/)
2. Создайте проект или выберите существующий
3. Включите **Firestore Database**
4. Перейдите в **Project Settings** > **Your apps** > **Web app**
5. Скопируйте конфигурацию в `.env`:

```env
VITE_FIREBASE_API_KEY=AIzaSyC...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123def456
```

### 3. Настройка 3x-ui

```env
# Адрес панели 3x-ui
XUI_HOST=http://your-server-ip:2053

# Учетные данные администратора
XUI_USERNAME=admin
XUI_PASSWORD=your_password

# ID инбаунда
XUI_INBOUND_ID=1
```

### 4. Настройка Backend Proxy

```env
PROXY_PORT=3001
PROXY_HOST=0.0.0.0
ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com
FRONTEND_URL=http://localhost:5173
```

### 5. Проверка конфигурации

```cmd
node check-env.js
```

Должны быть все галочки ✅. Если есть ❌, заполните недостающие переменные.

---

## 🚀 Запуск

### Режим разработки

#### Вариант 1: Использование PowerShell скрипта (рекомендуется)

```powershell
.\start-all.ps1
```

#### Вариант 2: Использование Batch файла

```cmd
start-all.bat
```

#### Вариант 3: Ручной запуск

**Терминал 1: Backend proxy**

```cmd
cd server
npm start
```

**Терминал 2: Frontend**

```cmd
npm run dev
```

Приложение будет доступно:
- **Frontend**: http://localhost:5173
- **Backend Proxy**: http://localhost:3001

### Production режим

#### 1. Сборка проекта

```cmd
npm run build
```

Собранные файлы будут в папке `dist\`

#### 2. Запуск через PM2 (рекомендуется)

```cmd
REM Запуск backend proxy
cd server
pm2 start proxy-server.js --name skyputh-vpn-backend

REM Запуск frontend (статический сервер)
cd ..
pm2 serve dist 5173 --name skyputh-vpn-frontend --spa

REM Сохранение конфигурации PM2
pm2 save

REM Настройка автозапуска при загрузке системы
pm2 startup
REM Выполните команду, которую выведет PM2
```

#### 3. Проверка статуса

```cmd
pm2 status
pm2 logs skyputh-vpn-backend
pm2 logs skyputh-vpn-frontend
```

---

## 🌐 Production развертывание

### Вариант 1: IIS (Internet Information Services)

#### 1. Установка IIS

```powershell
# В PowerShell от имени администратора
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServer
Enable-WindowsOptionalFeature -Online -FeatureName IIS-CommonHttpFeatures
Enable-WindowsOptionalFeature -Online -FeatureName IIS-HttpErrors
Enable-WindowsOptionalFeature -Online -FeatureName IIS-ApplicationInit
```

#### 2. Установка URL Rewrite

Скачайте и установите [URL Rewrite Module](https://www.iis.net/downloads/microsoft/url-rewrite)

#### 3. Сборка проекта

```cmd
npm run build
```

#### 4. Настройка IIS

1. Откройте **IIS Manager**
2. Создайте новый сайт:
   - **Physical path**: `C:\Projects\VPN\dist`
   - **Binding**: `http://localhost:80` или `https://localhost:443`
3. Настройте URL Rewrite для SPA:
   - Добавьте правило: **Rewrite** → **Inbound Rules** → **Blank Rule**
   - **Pattern**: `.*`
   - **Conditions**: `{REQUEST_FILENAME}` не существует
   - **Action**: Rewrite to `/index.html`

#### 5. Настройка прокси для API

Установите [Application Request Routing](https://www.iis.net/downloads/microsoft/application-request-routing) и настройте проксирование `/api/*` на `http://localhost:3001`

### Вариант 2: PM2 + Nginx (WSL)

Если у вас установлен WSL (Windows Subsystem for Linux), вы можете использовать Nginx:

1. Установите WSL и Ubuntu
2. Следуйте инструкциям из `UBUNTU_DEPLOY.md`
3. Настройте Nginx для проксирования

### Вариант 3: Docker Desktop

```cmd
# Сборка образа
docker build -t skyputh-vpn:latest .

# Запуск через docker-compose
docker-compose up -d
```

---

## 🛠️ Устранение неполадок

### Проблема: "execution of scripts is disabled"

**Решение:**

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Проблема: Node.js не найден

**Решение:**

1. Проверьте установку: `node -v`
2. Если не установлен, скачайте с [nodejs.org](https://nodejs.org/)
3. Перезапустите терминал после установки
4. Проверьте PATH: `echo %PATH%`

### Проблема: Порт уже занят

**Решение:**

```cmd
REM Проверьте, какой процесс использует порт
netstat -ano | findstr :3001
netstat -ano | findstr :5173

REM Остановите процесс (замените PID на реальный)
taskkill /F /PID <PID>
```

Или используйте PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 3001 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

### Проблема: Ошибки при установке зависимостей

**Решение:**

```cmd
REM Очистите кэш npm
npm cache clean --force

REM Удалите node_modules и установите заново
rmdir /s /q node_modules
del package-lock.json
npm install
```

### Проблема: Firebase не инициализирован

1. Проверьте все переменные Firebase в `.env`
2. Убедитесь, что переменные начинаются с `VITE_`
3. Перезапустите dev сервер после изменения `.env`

### Проблема: CORS ошибки

1. Проверьте `ALLOWED_ORIGINS` в `.env`
2. Убедитесь, что backend proxy запущен
3. Проверьте настройки прокси в `vite.config.js`

### Проблема: Не удается подключиться к 3x-ui

1. Проверьте доступность панели: `curl http://your-server:2053`
2. Проверьте `XUI_HOST` в `.env`
3. Проверьте учетные данные `XUI_USERNAME` и `XUI_PASSWORD`

### Просмотр логов

```cmd
REM Логи backend (если запущен через start-all.bat)
type backend.log

REM Логи PM2
pm2 logs
```

---

## 📚 Полезные команды

```cmd
REM Проверка переменных окружения
node check-env.js

REM Проверка версий
node -v
npm -v
pm2 -v

REM Проверка портов
netstat -ano | findstr :3001
netstat -ano | findstr :5173

REM Остановка всех процессов Node.js
taskkill /F /IM node.exe

REM Перезапуск сервисов PM2
pm2 restart all
```

---

## 🔒 Безопасность

### Рекомендации для production

1. **Используйте HTTPS**: Настройте SSL сертификаты
2. **Firewall**: Настройте Windows Firewall для ограничения доступа
3. **Секреты**: Никогда не коммитьте `.env` в Git
4. **Обновления**: Регулярно обновляйте систему и зависимости
   ```cmd
   npm audit fix
   ```

---

## 📞 Поддержка

Если возникли проблемы:

1. Проверьте раздел [Устранение неполадок](#-устранение-неполадок)
2. Просмотрите логи приложения
3. Проверьте документацию в `README.md`

---

**Последнее обновление**: 2024
