/**
 * Доступ к пользователям в PostgreSQL для гибридной Telegram-авторизации.
 * Таблица: users (id, telegram_id, role, created_at, updated_at и др.)
 */

/**
 * Найти пользователя по telegram_id или создать нового.
 * @param {import('pg').Pool} pool
 * @param {string} telegramId
 * @param {{ first_name?: string, last_name?: string, username?: string }} [profile]
 * @returns {Promise<{ id: string, telegram_id: string, role: string }>}
 */
export async function findOrCreateUserByTelegramId(pool, telegramId, profile = {}) {
  const client = await pool.connect()
  try {
    const existing = await client.query(
      'SELECT id, telegram_id, role FROM users WHERE telegram_id = $1 LIMIT 1',
      [telegramId]
    )
    if (existing.rows.length > 0) {
      const row = existing.rows[0]
      await client.query(
        'UPDATE users SET updated_at = NOW(), first_name = COALESCE($2, first_name), last_name = COALESCE($3, last_name), username = COALESCE($4, username) WHERE id = $1',
        [row.id, profile.first_name ?? null, profile.last_name ?? null, profile.username ?? null]
      )
      return { id: row.id, telegram_id: row.telegram_id, role: row.role || 'user' }
    }
    const insert = await client.query(
      `INSERT INTO users (telegram_id, role, first_name, last_name, username, created_at, updated_at)
       VALUES ($1, 'user', $2, $3, $4, NOW(), NOW())
       RETURNING id, telegram_id, role`,
      [telegramId, profile.first_name ?? null, profile.last_name ?? null, profile.username ?? null]
    )
    const row = insert.rows[0]
    return { id: row.id, telegram_id: row.telegram_id, role: row.role || 'user' }
  } finally {
    client.release()
  }
}

/**
 * Найти пользователя по id (для валидации refresh).
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @returns {Promise<{ id: string, telegram_id: string, role: string } | null>}
 */
export async function findUserById(pool, userId) {
  const res = await pool.query(
    'SELECT id, telegram_id, role FROM users WHERE id = $1 LIMIT 1',
    [userId]
  )
  if (res.rows.length === 0) return null
  const row = res.rows[0]
  return { id: row.id, telegram_id: row.telegram_id, role: row.role || 'user' }
}
