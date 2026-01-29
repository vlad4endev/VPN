#!/bin/bash

# Скрипт для отката проекта на сервере к коммиту 0c96a83f72aa70d64fa8cdcb27e9554beb234b5b

TARGET_COMMIT="0c96a83f72aa70d64fa8cdcb27e9554beb234b5b"
PROJECT_DIR="${1:-$(pwd)}"

echo "🔄 Откат проекта на сервере к коммиту $TARGET_COMMIT"
echo "📁 Директория проекта: $PROJECT_DIR"
echo ""

# Переходим в директорию проекта
cd "$PROJECT_DIR" || {
    echo "❌ Ошибка: Не удалось перейти в директорию $PROJECT_DIR"
    exit 1
}

# Проверяем, что это git репозиторий
if [ ! -d ".git" ]; then
    echo "❌ Ошибка: Это не git репозиторий!"
    exit 1
fi

# Проверяем текущий коммит
CURRENT_COMMIT=$(git rev-parse HEAD)
echo "📍 Текущий коммит: $CURRENT_COMMIT"

if [ "$CURRENT_COMMIT" = "$TARGET_COMMIT" ]; then
    echo "✅ Проект уже на нужном коммите!"
    exit 0
fi

echo ""
echo "⚠️  ВНИМАНИЕ: Это откатит проект к коммиту $TARGET_COMMIT"
echo "   Все изменения после этого коммита будут удалены!"
echo ""

# Определяем способ развертывания
DEPLOYMENT_TYPE="unknown"
if [ -f "docker-compose.yml" ] || [ -f "docker-compose.yaml" ]; then
    DEPLOYMENT_TYPE="docker"
elif [ -f "package.json" ] && [ -d "server" ]; then
    DEPLOYMENT_TYPE="node"
fi

echo "🔍 Обнаружен тип развертывания: $DEPLOYMENT_TYPE"
echo ""

# Останавливаем сервисы перед откатом
if [ "$DEPLOYMENT_TYPE" = "docker" ]; then
    echo "🐳 Останавливаю Docker контейнеры..."
    docker-compose down 2>/dev/null || echo "   (Docker Compose не запущен или не найден)"
elif [ "$DEPLOYMENT_TYPE" = "node" ]; then
    echo "🛑 Проверяю запущенные процессы..."
    # Проверяем PM2
    if command -v pm2 &> /dev/null; then
        echo "   Останавливаю PM2 процессы..."
        pm2 stop all 2>/dev/null || echo "   (PM2 процессы не найдены)"
    fi
    # Проверяем systemd сервисы
    if systemctl is-active --quiet skypath-flow-backend 2>/dev/null || systemctl is-active --quiet skyputh-vpn-backend 2>/dev/null; then
        echo "   Останавливаю systemd сервисы..."
        sudo systemctl stop skypath-flow-backend 2>/dev/null || true
        sudo systemctl stop skypath-flow-frontend 2>/dev/null || true
        sudo systemctl stop skyputh-vpn-backend 2>/dev/null || true
        sudo systemctl stop skyputh-vpn-frontend 2>/dev/null || true
    fi
fi

echo ""
echo "📥 Получаю последние изменения из репозитория..."
git fetch origin

echo ""
echo "🔄 Выполняю откат к коммиту $TARGET_COMMIT..."
git reset --hard "$TARGET_COMMIT"

echo ""
echo "🧹 Удаляю неотслеживаемые файлы..."
git clean -fd

echo ""
echo "📊 Текущий статус:"
git status

echo ""
echo "✅ Откат завершен!"
echo ""

# Перезапускаем сервисы
if [ "$DEPLOYMENT_TYPE" = "docker" ]; then
    echo "🐳 Перезапускаю Docker контейнеры..."
    read -p "❓ Перезапустить Docker контейнеры? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose up -d --build
        echo "✅ Контейнеры перезапущены!"
    else
        echo "⚠️  Для запуска выполните: docker-compose up -d --build"
    fi
elif [ "$DEPLOYMENT_TYPE" = "node" ]; then
    echo "🔄 Перезапускаю сервисы..."
    read -p "❓ Перезапустить сервисы? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if command -v pm2 &> /dev/null; then
            echo "   Запускаю через PM2..."
            pm2 restart all || pm2 start ecosystem.config.js || echo "   (PM2 конфигурация не найдена)"
        elif systemctl list-units --type=service | grep -q skypath-flow; then
            echo "   Запускаю через systemd (Skypath Flow)..."
            sudo systemctl start skypath-flow-backend 2>/dev/null || true
            sudo systemctl start skypath-flow-frontend 2>/dev/null || true
        elif systemctl list-units --type=service | grep -q skyputh-vpn; then
            echo "   Запускаю через systemd (legacy)..."
            sudo systemctl start skyputh-vpn-backend 2>/dev/null || true
            sudo systemctl start skyputh-vpn-frontend 2>/dev/null || true
        else
            echo "⚠️  Автоматический запуск не настроен. Запустите сервисы вручную."
        fi
    else
        echo "⚠️  Для запуска выполните команды из start-all.sh или используйте PM2/systemd"
    fi
fi

echo ""
echo "✨ Готово! Проект откачен к коммиту $TARGET_COMMIT"
