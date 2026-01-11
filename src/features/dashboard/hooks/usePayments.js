import { useQuery } from '@tanstack/react-query'
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore'
import { useFirebase } from '../../../shared/hooks/useFirebase.js'
import { APP_ID } from '../../../shared/constants/app.js'

/**
 * Хук для получения платежей пользователя
 */
export function usePayments(userId) {
  const { db } = useFirebase()

  return useQuery({
    queryKey: ['payments', userId],
    queryFn: async () => {
      if (!db || !userId) return []

      const paymentsRef = collection(db, `artifacts/${APP_ID}/payments`)
      const q = query(
        paymentsRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(50)
      )

      const snapshot = await getDocs(q)
      const payments = []
      snapshot.forEach((doc) => {
        payments.push({ id: doc.id, ...doc.data() })
      })

      return payments
    },
    enabled: !!db && !!userId,
    staleTime: 2 * 60 * 1000, // 2 минуты
  })
}
