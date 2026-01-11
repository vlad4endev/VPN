#!/usr/bin/env node
/**
 * Скрипт для проверки на наличие секретов в коде
 * Используется в pre-commit hooks
 */

const fs = require('fs')
const path = require('path')

// Паттерны для поиска потенциальных секретов
const SECRET_PATTERNS = [
  /(?:password|passwd|pwd)\s*[:=]\s*['"](?!your_|example|test|dummy)[^'"]{8,}['"]/gi,
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"](?!your_|example|test|dummy)[^'"]{10,}['"]/gi,
  /(?:secret|secret[_-]?key)\s*[:=]\s*['"](?!your_|example|test|dummy)[^'"]{8,}['"]/gi,
  /(?:token|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"](?!your_|example|test|dummy)[^'"]{10,}['"]/gi,
  /(?:private[_-]?key|privkey)\s*[:=]\s*['"](?!your_|example|test|dummy)[^'"]{20,}['"]/gi,
]

// Исключения (файлы, которые можно игнорировать)
const IGNORE_PATTERNS = [
  /\.env\.example$/,
  /\.git/,
  /node_modules/,
  /dist/,
  /build/,
  /\.md$/,
  /check-secrets\.js$/,
]

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  const issues = []

  lines.forEach((line, index) => {
    SECRET_PATTERNS.forEach((pattern) => {
      if (pattern.test(line)) {
        // Проверяем, не является ли это примером или тестовым значением
        if (!line.match(/(your_|example|test|dummy|placeholder)/i)) {
          issues.push({
            file: filePath,
            line: index + 1,
            content: line.trim(),
          })
        }
      }
    })
  })

  return issues
}

function shouldIgnoreFile(filePath) {
  return IGNORE_PATTERNS.some((pattern) => pattern.test(filePath))
}

function main() {
  const files = process.argv.slice(2)
  
  if (files.length === 0) {
    console.log('Использование: node check-secrets.js <file1> <file2> ...')
    process.exit(0)
  }

  const allIssues = []

  files.forEach((file) => {
    if (shouldIgnoreFile(file)) {
      return
    }

    if (!fs.existsSync(file)) {
      return
    }

    const issues = checkFile(file)
    allIssues.push(...issues)
  })

  if (allIssues.length > 0) {
    console.error('❌ Обнаружены потенциальные секреты в коде:')
    allIssues.forEach((issue) => {
      console.error(`  ${issue.file}:${issue.line}`)
      console.error(`    ${issue.content}`)
    })
    console.error('\n⚠️  Убедитесь, что все секреты вынесены в переменные окружения!')
    process.exit(1)
  }

  console.log('✅ Проверка секретов пройдена')
  process.exit(0)
}

main()
