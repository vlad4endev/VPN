#!/bin/bash

###############################################################################
# Skypath Flow - Автоматический скрипт обновления и запуска для Ubuntu 22.04
# 
# Этот скрипт:
# 1. Обновляет проект с GitHub (ветка main)
# 2. Сбрасывает локальные изменения при необходимости
# 3. Устанавливает все npm-зависимости
# 4. Запускает frontend и backend в фоне с логированием
#
# Использование:
#   chmod +x deploy-ubuntu.sh
#   ./deploy-ubuntu.sh
###############################################################################

set -e  # Остановка при ошибке
set -u  # Ошибка при использовании неопределенных переменных

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Функция логирования
log() {
    echo -e "${CYAN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Получаем директорию скрипта
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log "🚀 Начало автоматического обновления и запуска Skypath Flow"
echo ""

# Проверка Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js не установлен. Установите Node.js >= 18.0.0"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    log_error "Требуется Node.js >= 18.0.0. Текущая версия: $(node -v)"
    exit 1
fi

log_success "Node.js версия: $(node -v)"

# Проверка npm
if ! command -v npm &> /dev/null; then
    log_error "npm не установлен"
    exit 1
fi

log_success "npm версия: $(npm -v)"

# Проверка git
if ! command -v git &> /dev/null; then
    log_error "git не установлен. Установите: sudo apt-get install git"
    exit 1
fi

log_success "git версия: $(git --version)"

# Проверка, что мы в git репозитории
SKIP_GIT_UPDATE=false
if [ ! -d ".git" ]; then
    log_warning "Директория не является git репозиторием"
    SKIP_GIT_UPDATE=true
else
    # Проверяем, есть ли remote
    if ! git remote -v 2>/dev/null | grep -q "origin"; then
        log_warning "Remote 'origin' не настроен. Пропускаем обновление с GitHub"
        SKIP_GIT_UPDATE=true
    fi
fi

# Обновление с GitHub
if [ "$SKIP_GIT_UPDATE" = false ]; then
    log "📥 Обновление проекта с GitHub (ветка main)..."
    
    # Сохраняем текущую ветку
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
    
    # Переключаемся на main
    if [ "$CURRENT_BRANCH" != "main" ]; then
        log_info "Переключение на ветку main..."
        git checkout main 2>/dev/null || git checkout -b main
    fi
    
    # Сохраняем незакоммиченные изменения (если есть)
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        log_warning "Обнаружены незакоммиченные изменения"
        log_info "Создаем резервную копию изменений..."
        git stash push -m "Auto-stash before deploy $(date +'%Y-%m-%d %H:%M:%S')" || true
    fi
    
    # Получаем последние изменения
    log_info "Получение изменений с GitHub..."
    git fetch origin main || {
        log_error "Не удалось получить изменения с GitHub"
        log_info "Проверьте настройки remote: git remote -v"
        exit 1
    }
    
    # Сбрасываем локальные изменения и применяем изменения с GitHub
    log_info "Применение изменений с GitHub..."
    git reset --hard origin/main || {
        log_error "Не удалось применить изменения с GitHub"
        exit 1
    }
    
    log_success "Проект обновлен с GitHub"
else
    log_warning "Пропуск обновления с GitHub (не настроен remote или не git репозиторий)"
fi

# Остановка существующих процессов
log "🛑 Остановка существующих процессов..."

# Используем stop-all.sh если он существует
if [ -f "stop-all.sh" ]; then
    ./stop-all.sh > /dev/null 2>&1 || true
fi

# Дополнительная очистка процессов
pkill -f "n8n-webhook-proxy.js" 2>/dev/null || true
pkill -f "vite.*5173" 2>/dev/null || true

sleep 2
log_success "Существующие процессы остановлены"

# Установка зависимостей основного проекта
log "📦 Установка зависимостей основного проекта..."
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    npm install
    if [ $? -ne 0 ]; then
        log_error "Ошибка установки зависимостей основного проекта"
        exit 1
    fi
    log_success "Зависимости основного проекта установлены"
else
    log_info "Зависимости основного проекта уже установлены"
fi

# Установка зависимостей backend
log "📦 Установка зависимостей backend..."
cd server
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    npm install
    if [ $? -ne 0 ]; then
        log_error "Ошибка установки зависимостей backend"
        exit 1
    fi
    log_success "Зависимости backend установлены"
else
    log_info "Зависимости backend уже установлены"
fi
cd ..

# Проверка .env файлов
log "🔍 Проверка конфигурации..."
if [ ! -f ".env" ]; then
    log_warning "Файл .env не найден в корне проекта"
    log_info "Создайте файл .env перед запуском"
fi

if [ ! -f "server/.env" ]; then
    log_warning "Файл server/.env не найден"
    log_info "Создайте файл server/.env перед запуском"
fi

# Запуск служб
log "🚀 Запуск служб..."
./start-all.sh

echo ""
log_success "Автоматическое обновление и запуск завершены!"
echo ""
log_info "Полезные команды:"
echo "  ${GREEN}tail -f backend.log${NC}    # Просмотр логов backend"
echo "  ${GREEN}tail -f frontend.log${NC}   # Просмотр логов frontend"
echo "  ${GREEN}./stop-all.sh${NC}          # Остановить все службы"
echo "  ${GREEN}./deploy-ubuntu.sh${NC}    # Повторное обновление и запуск"
echo ""
