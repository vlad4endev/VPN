# 🚀 Инструкция по деплою на удаленный сервер

> Пошаговая инструкция для развертывания SkyPuth VPN на удаленном сервере через Docker

---

## 📋 Предварительные требования

На удаленном сервере должно быть установлено:

- **Docker** >= 20.10
- **Docker Compose** >= 2.0
- **Git** (для клонирования репозитория)
- **SSH доступ** к серверу

---

## 🚀 Шаг 1: Подключение к серверу

```bash
ssh user@your-server-ip
```

---

## 🔧 Шаг 2: Установка Docker (если не установлен)

### Ubuntu/Debian:

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Добавление пользователя в группу docker
sudo usermod -aG docker $USER

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Проверка установки
docker --version
docker-compose --version

# Выйдите и войдите снова, чтобы группа docker вступила в силу
exit
```

---

## 📥 Шаг 3: Клонирование репозитория

```bash
# Создайте директорию для проекта
mkdir -p ~/projects
cd ~/projects

# Клонируйте репозиторий
git clone https://github.com/vlad4endev/VPN.git skyputh-vpn
cd skyputh-vpn

# Проверьте, что файлы на месте
ls -la
```

---

## ⚙️ Шаг 4: Настройка переменных окружения

```bash
# Создайте .env.production файл
cp .env.example .env.production

# Откройте файл для редактирования
nano .env.production
```

### Заполните обязательные переменные:

```env
# Режим работы
NODE_ENV=production

# Backend proxy
PROXY_PORT=3001
PROXY_HOST=0.0.0.0

# 3x-ui настройки (ВАЖНО: без префикса VITE_!)
XUI_HOST=http://your-3xui-server:2053
XUI_USERNAME=admin
XUI_PASSWORD=your_password_here
XUI_INBOUND_ID=1

# CORS настройки
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
FRONTEND_URL=https://yourdomain.com

# Firebase (для frontend - с префиксом VITE_)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# Логирование
VITE_LOG_LEVEL=warn
```

Сохраните файл: `Ctrl+O`, `Enter`, `Ctrl+X`

---

## 🐳 Шаг 5: Сборка и запуск контейнера

### Вариант А: Через Docker Compose (рекомендуется)

```bash
# Сборка и запуск в фоне
docker-compose up -d --build

# Просмотр логов
docker-compose logs -f

# Проверка статуса
docker-compose ps
```

### Вариант Б: Через Docker напрямую

```bash
# Сборка образа
docker build -t skyputh-vpn:latest .

# Запуск контейнера
docker run -d \
  --name skyputh-vpn \
  -p 3001:3001 \
  --env-file .env.production \
  --restart unless-stopped \
  skyputh-vpn:latest

# Просмотр логов
docker logs -f skyputh-vpn
```

---

## ✅ Шаг 6: Проверка работоспособности

```bash
# Проверка статуса контейнера
docker ps | grep skyputh-vpn

# Healthcheck
curl http://localhost:3001/health

# Проверка frontend
curl http://localhost:3001/

# Просмотр логов
docker-compose logs -f skyputh-vpn
```

---

## 🌐 Шаг 7: Настройка Nginx (опционально)

Если хотите использовать домен и HTTPS:

### 1. Установите Nginx

```bash
sudo apt install -y nginx
```

### 2. Создайте конфигурацию

```bash
sudo nano /etc/nginx/sites-available/skyputh-vpn
```

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Редирект на HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    # SSL сертификаты (настройте после получения)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # Проксирование к Docker контейнеру
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Статические файлы (кэширование)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3001;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 3. Активируйте конфигурацию

```bash
sudo ln -s /etc/nginx/sites-available/skyputh-vpn /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Настройте SSL (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 🔄 Шаг 8: Обновление приложения

Когда нужно обновить приложение:

```bash
# Перейдите в директорию проекта
cd ~/projects/skyputh-vpn

# Получите последние изменения из GitHub
git pull origin main

# Пересоберите и перезапустите контейнер
docker-compose up -d --build

# Проверьте логи
docker-compose logs -f skyputh-vpn
```

---

## 🛠️ Полезные команды

### Управление контейнером

```bash
# Остановить
docker-compose down

# Запустить
docker-compose up -d

# Перезапустить
docker-compose restart

# Остановить и удалить (без данных)
docker-compose down -v

# Просмотр логов
docker-compose logs -f

# Просмотр статуса
docker-compose ps

# Выполнить команду внутри контейнера
docker-compose exec skyputh-vpn sh
```

### Мониторинг

```bash
# Использование ресурсов
docker stats skyputh-vpn

# Информация о контейнере
docker inspect skyputh-vpn

# Healthcheck статус
docker inspect --format='{{.State.Health.Status}}' skyputh-vpn
```

### Очистка

```bash
# Удалить неиспользуемые образы
docker image prune -a

# Удалить неиспользуемые контейнеры
docker container prune

# Полная очистка (осторожно!)
docker system prune -a
```

---

## 🔐 Безопасность

### ✅ Рекомендации:

1. **Используйте сильные пароли** для .env.production
2. **Ограничьте доступ** к .env.production файлу:
   ```bash
   chmod 600 .env.production
   ```

3. **Используйте firewall** для защиты портов:
   ```bash
   sudo ufw allow 22/tcp    # SSH
   sudo ufw allow 80/tcp    # HTTP
   sudo ufw allow 443/tcp   # HTTPS
   sudo ufw enable
   ```

4. **Регулярно обновляйте** Docker и систему:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

---

## 🆘 Устранение неполадок

### Проблема: Контейнер не запускается

```bash
# Проверьте логи
docker-compose logs skyputh-vpn

# Проверьте переменные окружения
docker-compose exec skyputh-vpn env | grep -E "(XUI|PROXY|NODE)"
```

### Проблема: Healthcheck не проходит

```bash
# Проверьте вручную
docker-compose exec skyputh-vpn curl -f http://localhost:3001/health

# Проверьте порт
netstat -tuln | grep 3001
```

### Проблема: Frontend не загружается

```bash
# Проверьте наличие dist папки
docker-compose exec skyputh-vpn ls -la /app/dist

# Проверьте статические файлы
curl http://localhost:3001/
```

### Проблема: Ошибки подключения к 3x-ui

```bash
# Проверьте переменные окружения
docker-compose exec skyputh-vpn env | grep XUI

# Проверьте доступность 3x-ui сервера
curl http://your-3xui-server:2053
```

---

## 📝 Чек-лист деплоя

- [ ] Docker установлен и работает
- [ ] Docker Compose установлен
- [ ] Репозиторий склонирован
- [ ] .env.production создан и заполнен
- [ ] Контейнер собран и запущен
- [ ] Healthcheck проходит успешно
- [ ] Frontend доступен по http://your-server:3001
- [ ] Nginx настроен (если используется)
- [ ] SSL сертификат настроен (если используется)
- [ ] Firewall настроен

---

## 🎉 Готово!

Ваше приложение запущено и доступно по адресу:
- **Локально на сервере**: `http://localhost:3001`
- **Через Nginx**: `https://yourdomain.com`

Для просмотра логов используйте:
```bash
docker-compose logs -f skyputh-vpn
```

---

**Успешного деплоя!** 🚀
