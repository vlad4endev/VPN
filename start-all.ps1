# ========================================
# 🚀 Скрипт запуска Skypath Flow на Windows
# ========================================
#
# Использование:
#   .\start-all.ps1
#

$ErrorActionPreference = "Continue"

# Цвета для вывода
function Write-Info {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Red
}

# Функция для очистки при выходе
function Cleanup {
    Write-Host ""
    Write-Warning "🛑 Остановка служб..."
    
    if ($null -ne $BackendProcess -and -not $BackendProcess.HasExited) {
        Stop-Process -Id $BackendProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Success "✅ Backend Proxy остановлен"
    }
    
    Write-Success "✅ Frontend остановлен"
    exit 0
}

# Установка обработчика сигналов
$null = Register-EngineEvent PowerShell.Exiting -Action { Cleanup }

Write-Info "🚀 Запуск Skypath Flow"
Write-Host ""

# Проверка Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "❌ Node.js не установлен. Установите Node.js >= 18.0.0"
    Write-Info "Скачайте с https://nodejs.org/"
    exit 1
}

$NodeVersion = node -v
$NodeMajorVersion = [int]($NodeVersion -replace 'v(\d+)\..*', '$1')

if ($NodeMajorVersion -lt 18) {
    Write-Error "❌ Требуется Node.js >= 18.0.0. Текущая версия: $NodeVersion"
    exit 1
}

Write-Success "✅ Node.js версия: $NodeVersion"

# Проверка .env файла
if (-not (Test-Path ".env")) {
    Write-Warning "⚠️  Файл .env не найден. Создайте его перед запуском."
    Write-Info "💡 Скопируйте .env.example в .env и заполните переменные"
    exit 1
}

Write-Success "✅ Файл .env найден"

# Проверка и установка зависимостей основного проекта
if (-not (Test-Path "node_modules")) {
    Write-Info "📦 Установка зависимостей основного проекта..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "❌ Ошибка установки зависимостей основного проекта"
        exit 1
    }
} else {
    Write-Success "✅ Зависимости основного проекта установлены"
}

# Проверка и установка зависимостей Backend Proxy
if (-not (Test-Path "server\node_modules")) {
    Write-Info "📦 Установка зависимостей Backend Proxy..."
    Set-Location server
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "❌ Ошибка установки зависимостей Backend Proxy"
        exit 1
    }
    Set-Location ..
} else {
    Write-Success "✅ Зависимости Backend Proxy установлены"
}

# Проверка занятости портов
function Test-Port {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($connection) {
        Write-Warning "⚠️  Порт $Port уже занят. Останавливаю процесс..."
        $process = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | 
                   Select-Object -ExpandProperty OwningProcess -First 1
        if ($process) {
            Stop-Process -Id $process -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }
    }
}

Test-Port 3001
Test-Port 5173

# Запуск Backend Proxy в фоне
Write-Host ""
Write-Info "🚀 Запуск Backend Proxy сервера..."

$BackendLog = Join-Path $PSScriptRoot "backend.log"
$ServerDir = Join-Path $PSScriptRoot "server"

# Запуск процесса через Start-Process с перенаправлением вывода
# Используем npm start для кроссплатформенности
$BackendProcess = Start-Process -FilePath "npm" `
    -ArgumentList "start" `
    -WorkingDirectory $ServerDir `
    -RedirectStandardOutput $BackendLog `
    -RedirectStandardError $BackendLog `
    -WindowStyle Hidden `
    -PassThru

Write-Success "✅ Backend Proxy запущен (PID: $($BackendProcess.Id))"

# Ожидание запуска Backend Proxy
Write-Info "⏳ Ожидание запуска Backend Proxy (5 секунд)..."
Start-Sleep -Seconds 5

# Проверка работоспособности Backend Proxy
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/vpn/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($response.StatusCode -eq 200) {
        Write-Success "✅ Backend Proxy запущен на http://localhost:3001"
    }
} catch {
    Write-Warning "⚠️  Backend Proxy не отвечает на health check"
    Write-Info "💡 Проверьте логи: Get-Content backend.log -Tail 50 -Wait"
}

# Запуск Frontend
Write-Host ""
Write-Info "🚀 Запуск Frontend приложения..."
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Success "✅ Все службы запущены!"
Write-Host ""
Write-Info "📍 Frontend:    http://127.0.0.1:5173"
Write-Info "📍 Backend Proxy: http://localhost:3001"
Write-Host ""
Write-Info "📊 Проверка Backend Proxy:"
Write-Info "   Invoke-WebRequest http://localhost:3001/api/vpn/health"
Write-Host ""
Write-Info "📋 Логи Backend Proxy:"
Write-Info "   Get-Content backend.log -Tail 50 -Wait"
Write-Host ""
Write-Warning "⚠️  Для остановки нажмите Ctrl+C"
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Запуск Frontend (блокирующий вызов)
try {
    npm run dev
} finally {
    Cleanup
}
