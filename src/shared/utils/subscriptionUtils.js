import { supabase } from '../../lib/supabase/client.js'
import { APP_ID } from '../constants/app.js'

const ACTIVE_SUBSCRIPTION_STATUSES = ['pending_payment', 'test_period', 'activating', 'active']

export async function getSubscriptionById(db, subscriptionId) {
  if (!supabase || !subscriptionId) return null

  try {
    const { data, error } = await supabase
      .from('vpn_firestore_documents')
      .select('*')
      .eq('app_id', APP_ID)
      .eq('collection_name', 'subscriptions')
      .eq('document_id', subscriptionId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data ? { id: data.document_id, ...data.data } : null
  } catch (error) {
    console.error('subscriptionUtils: Ошибка получения подписки', { subscriptionId, error: error.message })
    return null
  }
}

export async function getActiveSubscriptionByUserId(db, userId) {
  if (!supabase || !userId) return null

  try {
    const { data: userData, error: userErr } = await supabase
      .from('vpn_users')
      .select('raw')
      .eq('uid', userId)
      .eq('app_id', APP_ID)
      .single()

    if (!userErr && userData?.raw?.subscriptionId) {
      const subscription = await getSubscriptionById(db, userData.raw.subscriptionId)
      if (subscription && ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
        return subscription
      }
    }

    const { data: subs, error: subsErr } = await supabase
      .from('vpn_firestore_documents')
      .select('*')
      .eq('app_id', APP_ID)
      .eq('collection_name', 'subscriptions')
      .contains('data', { userId })

    if (subsErr) throw subsErr

    const activeSubs = (subs || [])
      .filter((s) => ACTIVE_SUBSCRIPTION_STATUSES.includes(s.data?.status))
      .map((s) => ({ id: s.document_id, ...s.data }))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())

    return activeSubs[0] || null
  } catch (error) {
    const msg = error?.message || String(error)
    console.error('subscriptionUtils: Ошибка получения активной подписки', { userId, error: msg })
    return null
  }
}
