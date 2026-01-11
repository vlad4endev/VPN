import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore'
import { useFirebase } from '../../../shared/hooks/useFirebase.js'
import { APP_ID } from '../../../shared/constants/app.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Хук для получения тарифов
 */
export function useTariffs() {
  const { db } = useFirebase()

  return useQuery({
    queryKey: ['tariffs'],
    queryFn: async () => {
      if (!db) throw new Error('Firebase не инициализирован')

      // Загружаем тарифы из коллекции, настроенной админом
      // Путь: artifacts/{APP_ID}/public/data/tariffs
      const tariffsRef = collection(db, `artifacts/${APP_ID}/public/data/tariffs`)
      const snapshot = await getDocs(tariffsRef)

      const tariffs = []
      snapshot.forEach((doc) => {
        tariffs.push({ id: doc.id, ...doc.data() })
      })

      // Фильтруем только SUPER и MULTI
      const filtered = tariffs.filter((t) => {
        const plan = t.plan?.toLowerCase()
        const name = t.name?.toLowerCase()
        return plan === 'super' || plan === 'multi' || name === 'super' || name === 'multi'
      })

      logger.info('Tariffs', 'Тарифы загружены', { 
        total: tariffs.length, 
        filtered: filtered.length 
      })
      return filtered
    },
    enabled: !!db,
    staleTime: 10 * 60 * 1000, // 10 минут (тарифы редко меняются)
  })
}

/**
 * Хук для сохранения тарифа
 */
export function useSaveTariff() {
  const { db, auth } = useFirebase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ tariffId, tariff }) => {
      if (!db || !auth.currentUser) {
        throw new Error('Не авторизован или Firebase не инициализирован')
      }

      // Сохраняем тариф в коллекцию, настроенную админом
      // Путь: artifacts/{APP_ID}/public/data/tariffs
      const tariffRef = doc(db, `artifacts/${APP_ID}/public/data/tariffs`, tariffId)
      await setDoc(tariffRef, {
        ...tariff,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser.uid,
      }, { merge: true })

      logger.info('Tariffs', 'Тариф сохранен', { tariffId })
      return { tariffId, tariff }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tariffs'] })
    },
  })
}

/**
 * Хук для удаления тарифа
 */
export function useDeleteTariff() {
  const { db } = useFirebase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ tariffId }) => {
      if (!db) throw new Error('Firebase не инициализирован')

      // Удаляем тариф из коллекции, настроенной админом
      // Путь: artifacts/{APP_ID}/public/data/tariffs
      const tariffRef = doc(db, `artifacts/${APP_ID}/public/data/tariffs`, tariffId)
      await deleteDoc(tariffRef)

      logger.info('Tariffs', 'Тариф удален', { tariffId })
      return { tariffId }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tariffs'] })
    },
  })
}

