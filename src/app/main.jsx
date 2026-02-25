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

logger.debug('App', 'Запуск приложения', {
  timestamp: new Date().toISOString(),
  logLevel: logger.getLogLevel(),
})

initGlobalErrorReporting()

const root = ReactDOM.createRoot(document.getElementById('root'))
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

// Рендерим приложение только после готовности i18n, чтобы на экране входа отображались переводы, а не ключи
i18nReady.then(renderApp).catch((err) => {
  logger.warn('App', 'i18n инициализация с ошибкой, рендер без ожидания', err)
  renderApp()
})
