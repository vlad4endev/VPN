import { useState, useCallback, useRef } from 'react'
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  startAfter, 
  getDocs
} from 'firebase/firestore'
import logger from '../utils/logger.js'

/**
 * Хук для cursor-based pagination в Firestore
 * 
 * @param {Firestore} db - Экземпляр Firestore
 * @param {string} collectionPath - Путь к коллекции
 * @param {Object} options - Опции пагинации
 * @param {number} options.pageSize - Размер страницы (по умолчанию 10)
 * @param {string} options.orderByField - Поле для сортировки (обязательно)
 * @param {'asc' | 'desc'} options.orderDirection - Направление сортировки
 * @param {Array} options.whereConditions - Дополнительные условия where
 * 
 * @returns {Object} Объект с данными и методами пагинации
 */
export function useFirestorePagination(db, collectionPath, options = {}) {
  const {
    pageSize = 10,
    orderByField,
    orderDirection = 'desc',
    whereConditions = []
  } = options

  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [isFirstPage, setIsFirstPage] = useState(true)

  // Стек курсоров для навигации назад
  const cursorStackRef = useRef([])
  // Текущий курсор (последний документ текущей страницы)
  const lastDocRef = useRef(null)
  // Первый документ текущей страницы (для навигации назад)
  const firstDocRef = useRef(null)

  /**
   * Загрузка следующей страницы
   */
  const loadNextPage = useCallback(async () => {
    if (!db || !collectionPath || !orderByField) {
      setError('Не указаны обязательные параметры: db, collectionPath, orderByField')
      return
    }

    if (loading || !hasMore) return

    setLoading(true)
    setError(null)

    try {
      logger.info('Pagination', 'Загрузка следующей страницы', {
        collectionPath,
        pageSize,
        hasCursor: !!lastDocRef.current
      })

      // Строим базовый запрос
      // ВАЖНО: В Firestore порядок constraints важен: сначала where, потом orderBy, потом limit/startAfter
      const collectionRef = collection(db, collectionPath)
      const constraints = []

      // 1. Сначала добавляем условия where
      if (whereConditions.length > 0) {
        constraints.push(...whereConditions)
      }

      // 2. Затем добавляем orderBy
      constraints.push(orderBy(orderByField, orderDirection))

      // 3. Добавляем курсор, если это не первая страница
      if (lastDocRef.current) {
        constraints.push(startAfter(lastDocRef.current))
      }

      // 4. В конце добавляем limit
      constraints.push(limit(pageSize + 1)) // Загружаем на 1 больше для проверки hasMore

      const q = query(collectionRef, ...constraints)
      const querySnapshot = await getDocs(q)

      // Получаем все документы из snapshot
      const allDocs = querySnapshot.docs
      const totalDocs = allDocs.length

      // Проверяем, есть ли еще данные (если загрузили больше pageSize)
      const hasMoreData = totalDocs > pageSize

      // Берем только нужное количество документов (pageSize)
      const docsToUse = hasMoreData ? allDocs.slice(0, pageSize) : allDocs

      // Преобразуем в массив данных
      const documents = docsToUse.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }))

      // Обновляем курсоры
      if (docsToUse.length > 0) {
        // Сохраняем первый документ текущей страницы для навигации назад
        if (isFirstPage) {
          firstDocRef.current = docsToUse[0]
        }

        // Сохраняем последний документ как курсор для следующей страницы
        lastDocRef.current = docsToUse[docsToUse.length - 1]

        // Добавляем курсор в стек для навигации назад
        if (firstDocRef.current && lastDocRef.current) {
          cursorStackRef.current.push({
            firstDoc: firstDocRef.current,
            lastDoc: lastDocRef.current
          })
        }
      }

      setData(documents)
      setHasMore(hasMoreData)
      setIsFirstPage(false)

      logger.info('Pagination', 'Страница загружена', {
        collectionPath,
        documentsCount: documents.length,
        hasMore: hasMoreData
      })
    } catch (err) {
      logger.error('Pagination', 'Ошибка загрузки страницы', {
        collectionPath,
        error: err.message
      }, err)
      setError(err.message || 'Ошибка загрузки данных')
    } finally {
      setLoading(false)
    }
  }, [db, collectionPath, pageSize, orderByField, orderDirection, whereConditions, loading, hasMore, isFirstPage])

  /**
   * Загрузка предыдущей страницы
   */
  const loadPreviousPage = useCallback(async () => {
    if (!db || !collectionPath || !orderByField) {
      setError('Не указаны обязательные параметры')
      return
    }

    if (loading || cursorStackRef.current.length <= 1) {
      // Если в стеке только текущая страница, нельзя идти назад
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Удаляем текущую страницу из стека
      cursorStackRef.current.pop()

      // Получаем курсор предыдущей страницы
      const previousPage = cursorStackRef.current[cursorStackRef.current.length - 1]

      logger.info('Pagination', 'Загрузка предыдущей страницы', {
        collectionPath,
        pageSize,
        stackSize: cursorStackRef.current.length
      })

      const collectionRef = collection(db, collectionPath)
      const constraints = []

      // 1. Сначала добавляем условия where
      if (whereConditions.length > 0) {
        constraints.push(...whereConditions)
      }

      // 2. Затем добавляем orderBy
      constraints.push(orderBy(orderByField, orderDirection))

      // 3. Если есть курсор предыдущей страницы, используем его
      if (previousPage) {
        constraints.push(startAfter(previousPage.lastDoc))
      }

      // 4. В конце добавляем limit
      constraints.push(limit(pageSize + 1))

      const q = query(collectionRef, ...constraints)
      const querySnapshot = await getDocs(q)

      // Получаем все документы из snapshot
      const allDocs = querySnapshot.docs
      const totalDocs = allDocs.length

      // Проверяем, есть ли еще данные (если загрузили больше pageSize)
      const hasMoreData = totalDocs > pageSize

      // Берем только нужное количество документов (pageSize)
      const docsToUse = hasMoreData ? allDocs.slice(0, pageSize) : allDocs

      // Преобразуем в массив данных
      const documents = docsToUse.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }))

      // Обновляем курсоры
      if (docsToUse.length > 0) {
        lastDocRef.current = docsToUse[docsToUse.length - 1]
        firstDocRef.current = docsToUse[0]
      }

      // Проверяем, первая ли это страница
      const isFirst = cursorStackRef.current.length <= 1
      setIsFirstPage(isFirst)
      setHasMore(true) // При навигации назад всегда есть следующая страница

      setData(documents)

      logger.info('Pagination', 'Предыдущая страница загружена', {
        collectionPath,
        documentsCount: documents.length,
        isFirstPage: isFirst
      })
    } catch (err) {
      logger.error('Pagination', 'Ошибка загрузки предыдущей страницы', {
        collectionPath,
        error: err.message
      }, err)
      setError(err.message || 'Ошибка загрузки данных')
    } finally {
      setLoading(false)
    }
  }, [db, collectionPath, pageSize, orderByField, orderDirection, whereConditions, loading])

  /**
   * Сброс пагинации (вернуться к первой странице)
   */
  const reset = useCallback(() => {
    cursorStackRef.current = []
    lastDocRef.current = null
    firstDocRef.current = null
    setData([])
    setHasMore(true)
    setIsFirstPage(true)
    setError(null)
  }, [])

  /**
   * Перезагрузка текущей страницы
   */
  const reload = useCallback(() => {
    reset()
    loadNextPage()
  }, [reset, loadNextPage])

  return {
    data,
    loading,
    error,
    hasMore,
    isFirstPage,
    canGoBack: cursorStackRef.current.length > 1,
    loadNextPage,
    loadPreviousPage,
    reset,
    reload
  }
}

