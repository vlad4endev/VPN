/**
 * Firebase config stub — all functionality migrated to Supabase.
 * This file exists for backward compatibility with imports that haven't been updated yet.
 */

export const app = null
export const auth = null
export const db = null
export const realtimeDb = null
export const appCheck = null
export const firebaseInitError = 'Firebase отключён — используется Supabase'
export const envValidation = { isValid: true }

export function getDb() {
  return null
}

export function getRealtimeDb() {
  return null
}

export function initializeApp() { return null }
export function getApp() { return null }
export function initializeFirestore() { return null }
export function getFirestore() { return null }
export function persistentLocalCache() { return null }
export function persistentMultipleTabManager() { return null }
export function initializeAppCheck() { return null }
export function ReCaptchaV3Provider() { return null }
export function getDatabase() { return null }
export function validateEnvVars() { return { isValid: true } }
export function getEnvErrorMessage() { return '' }
