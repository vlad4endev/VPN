/**
 * ПРИМЕР: adminService для работы через Proxy (без прямых вызовов ThreeXUI)
 *
 * ВАЖНО: Это пример — VPN операции выполняются через Proxy в React компонентах с useXUI().
 * Оригинал: src/features/admin/services/adminService.js
 */

import { collection, getDocs, doc, setDoc } from 'firebase/firestore'
import { db } from '../../src/lib/firebase/config.js'
import { APP_ID } from '../../src/shared/constants/app.js'
import logger from '../../src/shared/utils/logger.js'

export const adminService = {
  async loadUsers() {
    if (!db) throw new Error('База данных недоступна')
    const usersCollection = collection(db, `artifacts/${APP_ID}/public/data/users_v4`)
    const usersSnapshot = await getDocs(usersCollection)
    return usersSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
  },

  async updateUser(userId, updates) {
    if (!db) throw new Error('База данных недоступна')
    const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, userId)
    const updateData = { ...updates, updatedAt: new Date().toISOString() }
    await setDoc(userDoc, updateData, { merge: true })
    return updateData
  },
}
