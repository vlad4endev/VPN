# 🐳 Docker Setup для SkyPuth VPN

> Оптимизированный Dockerfile для production deployment

## 🚀 Быстрый старт

```bash
# 1. Соберите образ
docker build -t skyputh-vpn:latest .

# 2. Создайте .env.production файл
cp .env.example .env.production
# Заполните все переменные в .env.production

# 3. Запустите контейнер
docker run -d \
  --name skyputh-vpn \
  -p 3001:3001 \
  --env-file .env.production \
  --restart unless-stopped \
  skyputh-vpn:latest
```

## 📋 Особенности Dockerfile

### Multi-Stage Build

- **Stage 1 (builder-frontend)**: Сборка React/Vite frontend
- **Stage 2 (builder-backend)**: Установка production зависимостей
- **Stage 3 (production)**: Финальный легковесный образ (~200MB)

### Оптимизации

- ✅ **Alpine Linux** — минимальный базовый образ (~50MB)
- ✅ **Layer caching** — оптимизация для быстрой пересборки
- ✅ **Production only** — только необходимые зависимости
- ✅ **Непривилегированный пользователь** — безопасность
- ✅ **Graceful shutdown** — корректная остановка через dumb-init

## 📝 Использование

### С Docker Compose

```bash
# 1. Скопируйте пример
cp docker-compose.example.yml docker-compose.yml

# 2. Настройте .env.production
cp .env.example .env.production

# 3. Запустите
docker-compose up -d
```

### Переменные окружения

Обязательные переменные (см. `.env.example`):
- `NODE_ENV=production`
- `XUI_HOST` - адрес панели 3x-ui
- `XUI_USERNAME` - логин администратора 3x-ui
- `XUI_PASSWORD` - пароль администратора 3x-ui
- `PROXY_PORT=3001` - порт backend proxy
- `ALLOWED_ORIGINS` - разрешенные origins для CORS

## 🔍 Проверка

```bash
# Проверка статуса
docker ps | grep skyputh-vpn

# Просмотр логов
docker logs -f skyputh-vpn

# Healthcheck
curl http://localhost:3001/health

# Проверка frontend
curl http://localhost:3001/
```

## 📚 Дополнительная документация

- `DOCKER_GUIDE.md` — подробное руководство
- `docker-compose.example.yml` — пример конфигурации
