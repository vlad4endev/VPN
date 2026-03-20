import { doc, setDoc } from 'firebase/firestore'
import ThreeXUI from '../../features/vpn/services/ThreeXUI.js'
import i18n from '../../i18n'
import { isAdminEmail } from '../../shared/constants/admin.js'
import { getFirestoreSafeName } from '../../shared/utils/firestoreSafe.js'
import logger from '../../shared/utils/logger.js'

/**
 * Первый документ users_v4 при fallback из onAuthStateChanged (Google redirect / email без API).
 * Один setDoc; роль admin сразу в документе.
 *
 * @param {'google' | 'email'} kind — для логов
 */
export async function createFirestoreUserFromAuthFallback({
  dbInstance,
  appId,
  firebaseUser,
  generateUniqueSubId,
  kind,
}) {
  const generatedUUID = ThreeXUI.generateUUID()
  const generatedSubId = await generateUniqueSubId(dbInstance, appId)
  const userDocRef = doc(dbInstance, `artifacts/${appId}/public/data/users_v4`, firebaseUser.uid)
  const safeName = getFirestoreSafeName(firebaseUser.displayName, firebaseUser.email)
  const normalizedEmail = (firebaseUser.email || '').trim().toLowerCase()
  const effectiveRole = isAdminEmail(normalizedEmail) ? 'admin' : 'user'
  const newUserData = {
    email: firebaseUser.email || '',
    name: safeName,
    phone: '',
    role: effectiveRole,
    plan: 'free',
    uuid: generatedUUID,
    subId: generatedSubId,
    expiresAt: null,
    tariffName: '',
    tariffId: '',
    photoURL: firebaseUser.photoURL || null,
    language: (typeof localStorage !== 'undefined' && localStorage.getItem('vpn-ui-lang')) || i18n.language || 'ru',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await setDoc(userDocRef, newUserData)
  if (effectiveRole === 'admin') {
    logger.info(
      'Auth',
      kind === 'google'
        ? 'Пользователю выданы права администратора по email (Google fallback)'
        : 'Пользователю выданы права администратора по email (email fallback)',
      { email: normalizedEmail },
    )
  }
  const currentUserData = {
    id: firebaseUser.uid,
    ...newUserData,
    email: firebaseUser.email || '',
    photoURL: firebaseUser.photoURL || null,
    name: firebaseUser.displayName || '',
    role: effectiveRole,
  }
  return { currentUserData, effectiveRole }
}
