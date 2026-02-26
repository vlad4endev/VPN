import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '../lib/react-query/config.js'
import ErrorBoundary from '../shared/components/ErrorBoundary.jsx'
import App from './App.jsx'
import './index.css'
import '../i18n'
import { i18nReady } from '../i18n'
import logger from '../shared/utils/logger.js'
import { initGlobalErrorReporting } from '../shared/services/reportErrorService.js'
import { tmaLog } from '../features/telegram/utils/tmaLogger.js'

logger.debug('App', 'Запуск приложения', {
  timestamp: new Date().toISOString(),
  logLevel: logger.getLogLevel(),
})

initGlobalErrorReporting()

const root = ReactDOM.createRoot(document.getElementById('root'))

/** Минимальный экран загрузки — показывается сразу, чтобы в Mini App и на мобильных не было чёрного экрана */
function BootstrapScreen() {
  return (
    <div
      className="min-h-screen min-h-[100dvh] w-full flex flex-col items-center justify-center bg-slate-950 p-4"
      style={{ minHeight: 'var(--vh-fill, 100dvh)' }}
    >
      <div className="inline-block w-12 h-12 border-2 border-blue-500/50 border-t-blue-400 rounded-full animate-spin mb-4" />
      <p className="text-slate-400 text-sm">Загрузка...</p>
    </div>
  )
}

const renderApp = () => {
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary showReset={true}>
          <App />
        </ErrorBoundary>
      </QueryClientProvider>
    </React.StrictMode>,
  )
  logger.debug('App', 'React приложение инициализировано')
}

// Сразу показываем загрузку (Mini App и мобильные не остаются с чёрным экраном)
root.render(<BootstrapScreen />)

// На /t (Telegram Mini App) монтируем приложение сразу, не ждём i18n — иначе «Загрузка…» висит до 8 с
const path = typeof window !== 'undefined' ? (window.location.pathname || '').replace(/\/+$/, '') : ''
const isTmaPath = path === '/t' || path === '/telegram' || path === 't' || (path.startsWith('/t/') && path.length > 3)
if (isTmaPath) {
  tmaLog('info', 'bootstrap_tma', 'Путь /t: запуск приложения без ожидания i18n', { path })
  setTimeout(renderApp, 0)
} else {
  const I18N_TIMEOUT_MS = 8000
  Promise.race([
    i18nReady,
    new Promise((resolve) => setTimeout(resolve, I18N_TIMEOUT_MS)),
  ])
    .then(() => { renderApp() })
    .catch((err) => {
      logger.warn('App', 'i18n инициализация с ошибкой, рендер без ожидания', err)
      renderApp()
    })
}
