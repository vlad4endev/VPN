import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import ErrorBoundary from '../shared/components/ErrorBoundary.jsx'
import './index.css'
import logger from '../shared/utils/logger.js'

// Lazy loading для code splitting
const App = lazy(() => import('./App.jsx'))

// Логируем старт приложения
logger.info('App', '🚀 Приложение запускается...', {
  timestamp: new Date().toISOString(),
  userAgent: navigator.userAgent,
  logLevel: logger.getLogLevel(),
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary showReset={true}>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-slate-400">Загрузка приложения...</p>
          </div>
        </div>
      }>
        <App />
      </Suspense>
    </ErrorBoundary>
  </React.StrictMode>,
)

// Логируем успешную инициализацию
logger.info('App', '✅ React приложение инициализировано')
