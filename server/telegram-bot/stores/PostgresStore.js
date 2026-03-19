/**
 * PostgreSQL хранилище состояний (production).
 * Зависимость: npm i pg
 * Таблицу создайте по schema/postgres.sql
 */

const pools = new Map()

async function getPool(connectionString) {
  const key = String(connectionString || '')
  if (pools.has(key)) return pools.get(key)
  try {
    const { Pool } = await import('pg')
    const pool = new Pool({ connectionString, max: 10 })
    pools.set(key, pool)
    return pool
  } catch (e) {
    throw new Error('Postgres store requires pg: npm i pg')
  }
}

const DEFAULT_TABLE = 'telegram_bot_state'

export function createPostgresStore(connectionString, tableName = DEFAULT_TABLE, ttlSeconds = 3600) {
  const safeTableName = String(tableName)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(safeTableName)) {
    throw new Error(`Invalid Postgres table name: ${safeTableName}`)
  }

  return {
    async getState(chatId) {
      const client = await getPool(connectionString)
      const res = await client.query(
        `SELECT payload FROM ${safeTableName} WHERE chat_id = $1 AND expires_at > NOW()`,
        [String(chatId)]
      )
      if (!res.rows || res.rows.length === 0) return null
      try {
        return typeof res.rows[0].payload === 'string'
          ? JSON.parse(res.rows[0].payload)
          : res.rows[0].payload
      } catch {
        return null
      }
    },

    async setState(chatId, state, ttl = ttlSeconds) {
      const client = await getPool(connectionString)
      const payload = JSON.stringify({ ...state, _expiresAt: Date.now() + (ttl * 1000) })
      const expiresAt = new Date(Date.now() + ttl * 1000)
      await client.query(
        `INSERT INTO ${safeTableName} (chat_id, payload, expires_at) VALUES ($1, $2, $3)
         ON CONFLICT (chat_id) DO UPDATE SET payload = $2, expires_at = $3`,
        [String(chatId), payload, expiresAt]
      )
    },

    async deleteState(chatId) {
      const client = await getPool(connectionString)
      await client.query(`DELETE FROM ${safeTableName} WHERE chat_id = $1`, [String(chatId)])
    },
  }
}
