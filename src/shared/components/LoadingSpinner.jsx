/**
 * Компонент загрузки для использования в Suspense fallback
 * Легкий компонент для отображения состояния загрузки
 */

export default function LoadingSpinner({ message = 'Загрузка...', size = 'lg' }) {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="text-center">
        <div 
          className={`inline-block animate-spin rounded-full border-t-2 border-b-2 border-blue-600 mb-4 ${sizeClasses[size]}`}
          role="status"
          aria-label="Загрузка"
        >
          <span className="sr-only">{message}</span>
        </div>
        <p className="text-slate-400">{message}</p>
      </div>
    </div>
  )
}

