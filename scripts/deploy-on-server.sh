#!/bin/bash
# ========================================
# Деплой Skyputh VPN на сервер (запускать по SSH)
# ========================================
set -e

REPO_URL="${REPO_URL:-https://github.com/vlad4endev/VPN.git}"
APP_DIR="${APP_DIR:-$HOME/skyputh-vpn}"

echo "📁 Директория проекта: $APP_DIR"
echo ""

# Клонирование или обновление
if [ ! -d "$APP_DIR" ]; then
  echo "📥 Клонирую репозиторий..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
else
  echo "🔄 Обновляю репозиторий..."
  cd "$APP_DIR"
  git pull origin main || git pull || true
fi

# Проверка Docker
if ! command -v docker &>/dev/null; then
  echo "❌ Docker не установлен. Установите: https://docs.docker.com/engine/install/"
  exit 1
fi
if ! docker compose version &>/dev/null && ! docker-compose version &>/dev/null; then
  echo "❌ Docker Compose не найден. Установите docker-compose."
  exit 1
fi

# .env.production
if [ ! -f .env.production ]; then
  echo "📝 Создаю .env.production из server/.env.example..."
  cp server/.env.example .env.production
  # Для продакшена сразу выставим NODE_ENV
  sed -i.bak 's/NODE_ENV=development/NODE_ENV=production/' .env.production 2>/dev/null || \
    sed -i '' 's/NODE_ENV=development/NODE_ENV=production/' .env.production 2>/dev/null || true
  echo ""
  echo "⚠️  ОБЯЗАТЕЛЬНО отредактируй .env.production и укажи:"
  echo "   - XUI_HOST, XUI_USERNAME, XUI_PASSWORD (панель 3x-ui)"
  echo "   - FIREBASE_PROJECT_ID и ключ Firebase (или FIREBASE_SERVICE_ACCOUNT_PATH)"
  echo "   - ALLOWED_ORIGINS и FRONTEND_URL (твой домен или IP)"
  echo ""
  echo "   Команда: nano .env.production"
  echo ""
  read -p "Отредактировал .env.production? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Сделай правки и запусти скрипт снова."
    exit 0
  fi
else
  echo "✅ .env.production уже есть"
fi

chmod 600 .env.production 2>/dev/null || true

# Сборка и запуск
echo ""
echo "🐳 Сборка и запуск контейнера..."
if docker compose version &>/dev/null; then
  docker compose up -d --build
else
  docker-compose up -d --build
fi

echo ""
echo "✅ Готово. Проверка:"
echo "   docker compose ps"
echo "   curl http://localhost:3001/health"
echo ""
echo "   Приложение: http://$(hostname -I 2>/dev/null | awk '{print $1}'):3001"
echo "   (или твой домен, если настроен Nginx)"
echo ""
