#!/usr/bin/env node
/**
 * Тестовый скрипт для проверки кроссплатформенности
 * Проверяет пути, переменные окружения, и базовую функциональность
 */

import { existsSync, readFileSync } from 'fs'
import { join, dirname, sep } from 'path'
import { fileURLToPath } from 'url'
import process from 'process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

let allOk = true

function check(condition, message, errorMessage) {
  if (condition) {
    log(`✅ ${message}`, 'green')
    return true
  } else {
    log(`❌ ${errorMessage || message}`, 'red')
    allOk = false
    return false
  }
}

log('\n' + '='.repeat(60), 'cyan')
log('🧪 Проверка кроссплатформенности', 'cyan')
log('='.repeat(60), 'cyan')

// 1. Проверка платформы
log('\n📱 Информация о платформе:', 'cyan')
log(`   OS: ${process.platform}`, 'cyan')
log(`   Node.js: ${process.version}`, 'cyan')
log(`   Разделитель пути: "${sep}"`, 'cyan')

// 2. Проверка использования path.join
log('\n📁 Проверка путей:', 'cyan')
const serverDir = join(projectRoot, 'server')
const distDir = join(projectRoot, 'dist')
const envFile = join(projectRoot, '.env')
const serverEnvFile = join(serverDir, '.env')

check(
  existsSync(serverDir),
  `Директория server существует: ${serverDir}`,
  `Директория server не найдена: ${serverDir}`
)

check(
  existsSync(envFile) || existsSync(join(projectRoot, '.env.example')),
  `Файл .env или .env.example существует`,
  `Файл .env не найден в корне проекта`
)

check(
  existsSync(serverEnvFile) || existsSync(join(serverDir, '.env.example')),
  `Файл server/.env или server/.env.example существует`,
  `Файл server/.env не найден`
)

// 3. Проверка package.json скриптов
log('\n📦 Проверка package.json:', 'cyan')
try {
  const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'))
  
  check(
    packageJson.scripts.dev && packageJson.scripts.dev.includes('127.0.0.1'),
    `Скрипт dev использует host 127.0.0.1`,
    `Скрипт dev должен использовать --host 127.0.0.1`
  )
  
  check(
    packageJson.scripts.dev && packageJson.scripts.dev.includes('5173'),
    `Скрипт dev использует порт 5173`,
    `Скрипт dev должен использовать --port 5173`
  )
  
  check(
    packageJson.scripts['start:all'],
    `Скрипт start:all существует`,
    `Скрипт start:all не найден`
  )
  
  check(
    packageJson.scripts['setup:env'],
    `Скрипт setup:env существует`,
    `Скрипт setup:env не найден`
  )
} catch (err) {
  check(false, `Ошибка чтения package.json: ${err.message}`)
}

// 4. Проверка server/package.json
log('\n📦 Проверка server/package.json:', 'cyan')
try {
  const serverPackageJson = JSON.parse(readFileSync(join(serverDir, 'package.json'), 'utf-8'))
  
  check(
    serverPackageJson.scripts.start,
    `Скрипт start существует в server/package.json`,
    `Скрипт start не найден в server/package.json`
  )
  
  check(
    serverPackageJson.scripts.start.includes('n8n-webhook-proxy.js'),
    `Скрипт start запускает n8n-webhook-proxy.js`,
    `Скрипт start должен запускать n8n-webhook-proxy.js`
  )
} catch (err) {
  check(false, `Ошибка чтения server/package.json: ${err.message}`)
}

// 5. Проверка vite.config.js
log('\n⚙️  Проверка vite.config.js:', 'cyan')
try {
  const viteConfig = readFileSync(join(projectRoot, 'vite.config.js'), 'utf-8')
  
  check(
    viteConfig.includes("host: '127.0.0.1'") || viteConfig.includes('host: "127.0.0.1"'),
    `Vite config использует host 127.0.0.1`,
    `Vite config должен использовать host: '127.0.0.1'`
  )
  
  check(
    viteConfig.includes("port: 5173"),
    `Vite config использует порт 5173`,
    `Vite config должен использовать port: 5173`
  )
} catch (err) {
  check(false, `Ошибка чтения vite.config.js: ${err.message}`)
}

// 6. Проверка скриптов запуска
log('\n🚀 Проверка скриптов запуска:', 'cyan')
const scripts = [
  { name: 'start-all.sh', path: join(projectRoot, 'start-all.sh') },
  { name: 'start-all.ps1', path: join(projectRoot, 'start-all.ps1') },
  { name: 'start-all.bat', path: join(projectRoot, 'start-all.bat') },
  { name: 'scripts/start-all.js', path: join(projectRoot, 'scripts', 'start-all.js') },
]

scripts.forEach(script => {
  check(
    existsSync(script.path),
    `Скрипт ${script.name} существует`,
    `Скрипт ${script.name} не найден`
  )
})

// 7. Проверка setup-env.js
log('\n🔧 Проверка setup-env.js:', 'cyan')
const setupEnvPath = join(projectRoot, 'setup-env.js')
check(
  existsSync(setupEnvPath),
  `Скрипт setup-env.js существует`,
  `Скрипт setup-env.js не найден`
)

// 8. Проверка использования path.join в критических файлах
log('\n🔍 Проверка использования path.join:', 'cyan')
try {
  const n8nProxy = readFileSync(join(serverDir, 'n8n-webhook-proxy.js'), 'utf-8')
  // Проверяем, что используются относительные пути, а не абсолютные
  const hasAbsolutePaths = /['"]\/[^'"]*server|['"]\/[^'"]*dist|['"]C:\\|['"]\/Users/.test(n8nProxy)
  check(
    !hasAbsolutePaths,
    `n8n-webhook-proxy.js не содержит абсолютных путей`,
    `n8n-webhook-proxy.js содержит абсолютные пути (должны быть относительные)`
  )
} catch (err) {
  log(`⚠️  Не удалось проверить n8n-webhook-proxy.js: ${err.message}`, 'yellow')
}

// Итоговый результат
log('\n' + '='.repeat(60), 'cyan')
if (allOk) {
  log('✅ Все проверки пройдены! Проект готов к кроссплатформенной работе.', 'green')
  log('\n📋 Следующие шаги:', 'cyan')
  log('   1. Запустите: npm run setup:env', 'cyan')
  log('   2. Заполните переменные в .env и server/.env', 'cyan')
  log('   3. Запустите: npm run start:all', 'cyan')
  process.exit(0)
} else {
  log('⚠️  Обнаружены проблемы. Исправьте их перед использованием.', 'yellow')
  process.exit(1)
}
