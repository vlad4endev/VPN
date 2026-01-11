#!/bin/bash

# Скрипт для запуска всех служб проекта SkyPuth VPN
# Использование: ./start-all.sh

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Функция для очистки при выходе
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Остановка служб...${NC}"
    
    # Остановка Backend Proxy
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
        echo -e "${GREEN}✅ Backend Proxy остановлен${NC}"
    fi
    
    # Остановка Frontend (будет остановлен вместе с этим скриптом)
    echo -e "${GREEN}✅ Frontend остановлен${NC}"
    
    exit 0
}

# Установка обработчика сигналов
trap cleanup SIGINT SIGTERM EXIT

echo -e "${BLUE}🚀 Запуск SkyPuth VPN${NC}"
echo ""

# Проверка Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js не установлен. Установите Node.js >= 18.0.0${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Требуется Node.js >= 18.0.0. Текущая версия: $(node -v)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js версия: $(node -v)${NC}"

# Проверка .env файла
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  Файл .env не найден. Создайте его перед запуском.${NC}"
    echo -e "${BLUE}💡 См. пример в КОМАНДЫ_ЗАПУСКА.md${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Файл .env найден${NC}"

# Проверка и установка зависимостей основного проекта
if [ ! -d "node_modules" ]; then
    echo -e "${GREEN}📦 Установка зависимостей основного проекта...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Ошибка установки зависимостей основного проекта${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Зависимости основного проекта установлены${NC}"
fi

# Проверка и установка зависимостей Backend Proxy
if [ ! -d "server/node_modules" ]; then
    echo -e "${GREEN}📦 Установка зависимостей Backend Proxy...${NC}"
    cd server
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Ошибка установки зависимостей Backend Proxy${NC}"
        exit 1
    fi
    cd ..
else
    echo -e "${GREEN}✅ Зависимости Backend Proxy установлены${NC}"
fi

# Проверка занятости портов
check_port() {
    PORT=$1
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        return 0  # Порт занят
    else
        return 1  # Порт свободен
    fi
}

if check_port 3001; then
    echo -e "${YELLOW}⚠️  Порт 3001 уже занят. Останавливаю процесс...${NC}"
    kill -9 $(lsof -ti:3001) 2>/dev/null
    sleep 2
fi

if check_port 5173; then
    echo -e "${YELLOW}⚠️  Порт 5173 уже занят. Останавливаю процесс...${NC}"
    kill -9 $(lsof -ti:5173) 2>/dev/null
    sleep 2
fi

# Запуск n8n Webhook Proxy в фоне
echo ""
echo -e "${GREEN}🚀 Запуск n8n Webhook Proxy сервера...${NC}"
cd server
npm start > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Ожидание запуска n8n Webhook Proxy
echo -e "${BLUE}⏳ Ожидание запуска n8n Webhook Proxy (5 секунд)...${NC}"
sleep 5

# Проверка работоспособности n8n Webhook Proxy
if curl -s http://localhost:3001/api/vpn/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ n8n Webhook Proxy запущен на http://localhost:3001${NC}"
else
    echo -e "${YELLOW}⚠️  n8n Webhook Proxy не отвечает на health check${NC}"
    echo -e "${BLUE}💡 Проверьте логи: tail -f backend.log${NC}"
    echo -e "${BLUE}💡 Убедитесь, что n8n запущен на http://localhost:5678${NC}"
fi

# Запуск Frontend
echo ""
echo -e "${GREEN}🚀 Запуск Frontend приложения...${NC}"
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Все службы запущены!${NC}"
echo ""
echo -e "${BLUE}📍 Frontend:${NC}    http://localhost:5173"
echo -e "${BLUE}📍 n8n Webhook Proxy:${NC} http://localhost:3001"
echo -e "${BLUE}📍 n8n:${NC}         http://localhost:5678"
echo ""
echo -e "${BLUE}📊 Проверка n8n Webhook Proxy:${NC}"
echo -e "   curl http://localhost:3001/api/vpn/health"
echo ""
echo -e "${BLUE}📋 Логи n8n Webhook Proxy:${NC}"
echo -e "   tail -f backend.log"
echo ""
echo -e "${YELLOW}⚠️  Для остановки нажмите Ctrl+C${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Запуск Frontend (блокирующий вызов)
npm run dev
