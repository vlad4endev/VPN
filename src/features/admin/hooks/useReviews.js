import { useState, useCallback } from 'react'
import { reviewsService } from '../../reviews/services/reviewsService.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Хук для управления отзывами в админ-панели.
 */
export function useReviews(currentUser, setError, setSuccess) {
  const [reviews, setReviews] = useState([])
  const [reviewsLoading, setReviewsLoading] = useState(false)

  const loadReviews = useCallback(async () => {
    if (!currentUser) return
    setReviewsLoading(true)
    try {
      const list = await reviewsService.getAllReviews()
      setReviews(list)
    } catch (err) {
      logger.error('Admin', 'Ошибка загрузки отзывов', null, err)
      setError?.(err.message || 'Не удалось загрузить отзывы')
    } finally {
      setReviewsLoading(false)
    }
  }, [currentUser, setError])

  const handleApproveReview = useCallback(
    async (reviewId) => {
      if (!currentUser?.id) return
      try {
        await reviewsService.updateReviewStatus(reviewId, 'approved', currentUser.id)
        setReviews((prev) =>
          prev.map((r) => (r.id === reviewId ? { ...r, status: 'approved', moderatedAt: new Date().toISOString() } : r))
        )
        setSuccess?.('Отзыв одобрен и отображается на лендинге')
      } catch (err) {
        logger.error('Admin', 'Ошибка одобрения отзыва', { reviewId }, err)
        setError?.(err.message || 'Не удалось одобрить отзыв')
      }
    },
    [currentUser?.id, setError, setSuccess]
  )

  const handleRejectReview = useCallback(
    async (reviewId) => {
      if (!currentUser?.id) return
      try {
        await reviewsService.updateReviewStatus(reviewId, 'rejected', currentUser.id)
        setReviews((prev) =>
          prev.map((r) => (r.id === reviewId ? { ...r, status: 'rejected', moderatedAt: new Date().toISOString() } : r))
        )
        setSuccess?.('Отзыв отклонён')
      } catch (err) {
        logger.error('Admin', 'Ошибка отклонения отзыва', { reviewId }, err)
        setError?.(err.message || 'Не удалось отклонить отзыв')
      }
    },
    [currentUser?.id, setError, setSuccess]
  )

  return {
    reviews,
    reviewsLoading,
    loadReviews,
    handleApproveReview,
    handleRejectReview,
  }
}
