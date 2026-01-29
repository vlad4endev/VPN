# ========================================
# 🐳 OPTIMIZED MULTI-STAGE DOCKERFILE
# Skypath Flow - Production Ready
# ========================================
#
# Build stages:
# 1. builder-frontend - Сборка React/Vite frontend
# 2. builder-backend - Подготовка backend зависимостей
# 3. production - Финальный легковесный образ
#
# Usage:
#   docker build -t skypath-flow:latest .
#   docker run -p 3001:3001 --env-file .env skypath-flow:latest

# ========================================
# STAGE 1: Frontend Build
# ========================================
FROM node:20-alpine AS builder-frontend

# Устанавливаем рабочую директорию
WORKDIR /app

# Устанавливаем зависимости только для сборки
# Используем отдельный слой для package*.json для кеширования
COPY package.json package-lock.json ./

# Устанавливаем зависимости (включая devDependencies для сборки)
RUN npm ci --frozen-lockfile && \
    npm cache clean --force

# Копируем только файлы, необходимые для сборки frontend
COPY vite.config.js tailwind.config.js postcss.config.js ./
COPY index.html ./
COPY src/ ./src/

# Создаем public папку для Vite (опционально)
RUN mkdir -p public

# Собираем frontend для production
RUN npm run build

# Проверяем, что сборка прошла успешно
RUN test -d dist && echo "✅ Frontend build successful" || (echo "❌ Frontend build failed" && exit 1)

# Оптимизация: удаляем исходники после сборки
RUN rm -rf src/ node_modules/

# ========================================
# STAGE 2: Backend Dependencies
# ========================================
FROM node:20-alpine AS builder-backend

WORKDIR /app

# Копируем package.json для backend (server)
COPY server/package.json server/package-lock.json ./server/

# Устанавливаем только production зависимости для backend
WORKDIR /app/server
RUN npm ci --only=production --frozen-lockfile && \
    npm cache clean --force

# ========================================
# STAGE 3: Production Image
# ========================================
FROM node:20-alpine AS production

# Метаданные образа
LABEL maintainer="Skypath Flow"
LABEL description="Skypath Flow - Web application with backend proxy"
LABEL version="1.0.0"

# Устанавливаем рабочую директорию
WORKDIR /app

# Устанавливаем необходимые системные пакеты минимально
# - dumb-init: для корректной обработки сигналов (graceful shutdown)
# - curl: для healthcheck
RUN apk add --no-cache --virtual .runtime-deps \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Создаем непривилегированного пользователя для безопасности
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Копируем собранный frontend из builder-frontend
COPY --from=builder-frontend --chown=nodejs:nodejs /app/dist ./dist

# Копируем backend server код из исходников
COPY --chown=nodejs:nodejs server/ ./server/

# Копируем backend node_modules из builder-backend (заменяем node_modules из исходников)
COPY --from=builder-backend --chown=nodejs:nodejs /app/server/node_modules ./server/node_modules

# ⚠️ ВАЖНО: Секреты НЕ копируются в образ!
# Секреты передаются через:
# 1. Environment variables (docker run -e или --env-file .env)
# 2. Docker secrets (docker-compose)
# 3. Volume mounts (docker run -v /path/to/.env:/app/.env:ro)

# Переключаемся на непривилегированного пользователя
USER nodejs

# Expose порт backend proxy server
EXPOSE 3001

# Healthcheck для проверки работоспособности
# Проверяет endpoint /health каждые 30 секунд
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Используем dumb-init для корректной обработки сигналов
# Это важно для graceful shutdown при docker stop
ENTRYPOINT ["dumb-init", "--"]

# Запуск backend proxy server
# Сервер автоматически будет обслуживать статические файлы из ./dist
CMD ["node", "server/proxy-server.js"]

# ========================================
# 🔐 БЕЗОПАСНОСТЬ
# ========================================
# - ✅ Непривилегированный пользователь (nodejs:1001)
# - ✅ Минимальный базовый образ (alpine ~50MB)
# - ✅ Только production зависимости
# - ✅ Секреты передаются через environment variables
# - ✅ Multi-stage build для минимального размера (~200MB вместо ~1GB)
# - ✅ Graceful shutdown через dumb-init
# ========================================
