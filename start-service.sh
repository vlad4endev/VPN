#!/bin/bash

# Скрипт для запуска SkyPuth VPN сервиса
# Использование: ./start-service.sh [dev|prod]

cd "$(dirname "$0")"

# Цвета
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 Запуск SkyPuth VPN${NC}"
echo ""

# Остановка старых процессов
echo -e "${YELLOW}🛑 Остановка старых процессов...${NC}"
pkill -f "node.*proxy-server" 2>/dev/null
pkill -f "vite" 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
sleep 2

# Проверка .env
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ Файл .env не найден!${NC}"
    echo -e "${YELLOW}💡 Создайте .env из .env.example и заполните переменные${NC}"
    exit 1
fi

# Проверка зависимостей
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Установка зависимостей...${NC}"
    npm install
fi

# Определение режима
MODE=${1:-dev}

if [ "$MODE" = "prod" ] || [ "$MODE" = "production" ]; then
    echo -e "${GREEN}🔨 Production режим${NC}"
    
    # Проверка backend зависимостей
    if [ ! -d "server/node_modules" ]; then
        echo -e "${YELLOW}📦 Установка backend зависимостей...${NC}"
        cd server && npm install && cd ..
    fi
    
    # Сборка frontend
    if [ ! -d "dist" ] || [ -z "$(ls -A dist)" ]; then
        echo -e "${YELLOW}🔨 Сборка frontend...${NC}"
        npm run build
    fi
    
    echo -e "${GREEN}🚀 Запуск production сервера на http://localhost:3001${NC}"
    echo ""
    npm start
    
elif [ "$MODE" = "dev" ] || [ "$MODE" = "development" ]; then
    echo -e "${GREEN}💻 Development режим${NC}"
    echo -e "${GREEN}🚀 Запуск dev сервера на http://localhost:5173${NC}"
    echo ""
    npm run dev
    
else
    echo -e "${RED}❌ Неверный режим: $MODE${NC}"
    echo -e "${YELLOW}Использование: ./start-service.sh [dev|prod]${NC}"
    exit 1
fi
