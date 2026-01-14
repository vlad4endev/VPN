import React from 'react'

/**
 * Компонент списка с пагинацией
 * 
 * @param {Array} data - Массив данных для отображения
 * @param {boolean} loading - Состояние загрузки
 * @param {string} error - Сообщение об ошибке
 * @param {boolean} hasMore - Есть ли еще данные для загрузки
 * @param {boolean} isFirstPage - Является ли текущая страница первой
 * @param {boolean} canGoBack - Можно ли вернуться назад
 * @param {Function} onNextPage - Callback для загрузки следующей страницы
 * @param {Function} onPreviousPage - Callback для загрузки предыдущей страницы
 * @param {Function} renderItem - Функция для рендеринга элемента списка
 * @param {string} emptyMessage - Сообщение при пустом списке
 * @param {string} loadingMessage - Сообщение при загрузке
 */
export function PaginatedList({
  data,
  loading,
  error,
  hasMore,
  isFirstPage,
  canGoBack,
  onNextPage,
  onPreviousPage,
  renderItem,
  emptyMessage = 'Нет данных',
  loadingMessage = 'Загрузка...'
}) {
  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">Ошибка: {error}</p>
      </div>
    )
  }

  if (loading && data.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        {loadingMessage}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Список элементов */}
      <div className="space-y-2">
        {data.map((item) => renderItem(item))}
      </div>

      {/* Контролы пагинации */}
      <div className="flex items-center justify-between pt-4 border-t">
        <button
          onClick={onPreviousPage}
          disabled={isFirstPage || loading}
          className={`
            px-4 py-2 rounded-lg font-medium transition-colors
            ${isFirstPage || loading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
            }
          `}
        >
          ← Назад
        </button>

        <div className="text-sm text-gray-600">
          Загружено: {data.length} {data.length === 1 ? 'элемент' : 'элементов'}
        </div>

        <button
          onClick={onNextPage}
          disabled={!hasMore || loading}
          className={`
            px-4 py-2 rounded-lg font-medium transition-colors
            ${!hasMore || loading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
            }
          `}
        >
          Вперед →
        </button>
      </div>

      {/* Индикатор загрузки при подгрузке следующей страницы */}
      {loading && data.length > 0 && (
        <div className="text-center text-gray-500 text-sm py-2">
          Загрузка...
        </div>
      )}
    </div>
  )
}

