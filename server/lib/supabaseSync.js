import { getSupabaseAdmin } from './supabaseAdmin.js'

function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function syncUserToSupabase({ uid, appId, userData }) {
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, skipped: true, reason: 'not_configured' }
  if (!uid || !appId || !userData) return { ok: false, skipped: true, reason: 'invalid_input' }

  const payload = {
    uid,
    app_id: appId,
    email: userData.email ?? null,
    name: userData.name ?? null,
    phone: userData.phone ?? null,
    role: userData.role ?? null,
    plan: userData.plan ?? null,
    uuid: userData.uuid ?? null,
    sub_id: userData.subId ?? null,
    expires_at: parseDate(userData.expiresAt),
    tariff_id: userData.tariffId ?? null,
    tariff_name: userData.tariffName ?? null,
    photo_url: userData.photoURL ?? null,
    language: userData.language ?? null,
    referred_by: userData.referredBy ?? null,
    raw: userData,
    source_created_at: parseDate(userData.createdAt),
    source_updated_at: parseDate(userData.updatedAt),
    migrated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('vpn_users').upsert(payload, { onConflict: 'uid' })
  if (error) throw error
  return { ok: true }
}
