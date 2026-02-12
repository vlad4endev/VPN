#!/usr/bin/env node
/**
 * Скрипт для миграции пользователей из NocoDB (или любого JSON-экспорта)
 * в Firebase Auth + Firestore коллекцию artifacts/skyputh/public/data/users_v4.
 *
 * Использование:
 *   node server/import-users-from-json.cjs path/to/users.json
 *
 * Формат JSON:
 *   [
 *     {
 *       "email": "user@example.com",
 *       "name": "Имя Пользователя",
 *       "phone": "+7...",
 *       "tgId": "123456789",          // опционально
 *       "role": "user" | "admin",     // опционально
 *       "plan": "free" | "premium"    // опционально
 *     },
 *     ...
 *   ]
 *
 * ВАЖНО:
 *   - Требуется firebase-service-account.json в папке server/
 *     или переменная окружения FIREBASE_SERVICE_ACCOUNT_PATH.
 *   - Скрипт создает пользователей в Firebase Auth (email+пароль)
 *     и документы в Firestore (users_v4).
 *   - Пароль генерируется случайно (16 символов). Пароли НЕ сохраняются
 *     в Firestore. Вы можете задать единый пароль через ENV IMPORT_DEFAULT_PASSWORD,
 *     если необходимо выдать его пользователям.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const admin = require('firebase-admin')

const serviceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
  path.join(__dirname, 'firebase-service-account.json')

try {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  console.log('✅ Firebase Admin SDK инициализирован')
} catch (error) {
  console.error('❌ Ошибка инициализации Firebase Admin SDK:', error.message)
  console.error(
    'Убедитесь, что firebase-service-account.json в папке server/ или задайте FIREBASE_SERVICE_ACCOUNT_PATH'
  )
  process.exit(1)
}

const db = admin.firestore()
const APP_ID = process.env.APP_ID || 'skyputh'
const DEFAULT_PASSWORD = process.env.IMPORT_DEFAULT_PASSWORD || null

function generateRandomPassword(length = 16) {
  if (DEFAULT_PASSWORD && DEFAULT_PASSWORD.length >= 6) {
    return DEFAULT_PASSWORD
  }
  return crypto.randomBytes(length).toString('base64').slice(0, length)
}

function generateSubId() {
  const length = 16
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz'
  let result = ''
  for (let i = 0; i < length; i++) {
    const idx = crypto.randomInt(0, chars.length)
    result += chars[idx]
  }
  return result
}

async function importUsers(jsonPath) {
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ Файл не найден:', jsonPath)
    process.exit(1)
  }

  const raw = fs.readFileSync(jsonPath, 'utf8')
  let rows
  try {
    rows = JSON.parse(raw)
  } catch (err) {
    console.error('❌ Ошибка парсинга JSON:', err.message)
    process.exit(1)
  }

  if (!Array.isArray(rows)) {
    console.error('❌ Ожидается массив объектов в JSON')
    process.exit(1)
  }

  console.log(`🔄 Найдено записей для импорта: ${rows.length}`)

  let createdCount = 0
  let skippedCount = 0
  let errorCount = 0

  for (const row of rows) {
    const email =
      (row.email || row.Email || row.mail || '').toString().trim().toLowerCase()
    const name =
      (row.name ||
        row.full_name ||
        row.FullName ||
        row.Name ||
        '').toString().trim()

    if (!email || !name) {
      console.warn('⚠️ Пропуск записи без email или name:', row)
      skippedCount++
      continue
    }

    const phone =
      (row.phone || row.Phone || row.telephone || '').toString().trim()
    const tgId =
      (row.tgId ||
        row.telegram_id ||
        row.telegramId ||
        row.TelegramId ||
        '').toString().trim()
    const roleRaw =
      (row.role || row.Role || '').toString().trim().toLowerCase() || 'user'
    const planRaw =
      (row.plan || row.Plan || '').toString().trim().toLowerCase() || 'free'

    const allowedRoles = ['user', 'admin', 'accountant', 'бухгалтер']
    const role = allowedRoles.includes(roleRaw) ? roleRaw : 'user'
    const plan = planRaw || 'free'

    console.log(`\n👤 Импорт пользователя: ${email} (${name})`)

    try {
      // Создаем пользователя в Firebase Auth или получаем существующего
      let userRecord
      try {
        userRecord = await admin.auth().createUser({
          email,
          password: generateRandomPassword(),
          displayName: name,
          disabled: false,
        })
        console.log('  ✅ Создан в Firebase Auth:', userRecord.uid)
      } catch (err) {
        if (err.code === 'auth/email-already-exists') {
          userRecord = await admin.auth().getUserByEmail(email)
          console.log('  ℹ️ Уже существует в Firebase Auth, используем UID:', userRecord.uid)
        } else {
          throw err
        }
      }

      const uid = userRecord.uid

      // Проверяем, есть ли уже документ в Firestore
      const userDocRef = db.doc(
        `artifacts/${APP_ID}/public/data/users_v4/${uid}`
      )
      const snap = await userDocRef.get()
      if (snap.exists) {
        console.log('  ℹ️ Документ в Firestore уже существует, пропускаем создание')
        skippedCount++
        continue
      }

      const uuid = crypto.randomUUID()
      const subId = generateSubId()
      const nowIso = new Date().toISOString()

      const userData = {
        email,
        name,
        phone,
        role,
        plan,
        uuid,
        subId,
        expiresAt: null,
        tariffName: '',
        tariffId: '',
        photoURL: userRecord.photoURL || null,
        createdAt: nowIso,
        updatedAt: nowIso,
      }

      if (tgId) {
        userData.tgId = tgId
      }

      await userDocRef.set(userData)
      console.log('  ✅ Документ создан в Firestore')

      createdCount++
    } catch (err) {
      console.error('  ❌ Ошибка импорта пользователя:', email, '-', err.message)
      errorCount++
    }
  }

  console.log('\n📊 Результаты импорта:')
  console.log('  ✅ Создано:', createdCount)
  console.log('  ℹ️ Пропущено:', skippedCount)
  console.log('  ❌ Ошибок:', errorCount)
}

async function main() {
  const args = process.argv.slice(2)
  const jsonPath = args[0]

  if (!jsonPath) {
    console.log(`
Использование:
  node server/import-users-from-json.cjs path/to/users.json

Пример:
  node server/import-users-from-json.cjs ./nocodb-users.json

Советы:
  1. Экспортируйте пользователей из NocoDB в JSON.
  2. Убедитесь, что у записей есть поля email и name.
  3. При необходимости задайте IMPORT_DEFAULT_PASSWORD для единого пароля.
`)
    process.exit(0)
  }

  await importUsers(jsonPath)
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Неожиданная ошибка:', err)
  process.exit(1)
})

