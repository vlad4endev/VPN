import { useEffect } from 'react'
import { Loader2, CreditCard, Wallet, AlertCircle, CheckCircle2 } from 'lucide-react'

/**
 * Модальное окно обработки платежа
 * Показывается во время генерации ссылки на оплату и проверки статуса
 */
const PaymentProcessingModal = ({ 
  onClose,
  message = 'Бухгалтер создает платежку',
  status = 'processing' // 'processing', 'waiting', 'checking', 'error', 'success'
}) => {
  // Предотвращаем закрытие модального окна кликом вне его
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        // Не закрываем при Escape, так как идет обработка платежа
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  // Определяем цвет и иконку в зависимости от статуса
  const getStatusStyles = () => {
    switch (status) {
      case 'waiting':
        return {
          iconColor: 'text-yellow-400',
          bgColor: 'bg-yellow-500/20',
          loaderColor: 'text-yellow-500'
        }
      case 'checking':
        return {
          iconColor: 'text-blue-400',
          bgColor: 'bg-blue-500/20',
          loaderColor: 'text-blue-500'
        }
      case 'error':
        return {
          iconColor: 'text-red-400',
          bgColor: 'bg-red-500/20',
          loaderColor: 'text-red-500'
        }
      case 'success':
        return {
          iconColor: 'text-green-400',
          bgColor: 'bg-green-500/20',
          loaderColor: 'text-green-500'
        }
      default:
        return {
          iconColor: 'text-blue-400',
          bgColor: 'bg-blue-500/20',
          loaderColor: 'text-blue-500'
        }
    }
  }

  const styles = getStatusStyles()

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-md"
      onClick={(e) => {
        // Не закрываем при клике вне модального окна во время обработки
        if (status !== 'error') {
          e.stopPropagation()
        }
      }}
    >
      <div
        className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 sm:p-8 text-center">
          {/* Анимированная иконка загрузки */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              {status !== 'error' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className={`w-16 h-16 sm:w-20 sm:h-20 ${styles.loaderColor} animate-spin`} />
                </div>
              )}
              <div className="relative flex items-center justify-center">
                <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full ${styles.bgColor} flex items-center justify-center`}>
                  {status === 'error' ? (
                    <AlertCircle className={`w-8 h-8 sm:w-10 sm:h-10 ${styles.iconColor}`} />
                  ) : status === 'success' ? (
                    <CheckCircle2 className={`w-8 h-8 sm:w-10 sm:h-10 ${styles.iconColor}`} />
                  ) : (
                    <CreditCard className={`w-8 h-8 sm:w-10 sm:h-10 ${styles.iconColor}`} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Сообщение */}
          <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 flex items-center justify-center gap-2">
            {status === 'waiting' || status === 'checking' ? (
              <Wallet className={`w-5 h-5 sm:w-6 sm:h-6 ${styles.iconColor} animate-pulse`} />
            ) : status === 'error' ? (
              <AlertCircle className={`w-5 h-5 sm:w-6 sm:h-6 ${styles.iconColor}`} />
            ) : (
              <Wallet className={`w-5 h-5 sm:w-6 sm:h-6 ${styles.iconColor}`} />
            )}
            {message}
          </h3>
          
          {status === 'processing' && (
            <p className="text-slate-400 text-sm sm:text-base mt-4">
              Пожалуйста, подождите...
            </p>
          )}
          {status === 'waiting' && (
            <p className="text-slate-400 text-sm sm:text-base mt-4">
              Завершите оплату в открывшемся окне
            </p>
          )}
          {status === 'checking' && (
            <p className="text-slate-400 text-sm sm:text-base mt-4">
              Проверяем статус платежа...
            </p>
          )}
          {status === 'error' && (
            <p className="text-slate-400 text-sm sm:text-base mt-4">
              Пожалуйста, попробуйте оплатить снова
            </p>
          )}

          {/* Анимация точек (только для обработки/ожидания/проверки) */}
          {(status === 'processing' || status === 'waiting' || status === 'checking') && (
            <div className="flex justify-center gap-1 mt-6">
              <div className={`w-2 h-2 ${styles.loaderColor.replace('text-', 'bg-')} rounded-full animate-bounce`} style={{ animationDelay: '0ms' }}></div>
              <div className={`w-2 h-2 ${styles.loaderColor.replace('text-', 'bg-')} rounded-full animate-bounce`} style={{ animationDelay: '150ms' }}></div>
              <div className={`w-2 h-2 ${styles.loaderColor.replace('text-', 'bg-')} rounded-full animate-bounce`} style={{ animationDelay: '300ms' }}></div>
            </div>
          )}

          {/* Кнопка закрытия только для ошибки */}
          {status === 'error' && (
            <button
              onClick={onClose}
              className="mt-6 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all"
            >
              Закрыть
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default PaymentProcessingModal
