#!/bin/bash
# Скрипт для исправления деплоя на сервере после конфликта git pull
# Запускать на сервере: cd /opt/my-frontend && bash -c "$(curl -sL https://raw.githubusercontent.com/...)" 
# Или скопировать и запустить локально на сервере

set -e
cd /opt/my-frontend || cd "$(dirname "$0")/.." || true

echo "📥 Получаем последние изменения с main..."
git fetch origin main

echo "📝 Восстанавливаем файлы из main (убираем firebase-алиасы из vite.config.js)..."
git checkout origin/main -- vite.config.js
git checkout origin/main -- package.json package-lock.json
git checkout origin/main -- src/lib/firebase/config.js
git checkout origin/main -- src/features/auth/services/authService.js
git checkout origin/main -- src/features/auth/services/userLanguageService.js
git checkout origin/main -- src/app/hooks/useAppAuth.js

echo "📦 Устанавливаем зависимости..."
npm install

echo "🔨 Сборка..."
npm run build

echo "✅ Готово. Запустите: ./start-all.sh"
