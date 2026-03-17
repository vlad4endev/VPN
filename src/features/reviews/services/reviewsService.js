import { supabase } from '../../../lib/supabase/client.js'
import { APP_ID } from '../../../shared/constants/app.js'
import { getApiBaseUrl } from '../../../shared/utils/apiBase.js'
import logger from '../../../shared/utils/logger.js'

const TABLE = 'vpn_firestore_documents'

export const reviewsService = {
  async getAllReviews() {
    if (!supabase) throw new Error('База данных недоступна')
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('app_id', APP_ID)
      .eq('collection_name', 'reviews')
      .order('source_created_at', { ascending: false })

    if (error) throw error
    return (data || []).map((d) => ({ id: d.document_id, ...d.data }))
  },

  async hasUserReview(userId) {
    if (!supabase || !userId) return false
    const { data } = await supabase
      .from(TABLE)
      .select('document_id')
      .eq('app_id', APP_ID)
      .eq('collection_name', 'reviews')
      .contains('data', { userId })
      .limit(1)

    return data && data.length > 0
  },

  async getApprovedReviews() {
    if (!supabase) return []
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('app_id', APP_ID)
        .eq('collection_name', 'reviews')
        .contains('data', { status: 'approved' })
        .order('source_updated_at', { ascending: false })

      if (error) throw error

      return (data || []).map((d) => ({
        id: d.document_id,
        author: d.data?.author || d.data?.userEmail || 'Пользователь',
        rating: d.data?.rating ?? 5,
        text: d.data?.text || '',
        date: d.data?.moderatedAt || d.data?.createdAt,
      })).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    } catch (err) {
      logger.error('Reviews', 'Ошибка загрузки одобренных отзывов', null, err)
      return []
    }
  },

  async createReview({ userId, userEmail, author, rating, text }) {
    if (!supabase) throw new Error('База данных недоступна')
    const reviewId = crypto.randomUUID()
    const now = new Date().toISOString()
    const reviewData = {
      userId,
      userEmail: userEmail || '',
      author: author || userEmail || 'Пользователь',
      rating: Math.min(5, Math.max(1, Number(rating) || 5)),
      text: String(text || '').trim(),
      status: 'pending',
      createdAt: now,
    }

    const { error } = await supabase.from(TABLE).insert({
      app_id: APP_ID,
      document_path: `artifacts/${APP_ID}/public/data/reviews/${reviewId}`,
      collection_path: `artifacts/${APP_ID}/public/data/reviews`,
      collection_name: 'reviews',
      document_id: reviewId,
      data: reviewData,
      source_created_at: now,
    })

    if (error) throw error
    logger.info('Reviews', 'Отзыв создан', { id: reviewId, userId })
    return reviewId
  },

  async submitPublicReview({ author, rating, text }) {
    const base = getApiBaseUrl()
    const res = await fetch(`${base}/api/public/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: author || '', rating: rating ?? 5, text: String(text || '').trim() }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Не удалось отправить отзыв')
    return data
  },

  async updateReviewStatus(reviewId, status, moderatedBy) {
    if (!supabase) throw new Error('База данных недоступна')
    if (!['approved', 'rejected'].includes(status)) throw new Error('Недопустимый статус модерации')

    const { data: existing } = await supabase
      .from(TABLE)
      .select('data')
      .eq('document_id', reviewId)
      .eq('collection_name', 'reviews')
      .eq('app_id', APP_ID)
      .single()

    if (!existing) throw new Error('Отзыв не найден')

    const now = new Date().toISOString()
    const { error } = await supabase
      .from(TABLE)
      .update({
        data: { ...existing.data, status, moderatedAt: now, moderatedBy: moderatedBy || null },
        source_updated_at: now,
      })
      .eq('document_id', reviewId)
      .eq('collection_name', 'reviews')
      .eq('app_id', APP_ID)

    if (error) throw error
    logger.info('Reviews', 'Статус отзыва обновлён', { reviewId, status })
  },
}
