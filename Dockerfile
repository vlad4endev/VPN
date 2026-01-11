# ========================================
# 🔐 SECURE DOCKERFILE - НЕ СОДЕРЖИТ СЕКРЕТОВ
# ========================================

# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Копируем package files
COPY package*.json ./
COPY server/package*.json ./server/

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код (БЕЗ .env файлов)
COPY . .

# Собираем frontend
RUN npm run build

# ========================================
# Production stage
# ========================================
FROM node:18-alpine AS production

WORKDIR /app

# Создаем непривилегированного пользователя
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Копируем только необходимые файлы
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/server ./server
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# ⚠️ ВАЖНО: Секреты передаются через:
# 1. Docker Secrets (docker-compose)
# 2. Environment variables при запуске
# 3. Volume mounts для .env файлов (НЕ включать в образ!)

# Переключаемся на непривилегированного пользователя
USER nodejs

# Expose порт
EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Запуск приложения
CMD ["node", "server/proxy-server.js"]
