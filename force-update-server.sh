#!/bin/bash

# Скрипт для ПРИНУДИТЕЛЬНОГО обновления кода на сервере
# Использование: ./force-update-server.sh [путь_к_проекту]

set -e

echo "🔧 ПРИНУДИТЕЛЬНОЕ обновление кода на сервере..."
echo ""

# Определяем путь к проекту
PROJECT_PATH="${1:-/opt/my-frontend}"

if [ ! -d "$PROJECT_PATH" ]; then
    echo "❌ Ошибка: Директория $PROJECT_PATH не найдена!"
    echo "   Использование: $0 [путь_к_проекту]"
    exit 1
fi

cd "$PROJECT_PATH"

echo "📍 Текущая директория: $(pwd)"
echo ""

# Проверяем, что это git репозиторий
if [ ! -d ".git" ]; then
    echo "❌ Ошибка: Это не git репозиторий!"
    exit 1
fi

# Сохраняем текущую ветку
CURRENT_BRANCH=$(git branch --show-current)
echo "🌿 Текущая ветка: $CURRENT_BRANCH"
echo ""

# Показываем текущий коммит
CURRENT_COMMIT=$(git rev-parse HEAD)
echo "📌 Текущий коммит: $CURRENT_COMMIT"
echo ""

# Принудительно сбрасываем все локальные изменения
echo "🔄 Сброс всех локальных изменений..."
git reset --hard HEAD
git clean -fd
echo "✅ Локальные изменения сброшены"
echo ""

# Получаем последние изменения
echo "⬇️  Получение обновлений из GitHub..."
git fetch origin --force

# Принудительно обновляем до последней версии
echo "📥 Принудительное обновление до origin/$CURRENT_BRANCH..."
git reset --hard origin/$CURRENT_BRANCH
echo "✅ Код принудительно обновлен"
echo ""

# Показываем новый коммит
NEW_COMMIT=$(git rev-parse HEAD)
echo "📌 Новый коммит: $NEW_COMMIT"
if [ "$CURRENT_COMMIT" != "$NEW_COMMIT" ]; then
    echo "✅ Код обновлен (было: ${CURRENT_COMMIT:0:7}, стало: ${NEW_COMMIT:0:7})"
else
    echo "ℹ️  Код уже был актуален"
fi
echo ""

# Проверяем, что файл formatDate.js обновлен
if [ -f "src/shared/utils/formatDate.js" ]; then
    echo "🔍 Проверка файла formatDate.js..."
    if grep -q "export const formatTimeRemaining" "src/shared/utils/formatDate.js"; then
        echo "✅ Файл formatDate.js содержит правильный экспорт"
    else
        echo "⚠️  ВНИМАНИЕ: Файл formatDate.js может быть не обновлен!"
        echo "   Содержимое файла:"
        grep -n "formatTimeRemaining" "src/shared/utils/formatDate.js" || echo "   Функция не найдена!"
    fi
else
    echo "❌ ОШИБКА: Файл src/shared/utils/formatDate.js не найден!"
fi
echo ""

# Очищаем кеш Vite АГРЕССИВНО
echo "🧹 АГРЕССИВНАЯ очистка кеша Vite..."
rm -rf node_modules/.vite 2>/dev/null || true
rm -rf .vite 2>/dev/null || true
rm -rf dist 2>/dev/null || true
rm -rf .vite-cache 2>/dev/null || true
find . -type d -name ".vite" -exec rm -rf {} + 2>/dev/null || true
echo "✅ Кеш полностью очищен"
echo ""

# Останавливаем все процессы node/vite
echo "🛑 Остановка всех процессов node/vite..."
pkill -f "vite" 2>/dev/null || true
pkill -f "node.*dev" 2>/dev/null || true
sleep 2
echo "✅ Процессы остановлены"
echo ""

# Проверяем PM2
if command -v pm2 &> /dev/null; then
    PM2_PROCESS=$(pm2 list | grep -E "vpn|frontend|dev" | head -1 | awk '{print $2}' || echo "")
    if [ ! -z "$PM2_PROCESS" ]; then
        echo "🔄 Перезапуск процесса PM2: $PM2_PROCESS"
        pm2 delete $PM2_PROCESS 2>/dev/null || true
        sleep 1
        echo "✅ Процесс PM2 удален"
        echo ""
        echo "📝 Запустите процесс PM2 вручную:"
        echo "   pm2 start npm --name vpn-frontend -- run dev"
    fi
fi

echo ""
echo "✅ ПРИНУДИТЕЛЬНОЕ обновление завершено!"
echo ""
echo "📝 СЛЕДУЮЩИЕ ШАГИ (ВЫПОЛНИТЕ ВРУЧНУЮ):"
echo ""
echo "   1. Запустите dev-сервер:"
echo "      npm run dev"
echo ""
echo "   2. Или если используете PM2:"
echo "      pm2 start npm --name vpn-frontend -- run dev"
echo ""
echo "   3. Проверьте в браузере, что ошибка исчезла"
echo "   4. Очистите кеш браузера (Ctrl+Shift+R или Cmd+Shift+R)"
echo ""
echo "🔍 ДИАГНОСТИКА:"
echo "   Проверьте файл на сервере:"
echo "   cat src/shared/utils/formatDate.js | grep formatTimeRemaining"
echo "   Должна быть строка: export const formatTimeRemaining"
