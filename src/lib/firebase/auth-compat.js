/**
 * Firebase Auth compatibility shim backed by Supabase.
 * Provides the same function signatures so App.jsx and useTelegramInit.js compile.
 */
import { supabase } from '../supabase/client.js'

export async function signInWithCustomToken(auth, token) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signInWithPassword({
    email: '_custom_token_@placeholder.local',
    password: token,
  }).catch(() => ({ data: null, error: new Error('Custom token sign-in not supported with Supabase. Use email/password or magic link.') }))
  if (error) throw error
  return { user: data?.user }
}

export async function signInWithEmailAndPassword(auth, email, password) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return { user: data.user }
}

export async function createUserWithEmailAndPassword(auth, email, password) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return { user: data.user }
}

export async function signOut(auth) {
  if (!supabase) return
  await supabase.auth.signOut()
}

export async function updateProfile(user, profile) {
  if (!supabase) return
  await supabase.auth.updateUser({ data: profile })
}

export async function sendPasswordResetEmail(auth, email) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.auth.resetPasswordForEmail(email)
  if (error) throw error
}

export function onAuthStateChanged(auth, callback) {
  if (!supabase) {
    callback(null)
    return () => {}
  }

  supabase.auth.getSession().then(({ data: { session } }) => {
    callback(session?.user ?? null)
  })

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null)
  })

  return () => subscription.unsubscribe()
}

export function getAuth() {
  return null
}

export function setPersistence() {
  return Promise.resolve()
}

export const browserLocalPersistence = 'LOCAL'

export class GoogleAuthProvider {
  constructor() { this.providerId = 'google.com' }
  addScope() {}
}

export async function signInWithPopup(auth, provider) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google' })
  if (error) throw error
  return { user: data?.user }
}

export async function signInWithRedirect(auth, provider) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' })
  if (error) throw error
}

export async function getRedirectResult() {
  return null
}

export async function fetchSignInMethodsForEmail() {
  return []
}
