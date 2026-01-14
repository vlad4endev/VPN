# 🐳 Руководство по Docker для SkyPuth VPN

> Полное руководство по сборке и запуску проекта через Docker

---

## 📋 Содержание

1. [Быстрый старт](#быстрый-старт)
2. [Сборка образа](#сборка-образа)
3. [Запуск контейнера](#запуск-контейнера)
4. [Docker Compose](#docker-compose)
5. [Оптимизация](#оптимизация)
6. [Устранение неполадок](#устранение-неполадок)

---

## ⚡ Быстрый старт

### 1. Сборка образа

```bash
docker build -t skyputh-vpn:latest .
```

### 2. Создание .env файла

```bash
cp .env.example .env.production
# Отредактируйте .env.production с реальными значениями
```

### 3. Запуск контейнера

```bash
docker run -d \
  --name skyputh-vpn \
  -p 3001:3001 \
  --env-file .env.production \
  --restart unless-stopped \
  skyputh-vpn:latest
```

### 4. Проверка работоспособности

```bash
# Проверка статуса
docker ps | grep skyputh-vpn

# Проверка логов
docker logs skyputh-vpn

# Healthcheck
curl http://localhost:3001/health
```

---

## 🔨 Сборка образа

### Базовая сборка

```bash
docker build -t skyputh-vpn:latest .
```

### С тегами версий

```bash
docker build -t skyputh-vpn:latest \
  -t skyputh-vpn:1.0.0 \
  -t skyputh-vpn:v1.0.0 .
```

### С кешированием зависимостей

```bash
# Первая сборка
docker build -t skyputh-vpn:latest .

# Последующие сборки будут быстрее благодаря кешу
docker build -t skyputh-vpn:latest .
```

### Оптимизированная сборка (без кеша)

```bash
docker build --no-cache -t skyputh-vpn:latest .
```

---

## 🚀 Запуск контейнера

### Базовый запуск

```bash
docker run -d \
  --name skyputh-vpn \
  -p 3001:3001 \
  --env-file .env.production \
  skyputh-vpn:latest
```

### С переменными окружения

```bash
docker run -d \
  --name skyputh-vpn \
  -p 3001:3001 \
  -e NODE_ENV=production \
  -e XUI_HOST=http://your-server:2053 \
  -e XUI_USERNAME=admin \
  -e XUI_PASSWORD=your_password \
  -e ALLOWED_ORIGINS=https://yourdomain.com \
  skyputh-vpn:latest
```

### С volume для логов (опционально)

```bash
docker run -d \
  --name skyputh-vpn \
  -p 3001:3001 \
  --env-file .env.production \
  -v $(pwd)/logs:/app/logs \
  skyputh-vpn:latest
```

### С ограничениями ресурсов

```bash
docker run -d \
  --name skyputh-vpn \
  -p 3001:3001 \
  --env-file .env.production \
  --memory="512m" \
  --cpus="1.0" \
  skyputh-vpn:latest
```

---

## 🎼 Docker Compose

### 1. Подготовка

```bash
# Скопируйте пример конфигурации
cp docker-compose.example.yml docker-compose.yml

# Создайте .env.production
cp .env.example .env.production
# Отредактируйте .env.production
```

### 2. Запуск

```bash
# Запуск в фоне
docker-compose up -d

# Запуск с просмотром логов
docker-compose up

# Перезапуск
docker-compose restart

# Остановка
docker-compose down
```

### 3. Просмотр логов

```bash
# Все сервисы
docker-compose logs -f

# Только skyputh-vpn
docker-compose logs -f skyputh-vpn

# Последние 100 строк
docker-compose logs --tail=100 skyputh-vpn
```

### 4. Пересборка

```bash
# Пересборка образа
docker-compose build

# Пересборка без кеша
docker-compose build --no-cache

# Пересборка и перезапуск
docker-compose up -d --build
```

---

## 🏗️ Архитектура Dockerfile

### Multi-stage build

Dockerfile использует 3 стадии:

1. **builder-frontend** (Node.js 20 Alpine)
   - Устанавливает зависимости
   - Собирает React/Vite frontend
   - Результат: `dist/` папка

2. **builder-backend** (Node.js 20 Alpine)
   - Устанавливает только production зависимости для backend
   - Результат: `node_modules/` для server/

3. **production** (Node.js 20 Alpine)
   - Копирует собранный frontend
   - Копирует backend код и зависимости
   - Итоговый размер: ~200MB

### Оптимизации

- ✅ **Alpine Linux** — минимальный базовый образ (~50MB)
- ✅ **Multi-stage build** — удаляются dev зависимости
- ✅ **Layer caching** — оптимизация слоев для кеширования
- ✅ **Непривилегированный пользователь** — безопасность
- ✅ **dumb-init** — корректная обработка сигналов
- ✅ **Healthcheck** — автоматическая проверка работоспособности

---

## 📊 Мониторинг

### Просмотр статистики контейнера

```bash
# Использование ресурсов
docker stats skyputh-vpn

# Информация о контейнере
docker inspect skyputh-vpn

# Проверка healthcheck
docker inspect --format='{{.State.Health.Status}}' skyputh-vpn
```

### Логи

```bash
# Последние логи
docker logs skyputh-vpn

# Логи в реальном времени
docker logs -f skyputh-vpn

# Последние 100 строк
docker logs --tail=100 skyputh-vpn

# Логи с временными метками
docker logs -f -t skyputh-vpn
```

---

## 🔒 Безопасность

### ✅ Реализовано

1. **Непривилегированный пользователь**
   - Контейнер запускается от пользователя `nodejs:1001`
   - Нет root доступа

2. **Минимальный образ**
   - Только необходимые пакеты
   - Нет dev инструментов в production

3. **Секреты через переменные**
   - `.env` файл не копируется в образ
   - Секреты передаются через `--env-file` или `-e`

4. **Graceful shutdown**
   - `dumb-init` корректно обрабатывает сигналы
   - Данные сохраняются при остановке

### 🔐 Рекомендации

1. **Используйте Docker secrets** в production:
   ```yaml
   secrets:
     xui_password:
       file: ./secrets/xui_password.txt
   ```

2. **Ограничьте ресурсы**:
   ```bash
   docker run --memory="512m" --cpus="1.0" ...
   ```

3. **Используйте read-only файловую систему**:
   ```bash
   docker run --read-only --tmpfs /tmp ...
   ```

---

## 🔧 Устранение неполадок

### Проблема: Контейнер не запускается

**Решение:**
```bash
# Проверьте логи
docker logs skyputh-vpn

# Проверьте переменные окружения
docker exec skyputh-vpn env | grep -E "(XUI|PROXY|NODE)"

# Проверьте healthcheck
curl http://localhost:3001/health
```

### Проблема: Ошибка "Cannot find module"

**Решение:**
```bash
# Пересоберите образ
docker build --no-cache -t skyputh-vpn:latest .

# Проверьте node_modules
docker exec skyputh-vpn ls -la /app/server/node_modules
```

### Проблема: Frontend не загружается

**Решение:**
```bash
# Проверьте наличие dist папки
docker exec skyputh-vpn ls -la /app/dist

# Проверьте статические файлы
curl http://localhost:3001/
```

### Проблема: Healthcheck не проходит

**Решение:**
```bash
# Проверьте вручную
docker exec skyputh-vpn curl -f http://localhost:3001/health

# Проверьте логи
docker logs skyputh-vpn | grep -i error
```

---

## 📦 Публикация образа

### На Docker Hub

```bash
# Авторизация
docker login

# Тегирование
docker tag skyputh-vpn:latest username/skyputh-vpn:1.0.0
docker tag skyputh-vpn:latest username/skyputh-vpn:latest

# Публикация
docker push username/skyputh-vpn:1.0.0
docker push username/skyputh-vpn:latest
```

### На GitHub Container Registry

```bash
# Авторизация
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Тегирование
docker tag skyputh-vpn:latest ghcr.io/username/skyputh-vpn:1.0.0

# Публикация
docker push ghcr.io/username/skyputh-vpn:1.0.0
```

---

## 🎯 Best Practices

1. **Используйте конкретные теги версий** вместо `latest`
2. **Регулярно обновляйте базовый образ** (Node.js, Alpine)
3. **Мониторьте размер образа** (`docker images | grep skyputh-vpn`)
4. **Используйте .dockerignore** для исключения ненужных файлов
5. **Тестируйте образ локально** перед публикацией
6. **Используйте multi-stage build** для минимального размера
7. **Настройте автообновление** через watchtower или других инструментов

---

**Готово!** Ваш проект готов к запуску через Docker. 🚀
