# ========================================
# 🪟 Скрипт установки SkyPuth VPN на Windows
# ========================================
#
# Этот скрипт автоматически устанавливает все необходимые зависимости
# и настраивает проект для запуска на Windows
#
# Использование:
#   .\install-windows.ps1
#
# Если получаете ошибку "execution of scripts is disabled", выполните:
#   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
#

param(
    [switch]$SkipNodeCheck
)

$ErrorActionPreference = "Stop"

# Цвета для вывода
function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🚀 Установка SkyPuth VPN на Windows" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Определяем директорию проекта
$ProjectDir = $PSScriptRoot
Set-Location $ProjectDir

Write-Info "Директория проекта: $ProjectDir"

# ========================================
# Шаг 1: Проверка PowerShell версии
# ========================================
Write-Host ""
Write-Info "Шаг 1: Проверка PowerShell версии..."

$PSVersion = $PSVersionTable.PSVersion.Major
if ($PSVersion -lt 5) {
    Write-Error "Требуется PowerShell 5.0 или выше. Текущая версия: $PSVersion"
    exit 1
}

Write-Success "PowerShell версия: $PSVersion"

# ========================================
# Шаг 2: Установка Node.js
# ========================================
Write-Host ""
Write-Info "Шаг 2: Проверка Node.js..."

if (-not $SkipNodeCheck) {
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $NodeVersion = node -v
        $NodeMajorVersion = [int]($NodeVersion -replace 'v(\d+)\..*', '$1')
        
        if ($NodeMajorVersion -ge 18) {
            Write-Success "Node.js уже установлен: $NodeVersion"
        } else {
            Write-Warning "Node.js версии $NodeVersion устарел. Требуется >= 18.0.0"
            Write-Info "Пожалуйста, установите Node.js 20.x вручную:"
            Write-Info "  https://nodejs.org/"
            Write-Info "Или используйте winget: winget install OpenJS.NodeJS.LTS"
            $continue = Read-Host "Продолжить установку? (y/n)"
            if ($continue -ne "y") {
                exit 1
            }
        }
    } else {
        Write-Warning "Node.js не найден"
        Write-Info "Пожалуйста, установите Node.js 20.x:"
        Write-Info "  https://nodejs.org/"
        Write-Info "Или используйте winget: winget install OpenJS.NodeJS.LTS"
        $continue = Read-Host "Продолжить установку? (y/n)"
        if ($continue -ne "y") {
            exit 1
        }
    }
} else {
    Write-Info "Проверка Node.js пропущена"
}

# Проверка npm
if (Get-Command npm -ErrorAction SilentlyContinue) {
    $NpmVersion = npm -v
    Write-Success "npm установлен: $NpmVersion"
} else {
    Write-Error "npm не найден. Установите Node.js, который включает npm"
    exit 1
}

# ========================================
# Шаг 3: Установка Git (опционально)
# ========================================
Write-Host ""
Write-Info "Шаг 3: Проверка Git..."

if (Get-Command git -ErrorAction SilentlyContinue) {
    $GitVersion = git --version
    Write-Success "Git установлен: $GitVersion"
} else {
    Write-Warning "Git не найден (опционально, но рекомендуется)"
    Write-Info "Установите Git: https://git-scm.com/download/win"
    Write-Info "Или используйте winget: winget install Git.Git"
}

# ========================================
# Шаг 4: Установка PM2 (опционально)
# ========================================
Write-Host ""
Write-Info "Шаг 4: Установка PM2 (для управления процессами)..."

if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    $Pm2Version = pm2 -v
    Write-Success "PM2 уже установлен: $Pm2Version"
} else {
    Write-Info "Установка PM2 глобально..."
    try {
        npm install -g pm2
        Write-Success "PM2 установлен"
    } catch {
        Write-Warning "Не удалось установить PM2. Продолжаем без него..."
    }
}

# ========================================
# Шаг 5: Установка зависимостей проекта
# ========================================
Write-Host ""
Write-Info "Шаг 5: Установка зависимостей проекта..."

# Установка зависимостей основного проекта
if (-not (Test-Path "node_modules")) {
    Write-Info "Установка зависимостей frontend..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Ошибка установки зависимостей frontend"
        exit 1
    }
    Write-Success "Зависимости frontend установлены"
} else {
    Write-Info "Обновление зависимостей frontend..."
    npm install
    Write-Success "Зависимости frontend обновлены"
}

# Установка зависимостей backend
if (-not (Test-Path "server\node_modules")) {
    Write-Info "Установка зависимостей backend..."
    Set-Location server
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Ошибка установки зависимостей backend"
        exit 1
    }
    Set-Location ..
    Write-Success "Зависимости backend установлены"
} else {
    Write-Info "Обновление зависимостей backend..."
    Set-Location server
    npm install
    Set-Location ..
    Write-Success "Зависимости backend обновлены"
}

# ========================================
# Шаг 6: Создание .env файла
# ========================================
Write-Host ""
Write-Info "Шаг 6: Настройка переменных окружения..."

if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Write-Info "Создание .env из .env.example..."
        Copy-Item ".env.example" ".env"
        Write-Success "Файл .env создан"
        Write-Warning "⚠️  ВАЖНО: Отредактируйте файл .env и заполните все переменные!"
        Write-Info "   notepad .env"
    } else {
        Write-Warning "Файл .env.example не найден. Создайте .env вручную."
    }
} else {
    Write-Success "Файл .env уже существует"
}

# ========================================
# Шаг 7: Проверка портов
# ========================================
Write-Host ""
Write-Info "Шаг 7: Проверка портов..."

function Test-Port {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $connection
}

if (Test-Port 3001) {
    Write-Warning "Порт 3001 уже занят. Возможно, приложение уже запущено."
} else {
    Write-Success "Порт 3001 свободен"
}

if (Test-Port 5173) {
    Write-Warning "Порт 5173 уже занят. Возможно, dev сервер уже запущен."
} else {
    Write-Success "Порт 5173 свободен"
}

# ========================================
# Финальная информация
# ========================================
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Success "Установка завершена успешно!"
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Следующие шаги:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Настройте переменные окружения:" -ForegroundColor Yellow
Write-Host "   notepad .env" -ForegroundColor Green
Write-Host ""
Write-Host "2. Проверьте конфигурацию:" -ForegroundColor Yellow
Write-Host "   node check-env.js" -ForegroundColor Green
Write-Host ""
Write-Host "3. Запустите приложение:" -ForegroundColor Yellow
Write-Host "   .\start-all.ps1" -ForegroundColor Green
Write-Host "   Или: .\start-all.bat" -ForegroundColor Green
Write-Host ""
Write-Host "   Или вручную:" -ForegroundColor Yellow
Write-Host "   cd server && npm start" -ForegroundColor Green
Write-Host "   npm run dev" -ForegroundColor Green
Write-Host ""
Write-Host "4. Для production сборки:" -ForegroundColor Yellow
Write-Host "   npm run build" -ForegroundColor Green
Write-Host "   npm start" -ForegroundColor Green
Write-Host ""
Write-Host "📚 Документация:" -ForegroundColor Cyan
Write-Host "   - WINDOWS_DEPLOY.md - Подробная инструкция по развертыванию" -ForegroundColor Green
Write-Host "   - WINDOWS_QUICK_START.md - Быстрый старт" -ForegroundColor Green
Write-Host "   - README.md - Основная документация" -ForegroundColor Green
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
