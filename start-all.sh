#!/bin/bash

# Скрипт для запуска всех служб проекта SkyPuth VPN
# Использование: ./start-all.sh

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Функция для очистки при выходе (только для ручной остановки через Ctrl+C)
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Остановка служб...${NC}"
    
    # Остановка Backend Proxy
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
        echo -e "${GREEN}✅ Backend Proxy остановлен${NC}"
    fi
    
    # Остановка Frontend
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
        echo -e "${GREEN}✅ Frontend остановлен${NC}"
    fi
    
    # Удаление PID файлов
    rm -f .backend.pid .frontend.pid
    
    exit 0
}

# Установка обработчика сигналов только для ручной остановки (Ctrl+C)
# НЕ используем EXIT, чтобы процессы работали в фоне после завершения скрипта
trap cleanup SIGINT SIGTERM

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

# Проверка занятости портов (совместимо с Ubuntu и macOS)
check_port() {
    PORT=$1
    # Используем netstat (Ubuntu) или ss (современные системы) или lsof (macOS)
    if command -v ss &> /dev/null; then
        if ss -tuln 2>/dev/null | grep -q ":$PORT "; then
            return 0  # Порт занят
        fi
    elif command -v netstat &> /dev/null; then
        if netstat -tuln 2>/dev/null | grep -q ":$PORT "; then
            return 0  # Порт занят
        fi
    elif command -v lsof &> /dev/null; then
        if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
            return 0  # Порт занят
        fi
    fi
    return 1  # Порт свободен
}

# Функция для освобождения порта
free_port() {
    PORT=$1
    if command -v lsof &> /dev/null; then
        PID=$(lsof -ti:$PORT 2>/dev/null)
        if [ ! -z "$PID" ]; then
            kill -9 $PID 2>/dev/null
            return 0
        fi
    elif command -v fuser &> /dev/null; then
        fuser -k $PORT/tcp 2>/dev/null
        return 0
    fi
    return 1
}

if check_port 3001; then
    echo -e "${YELLOW}⚠️  Порт 3001 уже занят. Останавливаю процесс...${NC}"
    free_port 3001
    sleep 2
fi

if check_port 5173; then
    echo -e "${YELLOW}⚠️  Порт 5173 уже занят. Останавливаю процесс...${NC}"
    free_port 5173
    sleep 2
fi

# Запуск n8n Webhook Proxy в фоне
echo ""
echo -e "${GREEN}🚀 Запуск n8n Webhook Proxy сервера...${NC}"
cd server
nohup npm start > ../backend.log 2>&1 &
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

# Запуск Frontend в фоне
echo ""
echo -e "${GREEN}🚀 Запуск Frontend приложения...${NC}"
nohup npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!

# Сохранение PIDs в файл для удобной остановки
echo "$BACKEND_PID" > .backend.pid
echo "$FRONTEND_PID" > .frontend.pid

# Ожидание запуска frontend
echo -e "${BLUE}⏳ Ожидание запуска frontend (5 секунд)...${NC}"
sleep 5

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Все службы запущены в фоне!${NC}"
echo ""
echo -e "${BLUE}📍 Frontend:${NC}    http://0.0.0.0:5173 (или http://YOUR_SERVER_IP:5173)"
echo -e "${BLUE}📍 n8n Webhook Proxy:${NC} http://localhost:3001"
echo -e "${BLUE}📍 n8n:${NC}         http://localhost:5678"
echo ""
echo -e "${BLUE}📊 Просмотр логов:${NC}"
echo -e "   ${GREEN}tail -f backend.log${NC}    # Логи backend"
echo -e "   ${GREEN}tail -f frontend.log${NC}   # Логи frontend"
echo ""
echo -e "${BLUE}🛑 Остановка служб:${NC}"
echo -e "   ${GREEN}./stop-all.sh${NC}          # Остановить все службы"
echo -e "   ${GREEN}kill \$(cat .backend.pid)${NC}   # Остановить только backend"
echo -e "   ${GREEN}kill \$(cat .frontend.pid)${NC}  # Остановить только frontend"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}✅ Процессы запущены в фоне. Можно закрыть SSH сессию.${NC}"
