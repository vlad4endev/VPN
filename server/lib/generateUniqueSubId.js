/**
 * Генерация уникального subId для пользователей (формат 3x-ui: 16 символов base36).
 * Используется в telegram.routes, n8n-webhook-proxy, ensure-firestore-user и т.д.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore (Admin SDK)
 * @param {string} appId - APP_ID (например 'skyputh')
 * @param {number} [maxAttempts=10] - Максимум попыток проверки уникальности
 * @returns {Promise<string>} Уникальный subId
 */
const SUB_ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz'
const SUB_ID_LENGTH = 16

function generateSubIdRandom() {
  let result = ''
  for (let i = 0; i < SUB_ID_LENGTH; i++) {
    result += SUB_ID_CHARS[Math.floor(Math.random() * SUB_ID_CHARS.length)]
  }
  return result
}

export async function generateUniqueSubId(db, appId, maxAttempts = 10) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const subId = generateSubIdRandom()
    try {
      const usersRef = db.collection(`artifacts/${appId}/public/data/users_v4`)
      const snap = await usersRef.where('subId', '==', subId).limit(1).get()
      if (snap.empty) return subId
    } catch (err) {
      console.warn('generateUniqueSubId: проверка уникальности не удалась', { subId, attempt, err: err?.message })
      if (attempt === maxAttempts) return subId
    }
  }
  return generateSubIdRandom()
}

export { generateSubIdRandom }
