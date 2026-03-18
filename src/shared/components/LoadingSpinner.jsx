/**
 * Компонент загрузки для использования в Suspense fallback
 * Легкий компонент для отображения состояния загрузки
 */

export default function LoadingSpinner({ message = 'Loading...', size = 'lg' }) {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-slate-950 overflow-x-hidden">
      <div className="text-center">
        {/* role="status" сообщает скринридеру об обновлении; aria-label задаётся через sr-only параграф */}
        <div
          role="status"
          aria-label={message}
          className={`inline-block animate-spin rounded-full border-t-2 border-b-2 border-blue-600 mb-4 ${sizeClasses[size]}`}
        />
        <p className="text-slate-400" aria-hidden="true">{message}</p>
      </div>
    </div>
  )
}

