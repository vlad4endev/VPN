#!/bin/bash

###############################################################################
# Skypath Flow - Скрипт остановки всех служб
#
# Использование:
#   ./stop-all.sh
###############################################################################

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${YELLOW}🛑 Остановка служб Skypath Flow...${NC}"

# Остановка по PID файлам
if [ -f ".backend.pid" ]; then
    BACKEND_PID=$(cat .backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        kill $BACKEND_PID 2>/dev/null || true
        echo -e "${GREEN}✅ Backend остановлен (PID: $BACKEND_PID)${NC}"
    fi
    rm -f .backend.pid
fi

if [ -f ".frontend.pid" ]; then
    FRONTEND_PID=$(cat .frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        kill $FRONTEND_PID 2>/dev/null || true
        echo -e "${GREEN}✅ Frontend (dev) остановлен (PID: $FRONTEND_PID)${NC}"
    fi
    rm -f .frontend.pid
fi

if [ -f ".frontend-preview.pid" ]; then
    PREVIEW_PID=$(cat .frontend-preview.pid)
    if kill -0 $PREVIEW_PID 2>/dev/null; then
        kill $PREVIEW_PID 2>/dev/null || true
        echo -e "${GREEN}✅ Frontend (production) остановлен (PID: $PREVIEW_PID)${NC}"
    fi
    rm -f .frontend-preview.pid
fi

# Остановка по портам
for PORT in 3001 5173 4173; do
    PID=$(lsof -ti:$PORT 2>/dev/null || ss -tlnp 2>/dev/null | grep ":$PORT " | awk '{print $6}' | cut -d',' -f2 | head -1)
    if [ ! -z "$PID" ]; then
        kill -9 $PID 2>/dev/null || true
        echo -e "${GREEN}✅ Процесс на порту $PORT остановлен${NC}"
    fi
done

# Остановка по имени процесса
pkill -f "n8n-webhook-proxy.js" 2>/dev/null && echo -e "${GREEN}✅ Backend процессы остановлены${NC}" || true
pkill -f "vite.*5173" 2>/dev/null && echo -e "${GREEN}✅ Frontend (dev) процессы остановлены${NC}" || true
pkill -f "vite preview" 2>/dev/null && echo -e "${GREEN}✅ Frontend (production) процессы остановлены${NC}" || true

echo -e "${GREEN}✅ Все службы остановлены${NC}"
