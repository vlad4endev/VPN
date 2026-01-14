import React from 'react'

/**
 * Компонент контролов пагинации
 * 
 * @param {Function} onNext - Callback для следующей страницы
 * @param {Function} onPrevious - Callback для предыдущей страницы
 * @param {boolean} hasNext - Есть ли следующая страница
 * @param {boolean} hasPrevious - Есть ли предыдущая страница
 * @param {boolean} loading - Состояние загрузки
 * @param {number} currentCount - Количество загруженных элементов
 * @param {number} totalCount - Общее количество элементов (опционально)
 */
export function PaginationControls({
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
  loading,
  currentCount,
  totalCount = null
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200">
      <button
        onClick={onPrevious}
        disabled={!hasPrevious || loading}
        className={`
          flex items-center px-4 py-2 text-sm font-medium rounded-md
          ${!hasPrevious || loading
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }
        `}
      >
        <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Назад
      </button>

      <div className="text-sm text-gray-700">
        {currentCount > 0 && (
          <span>
            Показано <strong>{currentCount}</strong>
            {totalCount !== null && ` из ${totalCount}`} записей
          </span>
        )}
      </div>

      <button
        onClick={onNext}
        disabled={!hasNext || loading}
        className={`
          flex items-center px-4 py-2 text-sm font-medium rounded-md
          ${!hasNext || loading
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }
        `}
      >
        Вперед
        <svg className="w-5 h-5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}

