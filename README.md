# 🚀 SKYFLOW

> Современный веб-интерфейс для управления VPN-сервисом с интеграцией Firebase, админ-панелью и системой платежей.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-ISC-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)

---

## 📋 Содержание

- [Описание](#-описание)
- [Технологический стек](#-технологический-стек)
- [Быстрый старт](#-быстрый-старт)
- [Установка](#-установка)
- [Настройка](#-настройка)
- [Запуск](#-запуск)
- [Развертывание](#-развертывание)
- [Архитектура](#-архитектура)
- [Безопасность](#-безопасность)
- [Поддержка](#-поддержка)

---

## 🎯 Описание

**SKYFLOW** — это полнофункциональное веб-приложение для управления VPN-сервисом, которое предоставляет:

- 🔐 **Система аутентификации** — регистрация и вход пользователей через Firebase Auth
- 📊 **Личный кабинет** — просмотр статистики, управление подписками, получение конфигураций
- 👨‍💼 **Админ-панель** — управление пользователями, серверами, мониторинг системы
- 💳 **Интеграция платежей** — поддержка YooMoney и других платежных систем через n8n
- 🔌 **Интеграция с 3x-ui** — автоматическое создание и управление VPN-клиентами
- 📱 **Адаптивный дизайн** — работает на всех устройствах

---

## 🛠 Технологический стек

### Frontend
- **React 18** — библиотека для построения пользовательских интерфейсов
- **Vite 7** — быстрый сборщик и dev-сервер
- **React Router 7** — маршрутизация
- **Zustand** — управление состоянием
- **TanStack Query** — работа с серверными данными
- **Tailwind CSS** — утилитарный CSS-фреймворк
- **Lucide React** — иконки

### Backend & Database
- **Firebase Firestore** — NoSQL база данных
- **Firebase Auth** — аутентификация пользователей
- **Firebase App Check** — защита от ботов и злоупотреблений

### Интеграции
- **3x-ui API** — управление VPN-панелью
- **n8n** — автоматизация платежей и webhooks
- **YooMoney** — платежная система

### Инструменты разработки
- **ESLint** — линтинг кода
- **PostCSS** — обработка CSS
- **Rollup** — сборка для production

---

## ⚡ Быстрый старт

### Предварительные требования

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0 (или yarn/pnpm)
- **Firebase проект** с настроенным Firestore
- **3x-ui панель** с доступом к API

### 🐧 Для Ubuntu 22.04

Если вы развертываете на Ubuntu 22.04, используйте автоматическую установку:

```bash
# 1. Клонируйте репозиторий
git clone <repository-url>
cd VPN

# 2. Запустите скрипт установки
chmod +x install-ubuntu.sh
./install-ubuntu.sh

# 3. Настройте переменные окружения
cp .env.example .env
nano .env  # Заполните все переменные

# 4. Запустите приложение
./start-all.sh
```

📚 **Подробная инструкция**: [UBUNTU_DEPLOY.md](./UBUNTU_DEPLOY.md)  
🚀 **Быстрый старт**: [UBUNTU_QUICK_START.md](./UBUNTU_QUICK_START.md)

### 🪟 Для Windows 10/11

Если вы развертываете на Windows, используйте автоматическую установку:

```powershell
# 1. Откройте PowerShell от имени администратора
#    Разрешите выполнение скриптов (только первый раз)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 2. Перейдите в директорию проекта
cd C:\Projects\VPN

# 3. Запустите скрипт установки
.\install-windows.ps1

# 4. Настройте переменные окружения
Copy-Item .env.example .env
notepad .env  # Заполните все переменные

# 5. Запустите приложение
.\start-all.ps1
```

📚 **Подробная инструкция**: [WINDOWS_DEPLOY.md](./WINDOWS_DEPLOY.md)  
🚀 **Быстрый старт**: [WINDOWS_QUICK_START.md](./WINDOWS_QUICK_START.md)

### Установка за 3 шага (вручную)

```bash
# 1. Клонируйте репозиторий
git clone <repository-url>
cd VPN

# 2. Установите зависимости
npm install
cd server && npm install && cd ..

# 3. Настройте переменные окружения
cp .env.example .env
# Откройте .env и заполните все значения
```

Затем запустите:

```bash
# Запуск backend proxy (в отдельном терминале)
cd server && npm start &

# Запуск frontend
npm run dev
```

Приложение будет доступно по адресу: `http://localhost:5173`

---

## 📦 Установка

### 1. Клонирование репозитория

```bash
git clone <repository-url>
cd VPN
```

### 2. Установка зависимостей

```bash
npm install
```

Это установит все необходимые зависимости, указанные в `package.json`.

### 3. Настройка переменных окружения

Скопируйте файл `.env.example` в `.env`:

```bash
cp .env.example .env
```

Откройте `.env` в редакторе и заполните все переменные. Подробная инструкция по настройке — в разделе [Настройка](#-настройка).

---

## ⚙️ Настройка

### Firebase настройка

1. Перейдите в [Firebase Console](https://console.firebase.google.com/)
2. Создайте новый проект или выберите существующий
3. Включите **Firestore Database**
4. Перейдите в **Project Settings** > **Your apps** > **Web app**
5. Скопируйте конфигурацию в `.env`:

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

6. Настройте Firestore:
   - Создайте коллекцию: `/artifacts/skyputh/public/data/users_v4`
   - Настройте правила безопасности (см. `firestore.rules`)

### 3x-ui настройка

1. Убедитесь, что панель 3x-ui доступна и работает
2. Получите учетные данные администратора
3. Найдите ID инбаунда, в который будут добавляться клиенты
4. Заполните в `.env`:

```env
# ⚠️ ВАЖНО: Эти переменные НЕ должны иметь префикс VITE_!
# Они используются только на backend сервере
XUI_HOST=http://your-server-ip:2053
XUI_USERNAME=admin
XUI_PASSWORD=your_password
XUI_INBOUND_ID=1
```

### Backend Proxy Server

Для работы в production необходим backend proxy сервер:

```env
PROXY_PORT=3001
PROXY_HOST=0.0.0.0
ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com
FRONTEND_URL=https://yourdomain.com
```

### Опциональные настройки

```env
# Уровень логирования (debug, info, warn, error)
VITE_LOG_LEVEL=debug

# VLESS конфигурация
VITE_VLESS_SERVER=nl.skyputh.com
VITE_VLESS_PORT=443
VITE_VLESS_PUBLIC_KEY=your-public-key
VITE_VLESS_SHORT_ID=your-short-id
VITE_VLESS_SNI=www.microsoft.com
VITE_VLESS_FINGERPRINT=chrome

# reCAPTCHA для Firebase App Check
VITE_RECAPTCHA_SITE_KEY=your_recaptcha_site_key
```

---

## 🚀 Запуск

### Режим разработки

```bash
npm run dev
```

Приложение будет доступно по адресу `http://localhost:5173`

### Сборка для production

```bash
npm run build
```

Собранные файлы будут в папке `dist/`

### Просмотр production сборки локально

```bash
npm run preview
```

### Запуск Backend Proxy Server

```bash
cd server
npm install
npm start
```

Или через PM2:

```bash
pm2 start server/proxy-server.js --name xui-proxy
```

---

## 🌐 Развертывание

### Вариант 1: Статический хостинг (Vercel, Netlify)

#### Vercel

```bash
npm i -g vercel
vercel
```

**Важно**: Добавьте все переменные окружения в настройках проекта на Vercel.

#### Netlify

1. Подключите репозиторий к Netlify
2. Укажите:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
3. Добавьте все переменные окружения в настройках

### Вариант 2: Собственный сервер (Nginx)

#### 1. Сборка проекта

```bash
npm run build
```

#### 2. Копирование файлов на сервер

```bash
scp -r dist/* user@your-server:/var/www/skypath-flow/
```

#### 3. Настройка Nginx

Создайте файл `/etc/nginx/sites-available/skypath-flow`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    root /var/www/skypath-flow;
    index index.html;
    
    # Проксирование к Backend Proxy
    location /api/vpn {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /api/payment {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Статические файлы
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Кэширование
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### 4. Активация конфигурации

```bash
sudo ln -s /etc/nginx/sites-available/skypath-flow /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 5. Настройка SSL (Let's Encrypt)

```bash
sudo certbot --nginx -d your-domain.com
```

### Вариант 3: Docker

См. `Dockerfile` и `docker-compose.yml` в корне проекта.

---

## 🏗 Архитектура

### Структура проекта

```
VPN/
├── src/
│   ├── app/              # Главный компонент приложения
│   ├── features/         # Функциональные модули
│   │   ├── auth/         # Аутентификация
│   │   ├── dashboard/    # Личный кабинет
│   │   ├── admin/        # Админ-панель
│   │   ├── payment/      # Платежи
│   │   └── vpn/          # VPN сервисы
│   ├── shared/           # Общие компоненты и утилиты
│   ├── lib/              # Внешние библиотеки (Firebase)
│   └── utils/             # Утилиты
├── server/               # Backend proxy сервер
├── public/               # Статические файлы
├── .env.example          # Шаблон переменных окружения
├── package.json          # Зависимости проекта
└── vite.config.js        # Конфигурация Vite
```

### Основные компоненты

- **App.jsx** — главный компонент приложения
- **LoginForm** — форма входа/регистрации
- **Dashboard** — личный кабинет пользователя
- **AdminPanel** — админ-панель
- **KeyModal** — модальное окно с конфигурацией VLESS

### Сервисы

- **dashboardService** — работа с данными пользователя
- **paymentService** — обработка платежей
- **XUIService** — интеграция с 3x-ui API
- **adminService** — административные функции

---

## 🔒 Безопасность

### ✅ Реализованные меры

- 🔐 **Пароли хешируются** через bcryptjs перед сохранением
- 🔑 **Секреты в переменных окружения** — никаких hardcoded ключей
- 🛡️ **Firebase App Check** — защита от ботов
- 🔒 **HTTPS обязателен** в production
- 🚫 **CORS настроен** для разрешенных origins
- 📝 **Логирование** с маскировкой чувствительных данных

### ⚠️ Рекомендации для production

1. **Никогда не коммитьте `.env` в Git**
   - Убедитесь, что `.env` в `.gitignore`
   - Используйте `.env.example` как шаблон

2. **Используйте HTTPS**
   - Настройте SSL сертификаты (Let's Encrypt)
   - Принудительно перенаправляйте HTTP на HTTPS

3. **Настройте правила безопасности Firestore**
   - Ограничьте доступ к данным пользователей
   - Используйте Firebase Authentication для проверки прав

4. **Ограничьте доступ к панели 3x-ui**
   - Используйте firewall для ограничения доступа
   - Используйте сильные пароли

5. **Настройте мониторинг**
   - Используйте Sentry для отслеживания ошибок
   - Настройте uptime monitoring

---

## 📚 Дополнительная документация

### Развертывание
- [UBUNTU_DEPLOY.md](./UBUNTU_DEPLOY.md) — развертывание на Ubuntu 22.04
- [UBUNTU_QUICK_START.md](./UBUNTU_QUICK_START.md) — быстрый старт на Ubuntu
- [WINDOWS_DEPLOY.md](./WINDOWS_DEPLOY.md) — развертывание на Windows 10/11
- [WINDOWS_QUICK_START.md](./WINDOWS_QUICK_START.md) — быстрый старт на Windows
- [DEPLOYMENT.md](./DEPLOYMENT.md) — общее руководство по развертыванию
- [QUICK_START.md](./QUICK_START.md) — быстрый старт за 5 минут

### Настройка
- [SETUP_ENV.md](./SETUP_ENV.md) — настройка переменных окружения
- [SECURITY_SECRETS_MANAGEMENT.md](./SECURITY_SECRETS_MANAGEMENT.md) — управление секретами
- [PAYMENT_SETUP.md](./PAYMENT_SETUP.md) — настройка платежей

---

## 🆘 Поддержка

### Устранение неполадок

#### Приложение не запускается

1. Проверьте, что все зависимости установлены: `npm install`
2. Проверьте, что файл `.env` существует и заполнен
3. Проверьте консоль на наличие ошибок валидации

#### Ошибка "Firebase не инициализирован"

1. Проверьте все переменные Firebase в `.env`
2. Убедитесь, что переменные начинаются с `VITE_`
3. Перезапустите dev сервер после изменения `.env`

#### Ошибка подключения к 3x-ui

1. Проверьте, что `XUI_HOST` указан правильно
2. Проверьте доступность панели 3x-ui
3. Проверьте учетные данные

#### CORS ошибки

1. В dev режиме: проверьте настройки прокси в `vite.config.js`
2. В production: настройте прокси на уровне веб-сервера

### Полезные команды

```bash
# Проверка переменных окружения
node check-env.js

# Запуск всех сервисов
./start-all.sh

# Анализ размера бандла
npm run analyze
```

---

## 📝 Лицензия

Проект разработан для SKYFLOW.

---

## 👥 Авторы

Разработано командой SKYFLOW.

---

**Последнее обновление**: 2024
