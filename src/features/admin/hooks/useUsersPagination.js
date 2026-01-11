import { useFirestorePagination } from '../../../shared/hooks/useFirestorePagination.js'
import { useFirebase } from '../../../shared/hooks/useFirebase.js'
import { APP_ID } from '../../../shared/constants/app.js'
import { where } from 'firebase/firestore'

/**
 * Хук для пагинации пользователей с фильтрацией
 * 
 * @param {Object} filters - Фильтры для запроса
 * @param {string} filters.role - Фильтр по роли
 * @param {string} filters.status - Фильтр по статусу
 * 
 * @returns {Object} Объект с данными и методами пагинации
 */
export function useUsersPagination(filters = {}) {
  const { db } = useFirebase()
  
  // Проверяем, что db доступен
  if (!db) {
    return {
      data: [],
      loading: false,
      error: 'База данных недоступна',
      hasMore: false,
      isFirstPage: true,
      canGoBack: false,
      loadNextPage: () => {},
      loadPreviousPage: () => {},
      reset: () => {},
      reload: () => {}
    }
  }
  
  const collectionPath = `artifacts/${APP_ID}/public/data/users_v4`
  
  // Строим условия where на основе фильтров
  const whereConditions = []
  if (filters.role) {
    whereConditions.push(where('role', '==', filters.role))
  }
  if (filters.status) {
    whereConditions.push(where('status', '==', filters.status))
  }

  return useFirestorePagination(db, collectionPath, {
    pageSize: 20,
    orderByField: 'createdAt',
    orderDirection: 'desc',
    whereConditions
  })
}

