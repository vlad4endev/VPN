import { useState, useCallback } from 'react'
import { dashboardService } from '../services/dashboardService.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Платежи пользователя (Firestore через dashboardService).
 * currentUser — объект пользователя; dashboardTab зарезервирован для ленивой подгрузки по вкладке.
 */
export function usePayments(currentUser, _dashboardTab) {
  const [payments, setPayments] = useState([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)

  const loadPayments = useCallback(async () => {
    const uid = currentUser?.id
    if (!uid) return
    setPaymentsLoading(true)
    try {
      const list = await dashboardService.loadPayments(uid)
      setPayments(Array.isArray(list) ? list : [])
    } catch (e) {
      logger.error('Dashboard', 'Ошибка загрузки платежей', { userId: uid }, e)
      setPayments([])
    } finally {
      setPaymentsLoading(false)
    }
  }, [currentUser?.id])

  return { payments, paymentsLoading, loadPayments }
}
