# 🐧 Развертывание SkyPuth VPN на Ubuntu 22.04

Полное руководство по установке и запуску проекта на Ubuntu 22.04.

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

- **ОС**: Ubuntu 22.04 LTS (или новее)
- **RAM**: Минимум 2GB (рекомендуется 4GB+)
- **Диск**: Минимум 5GB свободного места
- **Процессор**: Любой современный процессор

### Программное обеспечение

- **Node.js**: >= 18.0.0 (рекомендуется 20.x)
- **npm**: >= 9.0.0 (устанавливается вместе с Node.js)
- **Git**: для клонирования репозитория
- **PM2**: для управления процессами (опционально, но рекомендуется)

---

## ⚡ Быстрая установка

### Автоматическая установка (рекомендуется)

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

# 4. Проверьте конфигурацию
node check-env.js

# 5. Запустите приложение
./start-all.sh
```

Готово! Приложение будет доступно по адресу `http://localhost:5173`

---

## 🔧 Ручная установка

Если вы предпочитаете установку вручную или скрипт не работает:

### Шаг 1: Обновление системы

```bash
sudo apt-get update
sudo apt-get upgrade -y
```

### Шаг 2: Установка Node.js 20.x

```bash
# Добавляем репозиторий NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Устанавливаем Node.js
sudo apt-get install -y nodejs

# Проверяем установку
node -v  # Должно быть v20.x.x
npm -v   # Должно быть 9.x.x или выше
```

### Шаг 3: Установка дополнительных утилит

```bash
sudo apt-get install -y \
    curl \
    git \
    build-essential \
    net-tools
```

### Шаг 4: Установка PM2 (опционально, но рекомендуется)

```bash
sudo npm install -g pm2
```

### Шаг 5: Клонирование проекта

```bash
git clone <repository-url>
cd VPN
```

### Шаг 6: Установка зависимостей

```bash
# Установка зависимостей frontend
npm install

# Установка зависимостей backend
cd server
npm install
cd ..
```

---

## ⚙️ Настройка

### 1. Создание файла .env

```bash
cp .env.example .env
nano .env
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

```bash
node check-env.js
```

Должны быть все галочки ✅. Если есть ❌, заполните недостающие переменные.

---

## 🚀 Запуск

### Режим разработки

#### Вариант 1: Использование скрипта (рекомендуется)

```bash
./start-all.sh
```

Этот скрипт автоматически:
- Проверяет зависимости
- Запускает backend proxy сервер
- Запускает frontend dev сервер

#### Вариант 2: Ручной запуск

```bash
# Терминал 1: Backend proxy
cd server
npm start

# Терминал 2: Frontend
npm run dev
```

Приложение будет доступно:
- **Frontend**: http://localhost:5173
- **Backend Proxy**: http://localhost:3001

### Production режим

#### 1. Сборка проекта

```bash
npm run build
```

Собранные файлы будут в папке `dist/`

#### 2. Запуск через PM2 (рекомендуется)

```bash
# Запуск backend proxy
cd server
pm2 start proxy-server.js --name skyputh-vpn-backend

# Запуск frontend (статический сервер)
cd ..
pm2 serve dist 5173 --name skyputh-vpn-frontend --spa

# Сохранение конфигурации PM2
pm2 save

# Настройка автозапуска при загрузке системы
pm2 startup
# Выполните команду, которую выведет PM2
```

#### 3. Проверка статуса

```bash
pm2 status
pm2 logs skyputh-vpn-backend
pm2 logs skyputh-vpn-frontend
```

---

## 🌐 Production развертывание

### Вариант 1: Nginx + PM2

#### 1. Установка Nginx

```bash
sudo apt-get install -y nginx
```

#### 2. Сборка проекта

```bash
npm run build
```

#### 3. Копирование файлов

```bash
sudo mkdir -p /var/www/skyputh-vpn
sudo cp -r dist/* /var/www/skyputh-vpn/
sudo chown -R www-data:www-data /var/www/skyputh-vpn
```

#### 4. Настройка Nginx

Создайте файл `/etc/nginx/sites-available/skyputh-vpn`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # Редирект на HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL сертификаты (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # Корневая директория
    root /var/www/skyputh-vpn;
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

#### 5. Активация конфигурации

```bash
sudo ln -s /etc/nginx/sites-available/skyputh-vpn /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 6. Настройка SSL (Let's Encrypt)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Вариант 2: Docker

См. `Dockerfile` и `docker-compose.yml` в корне проекта.

```bash
# Сборка образа
docker build -t skyputh-vpn:latest .

# Запуск через docker-compose
docker-compose up -d
```

---

## 🔧 Systemd сервисы (автозапуск)

### Создание сервиса для backend

Создайте файл `~/.config/systemd/user/skyputh-vpn-backend.service`:

```ini
[Unit]
Description=SkyPuth VPN Backend Proxy Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/VPN/server
ExecStart=/usr/bin/node proxy-server.js
Restart=always
RestartSec=10
Environment="NODE_ENV=production"
EnvironmentFile=/path/to/VPN/.env

[Install]
WantedBy=default.target
```

### Активация сервиса

```bash
# Перезагрузка systemd
systemctl --user daemon-reload

# Включение автозапуска
systemctl --user enable skyputh-vpn-backend

# Запуск сервиса
systemctl --user start skyputh-vpn-backend

# Проверка статуса
systemctl --user status skyputh-vpn-backend

# Просмотр логов
journalctl --user -u skyputh-vpn-backend -f
```

---

## 🛠️ Устранение неполадок

### Проблема: Node.js не найден

```bash
# Проверьте установку
node -v

# Если не установлен, установите:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Проблема: Порт уже занят

```bash
# Проверьте, какой процесс использует порт
sudo netstat -tulpn | grep :3001
sudo netstat -tulpn | grep :5173

# Остановите процесс
sudo kill -9 <PID>
```

### Проблема: Ошибки при установке зависимостей

```bash
# Очистите кэш npm
npm cache clean --force

# Удалите node_modules и установите заново
rm -rf node_modules package-lock.json
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

```bash
# Логи backend (если запущен через start-all.sh)
tail -f backend.log

# Логи PM2
pm2 logs

# Логи systemd
journalctl --user -u skyputh-vpn-backend -f
```

---

## 📚 Полезные команды

```bash
# Проверка переменных окружения
node check-env.js

# Проверка версий
node -v
npm -v
pm2 -v

# Проверка портов
sudo netstat -tulpn | grep -E ':(3001|5173)'

# Остановка всех процессов
pm2 stop all
pm2 delete all

# Перезапуск сервисов
pm2 restart all
systemctl --user restart skyputh-vpn-backend
```

---

## 🔒 Безопасность

### Рекомендации для production

1. **Используйте HTTPS**: Настройте SSL сертификаты (Let's Encrypt)
2. **Firewall**: Ограничьте доступ к портам
   ```bash
   sudo ufw allow 22/tcp   # SSH
   sudo ufw allow 80/tcp   # HTTP
   sudo ufw allow 443/tcp  # HTTPS
   sudo ufw enable
   ```
3. **Секреты**: Никогда не коммитьте `.env` в Git
4. **Обновления**: Регулярно обновляйте систему и зависимости
   ```bash
   sudo apt-get update && sudo apt-get upgrade -y
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
