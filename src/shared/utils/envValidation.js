/**
 * Валидация переменных окружения
 * Проверяет наличие всех необходимых переменных при старте приложения
 */

const requiredEnvVars = {
  // Firebase
  VITE_FIREBASE_API_KEY: 'Firebase API Key',
  VITE_FIREBASE_AUTH_DOMAIN: 'Firebase Auth Domain',
  VITE_FIREBASE_PROJECT_ID: 'Firebase Project ID',
  VITE_FIREBASE_STORAGE_BUCKET: 'Firebase Storage Bucket',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 'Firebase Messaging Sender ID',
  VITE_FIREBASE_APP_ID: 'Firebase App ID',
  
  // 3x-ui
  VITE_XUI_USERNAME: '3x-ui Username',
  VITE_XUI_PASSWORD: '3x-ui Password',
  VITE_XUI_INBOUND_ID: '3x-ui Inbound ID',
}

/**
 * Проверяет наличие всех обязательных переменных окружения
 * @returns {Object} { isValid: boolean, missing: string[], errors: string[] }
 */
export function validateEnvVars() {
  const missing = []
  const errors = []

  // Проверяем каждую обязательную переменную
  for (const [envVar, description] of Object.entries(requiredEnvVars)) {
    const value = import.meta.env[envVar]
    
    if (!value || value.trim() === '' || value.includes('your_') || value.includes('here')) {
      missing.push({ envVar, description })
    }
  }

  // Дополнительные проверки
  const inboundId = import.meta.env.VITE_XUI_INBOUND_ID
  if (inboundId && isNaN(Number(inboundId))) {
    errors.push('VITE_XUI_INBOUND_ID должен быть числом')
  }

  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
  if (authDomain && !authDomain.includes('.')) {
    errors.push('VITE_FIREBASE_AUTH_DOMAIN должен быть валидным доменом')
  }

  return {
    isValid: missing.length === 0 && errors.length === 0,
    missing,
    errors,
  }
}

/**
 * Выводит понятное сообщение об ошибках конфигурации
 * @param {Object} validationResult - Результат validateEnvVars()
 */
export function getEnvErrorMessage(validationResult) {
  const messages = []

  if (validationResult.missing.length > 0) {
    messages.push('Отсутствуют обязательные переменные окружения:')
    validationResult.missing.forEach(({ envVar, description }) => {
      messages.push(`  - ${envVar} (${description})`)
    })
    messages.push('')
    messages.push('Создайте файл .env в корне проекта и скопируйте туда значения из .env.example')
  }

  if (validationResult.errors.length > 0) {
    messages.push('Ошибки в конфигурации:')
    validationResult.errors.forEach(error => {
      messages.push(`  - ${error}`)
    })
  }

  return messages.join('\n')
}

