/**
 * Error Boundary для обработки ошибок загрузки ленивых компонентов
 * Обрабатывает ошибки рендеринга и загрузки компонентов
 */

import { Component } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null
    }
  }

  static getDerivedStateFromError(error) {
    return { 
      hasError: true, 
      error,
      errorInfo: null
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({
      error,
      errorInfo
    })
    
    // Здесь можно отправить ошибку в систему мониторинга (Sentry, etc.)
    // logErrorToService(error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ 
      hasError: false, 
      error: null,
      errorInfo: null 
    })
  }

  render() {
    if (this.state.hasError) {
      // Если передан кастомный fallback, используем его
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Стандартный UI ошибки
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
          <div className="text-center max-w-md">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-red-400 mb-2">
              Ошибка загрузки
            </h2>
            <p className="text-slate-400 mb-4">
              Не удалось загрузить компонент. Пожалуйста, попробуйте обновить страницу.
            </p>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-4 text-left bg-slate-900 p-4 rounded-lg mb-4">
                <summary className="cursor-pointer text-slate-300 mb-2">
                  Детали ошибки (только для разработки)
                </summary>
                <pre className="text-xs text-red-400 overflow-auto">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Обновить страницу
              </button>
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
              >
                Попробовать снова
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
