/**
 * Общая инициализация Firebase Admin SDK для серверов (payment-server и др.)
 * @returns {Promise<{ admin: FirebaseAdmin, db: FirebaseFirestore.Firestore } | { admin: null, db: null }>}
 */
import firebaseAdmin from 'firebase-admin'
import path from 'path'
import fs from 'fs'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function initFirebaseAdmin() {
  try {
    if (firebaseAdmin.apps.length > 0) {
      const admin = firebaseAdmin
      return { admin, db: admin.firestore() }
    }

    let credential = null
    let projectId = process.env.FIREBASE_PROJECT_ID || ''
    let serviceAccount = null

    const keyPathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    const defaultKeyPath = path.join(__dirname, '..', 'firebase-service-account.json')
    const keyPath = keyPathEnv
      ? (path.isAbsolute(keyPathEnv) ? keyPathEnv : path.join(__dirname, '..', keyPathEnv))
      : (fs.existsSync(defaultKeyPath) ? defaultKeyPath : null)
    if (keyPath && !credential) {
      try {
        const json = await readFile(keyPath, 'utf8')
        serviceAccount = JSON.parse(json)
        if (serviceAccount.private_key) serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
        credential = firebaseAdmin.credential.cert(serviceAccount)
        if (serviceAccount.project_id) projectId = projectId || serviceAccount.project_id
      } catch (err) {
        console.warn('⚠️ Firebase init: ошибка чтения ключа из файла:', err.message)
      }
    }

    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    if (serviceAccountKey && !credential) {
      try {
        serviceAccount = JSON.parse(serviceAccountKey)
      } catch {
        try {
          serviceAccount = JSON.parse(serviceAccountKey.replace(/\r?\n/g, ''))
        } catch (_) {}
      }
      if (serviceAccount) {
        try {
          if (serviceAccount.private_key && typeof serviceAccount.private_key === 'string') {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n').replace(/\\\\n/g, '\n')
          }
          credential = firebaseAdmin.credential.cert(serviceAccount)
          if (serviceAccount.project_id) projectId = projectId || serviceAccount.project_id
        } catch (err) {
          console.warn('⚠️ Firebase init:', err.message)
        }
      }
    }

    if (!credential) {
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
      const privateKey = process.env.FIREBASE_PRIVATE_KEY
      if (clientEmail && privateKey) {
        credential = firebaseAdmin.credential.cert({
          projectId: projectId || 'skypathvpn',
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        })
        if (!projectId) projectId = process.env.FIREBASE_PROJECT_ID || 'skypathvpn'
      }
    }

    if (!projectId && serviceAccount?.project_id) projectId = serviceAccount.project_id

    if (credential && projectId) {
      firebaseAdmin.initializeApp({ credential, projectId })
      const admin = firebaseAdmin
      const db = admin.firestore()
      return { admin, db }
    }
  } catch (err) {
    console.warn('⚠️ Firebase Admin SDK:', err.message)
  }
  return { admin: null, db: null }
}
