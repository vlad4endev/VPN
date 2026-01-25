import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '../lib/react-query/config.js'
import ErrorBoundary from '../shared/components/ErrorBoundary.jsx'
import App from './App.jsx'
import './index.css'
import logger from '../shared/utils/logger.js'

// Логируем старт приложения
logger.info('App', '🚀 Приложение запускается...', {
  timestamp: new Date().toISOString(),
  userAgent: navigator.userAgent,
  logLevel: logger.getLogLevel(),
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary showReset={true}>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
)

// Логируем успешную инициализацию
logger.info('App', '✅ React приложение инициализировано')
