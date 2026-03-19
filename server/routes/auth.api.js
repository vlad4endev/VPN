/**
 * API маршруты авторизации: resolve-login, check-identifier, set-password, ensure-firestore-user.
 * Подключается в n8n-webhook-proxy: app.use(createAuthApiRouter(deps))
 */
import express from 'express'
import crypto from 'crypto'
import { generateUniqueSubId } from '../lib/generateUniqueSubId.js'
import { syncUserToSupabase } from '../lib/supabaseSync.js'

function randomUUIDFallback() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * @param {Object} deps
 * @param {() => *} deps.getDb
 * @param {() => *} deps.getAdmin
 * @param {() => Promise<void>} deps.initFirebaseAdmin
 * @param {(req, res) => Promise<{ok?: boolean, uid?: string}>} deps.verifyIdToken
 * @param {string} deps.APP_ID
 */
export function createAuthApiRouter(deps) {
  const router = express.Router({ mergeParams: true })
  const { getDb, getAdmin, initFirebaseAdmin, verifyIdToken, APP_ID } = deps

  router.get('/api/auth/resolve-login', async (req, res) => {
    let db = getDb()
    if (!db) {
      try { await initFirebaseAdmin() } catch (_) {}
      db = getDb()
      if (!db) return res.status(503).json({ error: 'Сервис недоступен' })
    }
    const q = (req.query.q || '').toString().trim()
    if (!q) return res.status(400).json({ error: 'Укажите q (логин, email или ID)' })
    const appId = APP_ID || process.env.APP_ID || 'skyputh'
    const usersRef = db.collection(`artifacts/${appId}/public/data/users_v4`)
    const qLower = q.toLowerCase()
    try {
      const byLogin = await usersRef.where('login', '==', qLower).limit(1).get()
      if (!byLogin.empty) {
        const email = byLogin.docs[0].data().email
        if (email) return res.json({ email })
      }
      const byEmail = await usersRef.where('email', '==', qLower).limit(1).get()
      if (!byEmail.empty) {
        const email = byEmail.docs[0].data().email
        if (email) return res.json({ email })
      }
      const byTgId = await usersRef.where('tgId', '==', q.trim()).limit(1).get()
      if (!byTgId.empty) {
        const email = byTgId.docs[0].data().email
        if (email) return res.json({ email })
      }
      if (/^\d+$/.test(q.trim())) {
        const docSnap = await usersRef.doc(`tg_${q.trim()}`).get()
        if (docSnap.exists) {
          const email = docSnap.data().email
          if (email) return res.json({ email })
        }
      }
      return res.status(404).json({ error: 'Пользователь не найден' })
    } catch (err) {
      console.error('❌ GET /api/auth/resolve-login:', err.message)
      return res.status(500).json({ error: err.message })
    }
  })

  router.get('/api/auth/check-identifier', async (req, res) => {
    let db = getDb()
    if (!db) {
      try { await initFirebaseAdmin() } catch (_) {}
      db = getDb()
      if (!db) return res.status(503).json({ error: 'Сервис недоступен' })
    }
    const login = (req.query.login || '').toString().trim().toLowerCase()
    const email = (req.query.email || '').toString().trim().toLowerCase()
    const appId = APP_ID || process.env.APP_ID || 'skyputh'
    const usersRef = db.collection(`artifacts/${appId}/public/data/users_v4`)
    try {
      let loginAvailable = true
      let emailAvailable = true
      if (login) loginAvailable = (await usersRef.where('login', '==', login).limit(1).get()).empty
      if (email) emailAvailable = (await usersRef.where('email', '==', email).limit(1).get()).empty
      return res.json({ loginAvailable, emailAvailable })
    } catch (err) {
      console.error('❌ GET /api/auth/check-identifier:', err.message)
      return res.status(500).json({ error: err.message })
    }
  })

  router.post('/api/auth/set-password-by-login', express.json(), async (req, res) => {
    let admin = getAdmin()
    let db = getDb()
    if (!admin || !db) {
      try { await initFirebaseAdmin() } catch (_) {}
      admin = getAdmin()
      db = getDb()
      if (!admin || !db) return res.status(503).json({ error: 'Сервис недоступен' })
    }
    const login = (req.body.login || '').toString().trim().toLowerCase()
    const newPassword = (req.body.newPassword || '').toString()
    if (!login) return res.status(400).json({ error: 'Укажите логин' })
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' })
    if (newPassword.length > 128) return res.status(400).json({ error: 'Пароль слишком длинный' })
    const appId = APP_ID || process.env.APP_ID || 'skyputh'
    const usersRef = db.collection(`artifacts/${appId}/public/data/users_v4`)
    try {
      const snap = await usersRef.where('login', '==', login).limit(1).get()
      if (snap.empty) return res.status(404).json({ error: 'Пользователь с таким логином не найден' })
      const uid = snap.docs[0].id
      await admin.auth().updateUser(uid, { password: newPassword })
      return res.json({ success: true, message: 'Пароль успешно установлен' })
    } catch (err) {
      if (err.code === 'auth/weak-password') return res.status(400).json({ error: 'Пароль слишком простой' })
      console.error('❌ POST /api/auth/set-password-by-login:', err.message)
      return res.status(500).json({ error: err.message || 'Ошибка установки пароля' })
    }
  })

  router.post('/api/auth/ensure-firestore-user', express.json(), async (req, res) => {
    const authResult = await verifyIdToken(req, res)
    if (!authResult?.ok) return
    let db = getDb()
    let admin = getAdmin()
    if (!db || !admin) {
      try { await initFirebaseAdmin() } catch (_) {}
      db = getDb()
      admin = getAdmin()
    }
    if (!db || !admin) return res.status(503).json({ success: false, error: 'Сервис недоступен' })
    const appId = APP_ID || process.env.APP_ID || 'skyputh'
    const uid = authResult.uid
    const userRef = db.doc(`artifacts/${appId}/public/data/users_v4/${uid}`)
    try {
      const snap = await userRef.get()
      if (snap.exists) {
        const existingUser = { id: uid, ...snap.data() }
        try {
          await syncUserToSupabase({ uid, appId, userData: existingUser })
        } catch (syncErr) {
          console.warn('⚠️ ensure-firestore-user: sync to Supabase failed for existing user', uid, syncErr.message)
        }
        return res.json({ success: true, alreadyExists: true, user: existingUser })
      }
      const authUser = await admin.auth().getUser(uid)
      const subId = await generateUniqueSubId(db, appId)
      const now = new Date().toISOString()
      const newUserData = {
        email: (authUser.email || '').trim() || null,
        name: (authUser.displayName || authUser.email || '').trim() || '',
        phone: '',
        role: 'user',
        plan: 'free',
        uuid: crypto.randomUUID ? crypto.randomUUID() : randomUUIDFallback(),
        subId,
        expiresAt: null,
        tariffName: '',
        tariffId: '',
        photoURL: authUser.photoURL || null,
        language: 'ru',
        createdAt: now,
        updatedAt: now,
      }
      await userRef.set(newUserData)
      try {
        await syncUserToSupabase({ uid, appId, userData: newUserData })
      } catch (syncErr) {
        console.warn('⚠️ ensure-firestore-user: sync to Supabase failed for new user', uid, syncErr.message)
      }
      console.log('✅ ensure-firestore-user: создан документ для uid', uid, authUser.email || '(no email)')
      return res.json({ success: true, created: true, user: { id: uid, ...newUserData } })
    } catch (err) {
      console.error('❌ POST /api/auth/ensure-firestore-user:', err.message)
      return res.status(500).json({ error: err.message })
    }
  })

  router.post('/api/auth/set-password', express.json(), async (req, res) => {
    const admin = getAdmin()
    if (!admin) {
      try { await initFirebaseAdmin() } catch (_) {}
      if (!getAdmin()) return res.status(503).json({ error: 'Сервис недоступен' })
    }
    const idToken = (req.body.idToken || '').toString().trim()
    const newPassword = (req.body.newPassword || '').toString()
    if (!idToken) return res.status(400).json({ error: 'Укажите idToken' })
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' })
    if (newPassword.length > 128) return res.status(400).json({ error: 'Пароль слишком длинный' })
    try {
      const decoded = await getAdmin().auth().verifyIdToken(idToken)
      await getAdmin().auth().updateUser(decoded.uid, { password: newPassword })
      return res.json({ success: true, message: 'Пароль успешно установлен. Теперь вы можете входить по email и паролю.' })
    } catch (err) {
      if (err.code === 'auth/weak-password') return res.status(400).json({ error: 'Пароль слишком простой' })
      if (err.code === 'auth/id-token-expired') return res.status(401).json({ error: 'Сессия истекла. Войдите снова.' })
      console.error('❌ POST /api/auth/set-password:', err.message)
      return res.status(500).json({ error: err.message || 'Ошибка установки пароля' })
    }
  })

  return router
}
