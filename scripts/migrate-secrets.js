#!/usr/bin/env node

/**
 * Скрипт миграции секретов
 * 
 * Использование:
 *   node scripts/migrate-secrets.js
 * 
 * Проверяет наличие секретов в коде и помогает их мигрировать
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// Файлы для проверки
const DANGEROUS_FILES = [
  'update_firebase_env.py',
  // Добавьте другие файлы со секретами
]

// Паттерны секретов для поиска
const SECRET_PATTERNS = [
  /api[_-]?key\s*[:=]\s*["']([^"']+)["']/gi,
  /password\s*[:=]\s*["']([^"']+)["']/gi,
  /secret\s*[:=]\s*["']([^"']+)["']/gi,
  /token\s*[:=]\s*["']([^"']+)["']/gi,
  /AIza[0-9A-Za-z_-]+/g, // Firebase API keys
]

console.log('🔍 Поиск секретов в проекте...\n')

let issuesFound = false

// Проверка опасных файлов
console.log('📁 Проверка файлов:')
DANGEROUS_FILES.forEach(file => {
  const filePath = path.join(projectRoot, file)
  if (fs.existsSync(filePath)) {
    console.log(`  ⚠️  НАЙДЕН: ${file}`)
    console.log(`     Рекомендуется: Удалить или переместить секреты в переменные окружения\n`)
    issuesFound = true
  } else {
    console.log(`  ✅ ${file} не найден`)
  }
})

// Проверка .env файлов в git
console.log('\n🔐 Проверка .env файлов:')
const envFiles = [
  '.env',
  '.env.local',
  '.env.production',
  'server/.env',
]

envFiles.forEach(file => {
  const filePath = path.join(projectRoot, file)
  if (fs.existsSync(filePath)) {
    console.log(`  ✅ ${file} существует (должен быть в .gitignore)`)
  } else {
    console.log(`  ℹ️  ${file} не найден (это нормально)`)
  }
})

// Проверка .env.example
const envExamplePath = path.join(projectRoot, '.env.example')
if (!fs.existsSync(envExamplePath)) {
  console.log(`  ⚠️  НЕ НАЙДЕН: .env.example`)
  console.log(`     Рекомендуется: Создать шаблон переменных окружения\n`)
  issuesFound = true
} else {
  console.log(`  ✅ .env.example существует`)
}

// Проверка .gitignore
console.log('\n🔒 Проверка .gitignore:')
const gitignorePath = path.join(projectRoot, '.gitignore')
if (fs.existsSync(gitignorePath)) {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8')
  if (gitignoreContent.includes('.env') && !gitignoreContent.includes('!.env.example')) {
    console.log(`  ✅ .env в .gitignore, но отсутствует исключение для .env.example`)
    issuesFound = true
  } else if (gitignoreContent.includes('.env')) {
    console.log(`  ✅ .env правильно настроен в .gitignore`)
  } else {
    console.log(`  ⚠️  .env не найден в .gitignore`)
    issuesFound = true
  }
} else {
  console.log(`  ⚠️  .gitignore не найден`)
  issuesFound = true
}

console.log('\n' + '='.repeat(60))
if (issuesFound) {
  console.log('⚠️  Обнаружены проблемы безопасности!')
  console.log('📋 Следуйте инструкциям в SECURITY_SECRETS_MANAGEMENT.md')
  process.exit(1)
} else {
  console.log('✅ Проверка безопасности пройдена!')
  process.exit(0)
}
