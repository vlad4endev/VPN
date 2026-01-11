import React, { useEffect, useRef, useCallback } from 'react'

/**
 * Компонент списка с бесконечной прокруткой
 * 
 * @param {Array} data - Массив данных для отображения
 * @param {boolean} loading - Состояние загрузки
 * @param {boolean} hasMore - Есть ли еще данные для загрузки
 * @param {Function} onLoadMore - Callback для загрузки следующей страницы
 * @param {Function} renderItem - Функция для рендеринга элемента списка
 * @param {number} threshold - Расстояние до конца списка для загрузки следующей страницы (в пикселях)
 * @param {string} emptyMessage - Сообщение при пустом списке
 * @param {string} loadingMessage - Сообщение при загрузке
 * @param {string} endMessage - Сообщение когда все данные загружены
 */
export function InfiniteScrollList({
  data,
  loading,
  hasMore,
  onLoadMore,
  renderItem,
  threshold = 200,
  emptyMessage = 'Нет данных',
  loadingMessage = 'Загрузка...',
  endMessage = 'Все данные загружены'
}) {
  const observerRef = useRef(null)
  const sentinelRef = useRef(null)

  // Callback для Intersection Observer
  const handleObserver = useCallback((entries) => {
    const [target] = entries
    if (target.isIntersecting && hasMore && !loading) {
      onLoadMore()
    }
  }, [hasMore, loading, onLoadMore])

  // Настройка Intersection Observer
  useEffect(() => {
    const options = {
      root: null,
      rootMargin: `${threshold}px`,
      threshold: 0.1
    }

    observerRef.current = new IntersectionObserver(handleObserver, options)

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current)
    }

    return () => {
      if (observerRef.current && sentinelRef.current) {
        observerRef.current.unobserve(sentinelRef.current)
      }
    }
  }, [handleObserver, threshold])

  if (data.length === 0 && !loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Список элементов */}
      {data.map((item) => renderItem(item))}

      {/* Sentinel элемент для отслеживания прокрутки */}
      <div ref={sentinelRef} className="h-4" />

      {/* Индикаторы состояния */}
      {loading && (
        <div className="p-4 text-center text-gray-500">
          <div className="flex items-center justify-center">
            <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {loadingMessage}
          </div>
        </div>
      )}

      {!hasMore && data.length > 0 && (
        <div className="p-4 text-center text-gray-500 text-sm">
          {endMessage}
        </div>
      )}
    </div>
  )
}

