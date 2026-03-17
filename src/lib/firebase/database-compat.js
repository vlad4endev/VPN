/**
 * Firebase Realtime Database compatibility shim.
 * Returns no-op stubs since Realtime DB features are not used in Supabase migration.
 */

export function ref() { return null }
export function onValue() { return () => {} }
export function off() {}
export function set() { return Promise.resolve() }
export function update() { return Promise.resolve() }
export function getDatabase() { return null }
