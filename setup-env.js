#!/usr/bin/env node
/**
 * Универсальный скрипт для проверки и настройки .env файлов
 * Работает на всех платформах (Mac, Windows, Linux)
 * 
 * Использование:
 *   node setup-env.js
 *   node setup-env.js --fix
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const FIX_MODE = process.argv.includes('--fix') || process.argv.includes('-f')

// Цвета для консоли (кроссплатформенные)
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

/**
 * Нормализует переносы строк в файле (приводит к LF)
 */
function normalizeLineEndings(content) {
  // Заменяем все варианты переносов строк на LF
  return content
    .replace(/\r\n/g, '\n')  // Windows (CRLF)
    .replace(/\r/g, '\n')     // Old Mac (CR)
    .replace(/\n{3,}/g, '\n\n') // Убираем множественные пустые строки
}

/**
 * Проверяет и исправляет .env файл
 */
function checkEnvFile(envPath, examplePath, requiredVars, description) {
  log(`\n${'='.repeat(60)}`, 'cyan')
  log(`📋 Проверка ${description}`, 'cyan')
  log(`${'='.repeat(60)}`, 'cyan')

  let needsFix = false
  let content = ''
  let fileExists = existsSync(envPath)

  if (!fileExists) {
    log(`❌ Файл ${envPath} не найден`, 'red')
    
    if (existsSync(examplePath)) {
      log(`📝 Создание ${envPath} из ${examplePath}...`, 'yellow')
      try {
        copyFileSync(examplePath, envPath)
        log(`✅ Файл ${envPath} создан`, 'green')
        fileExists = true
      } catch (err) {
        log(`❌ Ошибка создания файла: ${err.message}`, 'red')
        return false
      }
    } else {
      log(`⚠️  Файл ${examplePath} также не найден`, 'yellow')
      log(`💡 Создайте ${envPath} вручную`, 'blue')
      return false
    }
  }

  if (fileExists) {
    try {
      content = readFileSync(envPath, 'utf-8')
      
      // Проверяем переносы строк
      const hasCRLF = content.includes('\r\n')
      const hasCR = content.includes('\r') && !content.includes('\n')
      
      if (hasCRLF || hasCR) {
        log(`⚠️  Обнаружены некорректные переносы строк (${hasCRLF ? 'CRLF' : 'CR'})`, 'yellow')
        needsFix = true
        
        if (FIX_MODE) {
          content = normalizeLineEndings(content)
          log(`🔧 Исправление переносов строк на LF...`, 'cyan')
        }
      } else {
        log(`✅ Переносы строк корректны (LF)`, 'green')
      }
    } catch (err) {
      log(`❌ Ошибка чтения файла: ${err.message}`, 'red')
      return false
    }
  }

  // Проверяем наличие обязательных переменных
  const lines = content.split('\n')
  const foundVars = new Set()
  const missingVars = []
  const emptyVars = []

  for (const varName of requiredVars) {
    const line = lines.find(l => {
      const trimmed = l.trim()
      return trimmed.startsWith(varName + '=') || trimmed.startsWith('#' + varName + '=')
    })
    
    if (!line) {
      missingVars.push(varName)
      foundVars.add(varName)
    } else {
      const match = line.match(/^#?\s*([^=]+)=(.*)$/)
      if (match) {
        const value = match[2].trim()
        const isCommented = line.trim().startsWith('#')
        
        if (isCommented) {
          log(`⚠️  ${varName} - закомментирован`, 'yellow')
          missingVars.push(varName)
        } else if (!value || value.includes('your_') || value.includes('here') || value === '""' || value === "''") {
          log(`⚠️  ${varName} - не заполнено или содержит заглушку`, 'yellow')
          emptyVars.push(varName)
        } else {
          const displayValue = varName.includes('KEY') || varName.includes('PASSWORD') || varName.includes('PRIVATE')
            ? value.substring(0, 20) + '...'
            : value
          log(`✅ ${varName} = ${displayValue}`, 'green')
        }
        foundVars.add(varName)
      }
    }
  }

  // Проверяем FIREBASE_PRIVATE_KEY на корректный формат
  const privateKeyLine = lines.find(l => l.includes('FIREBASE_PRIVATE_KEY'))
  if (privateKeyLine && !privateKeyLine.trim().startsWith('#')) {
    const keyMatch = privateKeyLine.match(/FIREBASE_PRIVATE_KEY=(.+)/)
    if (keyMatch) {
      const keyValue = keyMatch[1].trim()
      // Проверяем, что ключ содержит \n для переносов строк
      if (!keyValue.includes('\\n') && !keyValue.includes('\n')) {
        log(`⚠️  FIREBASE_PRIVATE_KEY должен содержать \\n для переносов строк`, 'yellow')
        if (FIX_MODE) {
          // Пытаемся исправить, но это сложно автоматически
          log(`💡 Отредактируйте FIREBASE_PRIVATE_KEY вручную, добавив \\n`, 'blue')
        }
      }
    }
  }

  // Сохраняем исправленный файл
  if (needsFix && FIX_MODE) {
    try {
      writeFileSync(envPath, content, { encoding: 'utf-8' })
      log(`✅ Файл ${envPath} исправлен и сохранен`, 'green')
    } catch (err) {
      log(`❌ Ошибка сохранения файла: ${err.message}`, 'red')
      return false
    }
  }

  const allOk = missingVars.length === 0 && emptyVars.length === 0 && !needsFix

  if (!allOk && !FIX_MODE) {
    log(`\n💡 Запустите с флагом --fix для автоматического исправления:`, 'blue')
    log(`   node setup-env.js --fix`, 'cyan')
  }

  return allOk
}

// Основная функция
function main() {
  log(`\n${'='.repeat(60)}`, 'cyan')
  log(`🚀 Настройка переменных окружения`, 'cyan')
  log(`${'='.repeat(60)}`, 'cyan')

  if (FIX_MODE) {
    log(`\n🔧 Режим исправления включен`, 'yellow')
  }

  // Frontend .env
  const frontendEnvPath = join(__dirname, '.env')
  const frontendExamplePath = join(__dirname, '.env.example')
  const frontendVars = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID'
  ]

  const frontendOk = checkEnvFile(
    frontendEnvPath,
    frontendExamplePath,
    frontendVars,
    'Frontend .env'
  )

  // Backend .env
  const backendEnvPath = join(__dirname, 'server', '.env')
  const backendExamplePath = join(__dirname, 'server', '.env.example')
  const backendVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'PORT',
    'NODE_ENV'
  ]

  const backendOk = checkEnvFile(
    backendEnvPath,
    backendExamplePath,
    backendVars,
    'Backend server/.env'
  )

  // Итоговый результат
  log(`\n${'='.repeat(60)}`, 'cyan')
  if (frontendOk && backendOk) {
    log(`✅ Все переменные окружения настроены корректно!`, 'green')
    log(`\n📋 Следующие шаги:`, 'cyan')
    log(`   1. Запустите backend: cd server && npm start`, 'blue')
    log(`   2. Запустите frontend: npm run dev`, 'blue')
    log(`   3. Или используйте: npm run start:all`, 'blue')
    return 0
  } else {
    log(`⚠️  Есть проблемы с переменными окружения`, 'yellow')
    log(`\n💡 Инструкции:`, 'cyan')
    log(`   - Заполните все переменные в .env и server/.env`, 'blue')
    log(`   - Запустите снова: node setup-env.js`, 'blue')
    return 1
  }
}

// Запуск
try {
  const exitCode = main()
  process.exit(exitCode)
} catch (err) {
  log(`\n❌ Критическая ошибка: ${err.message}`, 'red')
  console.error(err)
  process.exit(1)
}
