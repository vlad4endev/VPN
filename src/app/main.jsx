import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '../lib/react-query/config.js'
import ErrorBoundary from '../shared/components/ErrorBoundary.jsx'
import App from './App.jsx'
import './index.css'
import '../i18n'
import logger from '../shared/utils/logger.js'
import { initGlobalErrorReporting } from '../shared/services/reportErrorService.js'

logger.debug('App', 'Запуск приложения', {
  timestamp: new Date().toISOString(),
  logLevel: logger.getLogLevel(),
})

initGlobalErrorReporting()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary showReset={true}>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
)

logger.debug('App', 'React приложение инициализировано')
