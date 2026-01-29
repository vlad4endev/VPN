#!/usr/bin/env node
/**
 * Универсальный скрипт для запуска frontend и backend
 * Работает на всех платформах (Mac, Windows, Linux)
 * 
 * Использование:
 *   npm run start:all
 *   node scripts/start-all.js
 */

import { spawn } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import process from 'process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')
const serverDir = join(projectRoot, 'server')

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// Хранение процессов
let backendProcess = null
let frontendProcess = null

// Обработка завершения
function cleanup() {
  log('\n🛑 Остановка служб...', 'yellow')
  
  if (backendProcess) {
    log('Остановка Backend...', 'cyan')
    backendProcess.kill('SIGTERM')
    backendProcess = null
  }
  
  if (frontendProcess) {
    log('Остановка Frontend...', 'cyan')
    frontendProcess.kill('SIGTERM')
    frontendProcess = null
  }
  
  log('✅ Все службы остановлены', 'green')
  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
process.on('exit', cleanup)

// Проверка Node.js
const nodeVersion = process.version
const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0])

if (nodeMajor < 18) {
  log(`❌ Требуется Node.js >= 18.0.0. Текущая версия: ${nodeVersion}`, 'red')
  process.exit(1)
}

log(`✅ Node.js версия: ${nodeVersion}`, 'green')

// Проверка .env файлов
import { existsSync } from 'fs'

const frontendEnv = join(projectRoot, '.env')
const backendEnv = join(serverDir, '.env')

if (!existsSync(frontendEnv)) {
  log(`⚠️  Файл .env не найден в корне проекта`, 'yellow')
  log(`💡 Запустите: npm run setup:env`, 'blue')
}

if (!existsSync(backendEnv)) {
  log(`⚠️  Файл server/.env не найден`, 'yellow')
  log(`💡 Запустите: npm run setup:env`, 'blue')
}

// Функция запуска backend
function startBackend() {
  return new Promise((resolve, reject) => {
    log('\n🚀 Запуск Backend сервера...', 'cyan')
    
    const isWindows = process.platform === 'win32'
    const npmCmd = isWindows ? 'npm.cmd' : 'npm'
    
    backendProcess = spawn(npmCmd, ['start'], {
      cwd: serverDir,
      stdio: 'inherit',
      shell: false,
    })

    backendProcess.on('error', (err) => {
      log(`❌ Ошибка запуска Backend: ${err.message}`, 'red')
      reject(err)
    })

    backendProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        log(`❌ Backend завершился с кодом: ${code}`, 'red')
        if (!frontendProcess) {
          process.exit(code)
        }
      }
    })

    // Даем время на запуск
    setTimeout(() => {
      log('✅ Backend запущен на http://localhost:3001', 'green')
      resolve()
    }, 3000)
  })
}

// Функция запуска frontend
function startFrontend() {
  log('\n🚀 Запуск Frontend приложения...', 'cyan')
  
  const isWindows = process.platform === 'win32'
  const npmCmd = isWindows ? 'npm.cmd' : 'npm'
  
  frontendProcess = spawn(npmCmd, ['run', 'dev'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
  })

  frontendProcess.on('error', (err) => {
    log(`❌ Ошибка запуска Frontend: ${err.message}`, 'red')
    cleanup()
    process.exit(1)
  })

  frontendProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      log(`❌ Frontend завершился с кодом: ${code}`, 'red')
      cleanup()
      process.exit(code)
    }
  })

  log('✅ Frontend запущен на http://127.0.0.1:5173', 'green')
}

// Основная функция
async function main() {
  log('\n' + '='.repeat(60), 'cyan')
  log('🚀 Запуск SKYPATH FLOW', 'cyan')
  log('='.repeat(60), 'cyan')

  try {
    // Запускаем backend
    await startBackend()
    
    // Запускаем frontend
    startFrontend()
    
    log('\n' + '='.repeat(60), 'cyan')
    log('✅ Все службы запущены!', 'green')
    log('='.repeat(60), 'cyan')
    log('\n📍 Frontend:    http://127.0.0.1:5173', 'blue')
    log('📍 Backend:     http://localhost:3001', 'blue')
    log('\n⚠️  Для остановки нажмите Ctrl+C', 'yellow')
    log('='.repeat(60) + '\n', 'cyan')
    
  } catch (err) {
    log(`\n❌ Ошибка запуска: ${err.message}`, 'red')
    cleanup()
    process.exit(1)
  }
}

// Запуск
main()
