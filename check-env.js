// Скрипт для проверки переменных окружения
import { readFileSync } from 'fs'

const envContent = readFileSync('.env', 'utf-8')
const lines = envContent.split('\n')

console.log('📋 Проверка переменных окружения Firebase:\n')

const firebaseVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
]

let allOk = true

firebaseVars.forEach(varName => {
  const line = lines.find(l => l.startsWith(varName + '='))
  if (!line) {
    console.log(`❌ ${varName} - отсутствует`)
    allOk = false
  } else {
    const value = line.split('=')[1]?.trim() || ''
    if (!value || value.includes('your_') || value.includes('here')) {
      console.log(`❌ ${varName} - не заполнено или содержит заглушку`)
      allOk = false
    } else {
      const displayValue = varName.includes('KEY') || varName.includes('PASSWORD') 
        ? value.substring(0, 10) + '...' 
        : value
      console.log(`✅ ${varName} = ${displayValue}`)
    }
  }
})

console.log('\n' + (allOk ? '✅ Все переменные заполнены правильно!' : '❌ Есть проблемы с переменными окружения'))

