import { collection, getDocs, doc, setDoc, updateDoc, query, orderBy, where } from 'firebase/firestore'
import { db } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'
import logger from '../../../shared/utils/logger.js'

const REVIEWS_COLLECTION = `artifacts/${APP_ID}/public/data/reviews`
const REVIEWS_PATH = ['artifacts', APP_ID, 'public', 'data', 'reviews']

/**
 * Сервис отзывов пользователей.
 * Отзывы проходят модерацию; на лендинг попадают только одобренные.
 */
export const reviewsService = {
  /**
   * Загрузить все отзывы (для админки)
   * @returns {Promise<Array<{ id, userId, userEmail, author, rating, text, status, createdAt, moderatedAt?, moderatedBy? }>>}
   */
  async getAllReviews() {
    if (!db) throw new Error('База данных недоступна')
    try {
      const coll = collection(db, ...REVIEWS_PATH)
      const q = query(coll, orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      const list = []
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() })
      })
      logger.info('Reviews', `Загружено отзывов: ${list.length}`)
      return list
    } catch (err) {
      logger.error('Reviews', 'Ошибка загрузки отзывов', { code: err.code }, err)
      throw err
    }
  },

  /**
   * Проверить, оставлял ли пользователь отзыв (по userId)
   * @param {string} userId - ID пользователя
   * @returns {Promise<boolean>} true если у пользователя есть хотя бы один отзыв в разделе отзывов
   */
  async hasUserReview(userId) {
    if (!db || !userId) return false
    try {
      const coll = collection(db, ...REVIEWS_PATH)
      const q = query(coll, where('userId', '==', userId))
      const snapshot = await getDocs(q)
      return !snapshot.empty
    } catch (err) {
      logger.error('Reviews', 'Ошибка проверки отзыва пользователя', { userId, code: err.code }, err)
      return false
    }
  },

  /**
   * Загрузить только одобренные отзывы (для лендинга)
   * @returns {Promise<Array<{ id, author, rating, text, date }>>}
   */
  async getApprovedReviews() {
    if (!db) return []
    try {
      const coll = collection(db, ...REVIEWS_PATH)
      // Явный запрос по status — для гостей правила Firestore разрешают читать только approved
      const q = query(coll, where('status', '==', 'approved'), orderBy('moderatedAt', 'desc'))
      const snapshot = await getDocs(q)
      const list = []
      snapshot.forEach((d) => {
        const data = d.data()
        list.push({
          id: d.id,
          author: data.author || data.userEmail || 'Пользователь',
          rating: data.rating ?? 5,
          text: data.text || '',
          date: data.moderatedAt || data.createdAt,
        })
      })
      // moderatedAt уже в порядке убывания из запроса; сортировка по date на случай отсутствия индекса
      list.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      logger.info('Reviews', `Загружено одобренных отзывов для лендинга: ${list.length}`)
      return list
    } catch (err) {
      // Если нет индекса по (status, moderatedAt), пробуем без orderBy
      if (err?.code === 'failed-precondition' || err?.message?.includes('index')) {
        try {
          const coll = collection(db, ...REVIEWS_PATH)
          const q = query(coll, where('status', '==', 'approved'))
          const snapshot = await getDocs(q)
          const list = []
          snapshot.forEach((d) => {
            const data = d.data()
            list.push({
              id: d.id,
              author: data.author || data.userEmail || 'Пользователь',
              rating: data.rating ?? 5,
              text: data.text || '',
              date: data.moderatedAt || data.createdAt,
            })
          })
          list.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
          logger.info('Reviews', `Загружено одобренных отзывов (без orderBy): ${list.length}`)
          return list
        } catch (fallbackErr) {
          logger.error('Reviews', 'Ошибка загрузки одобренных отзывов (fallback)', { code: fallbackErr.code }, fallbackErr)
          return []
        }
      }
      logger.error('Reviews', 'Ошибка загрузки одобренных отзывов', { code: err.code }, err)
      return []
    }
  },

  /**
   * Создать отзыв (пользователь из кабинета)
   */
  async createReview({ userId, userEmail, author, rating, text }) {
    if (!db) throw new Error('База данных недоступна')
    try {
      const coll = collection(db, ...REVIEWS_PATH)
      const ref = doc(coll)
      const now = new Date().toISOString()
      await setDoc(ref, {
        userId,
        userEmail: userEmail || '',
        author: author || userEmail || 'Пользователь',
        rating: Math.min(5, Math.max(1, Number(rating) || 5)),
        text: String(text || '').trim(),
        status: 'pending',
        createdAt: now,
      })
      logger.info('Reviews', 'Отзыв создан', { id: ref.id, userId })
      return ref.id
    } catch (err) {
      logger.error('Reviews', 'Ошибка создания отзыва', { userId }, err)
      throw err
    }
  },

  /**
   * Обновить статус отзыва (модерация)
   */
  async updateReviewStatus(reviewId, status, moderatedBy) {
    if (!db) throw new Error('База данных недоступна')
    if (!['approved', 'rejected'].includes(status)) {
      throw new Error('Недопустимый статус модерации')
    }
    try {
      const ref = doc(db, ...REVIEWS_PATH, reviewId)
      const now = new Date().toISOString()
      await updateDoc(ref, {
        status,
        moderatedAt: now,
        moderatedBy: moderatedBy || null,
      })
      logger.info('Reviews', 'Статус отзыва обновлён', { reviewId, status })
    } catch (err) {
      logger.error('Reviews', 'Ошибка обновления статуса отзыва', { reviewId }, err)
      throw err
    }
  },
}
