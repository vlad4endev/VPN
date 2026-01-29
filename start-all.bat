@echo off
REM ========================================
REM 🚀 Скрипт запуска Skypath Flow на Windows
REM ========================================
REM 
REM Использование:
REM   start-all.bat
REM

setlocal enabledelayedexpansion

echo.
echo 🚀 Запуск Skypath Flow
echo.

REM Проверка Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js не установлен. Установите Node.js ^>= 18.0.0
    echo Скачайте с https://nodejs.org/
    pause
    exit /b 1
)

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js не установлен
    pause
    exit /b 1
)

echo ✅ Node.js найден
node -v

REM Проверка .env файла
if not exist ".env" (
    echo.
    echo ⚠️  Файл .env не найден. Создайте его перед запуском.
    echo 💡 Скопируйте .env.example в .env и заполните переменные
    pause
    exit /b 1
)

echo ✅ Файл .env найден

REM Проверка зависимостей
if not exist "node_modules" (
    echo.
    echo 📦 Установка зависимостей основного проекта...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ Ошибка установки зависимостей
        pause
        exit /b 1
    )
) else (
    echo ✅ Зависимости основного проекта установлены
)

if not exist "server\node_modules" (
    echo.
    echo 📦 Установка зависимостей Backend Proxy...
    cd server
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ Ошибка установки зависимостей Backend Proxy
        pause
        exit /b 1
    )
    cd ..
) else (
    echo ✅ Зависимости Backend Proxy установлены
)

REM Остановка процессов на портах (если заняты)
echo.
echo 🔍 Проверка портов...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do (
    echo ⚠️  Порт 3001 занят. Останавливаю процесс...
    taskkill /F /PID %%a >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do (
    echo ⚠️  Порт 5173 занят. Останавливаю процесс...
    taskkill /F /PID %%a >nul 2>&1
)

REM Запуск Backend Proxy в фоне
echo.
echo 🚀 Запуск Backend Proxy сервера...
cd server
start "Skypath Flow Backend" /MIN cmd /c "npm start > ..\backend.log 2>&1"
cd ..
timeout /t 5 /nobreak >nul

REM Проверка работоспособности
curl -s http://localhost:3001/api/vpn/health >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Backend Proxy запущен на http://localhost:3001
) else (
    echo ⚠️  Backend Proxy не отвечает на health check
    echo 💡 Проверьте логи: type backend.log
)

REM Запуск Frontend
echo.
echo 🚀 Запуск Frontend приложения...
echo.
echo ════════════════════════════════════════════════════════════
echo ✅ Все службы запущены!
echo.
echo 📍 Frontend:    http://127.0.0.1:5173
echo 📍 Backend Proxy: http://localhost:3001
echo.
echo ⚠️  Для остановки закройте это окно
echo ════════════════════════════════════════════════════════════
echo.

REM Запуск Frontend (блокирующий вызов)
call npm run dev

REM Очистка при выходе
echo.
echo 🛑 Остановка служб...
for /f "tokens=2" %%a in ('tasklist ^| findstr node.exe') do (
    taskkill /F /PID %%a >nul 2>&1
)

pause
