import { useEffect } from 'react'
import { Loader2, CreditCard, Wallet } from 'lucide-react'

/**
 * Модальное окно обработки платежа
 * Показывается во время генерации ссылки на оплату
 */
const PaymentProcessingModal = ({ 
  onClose,
  message = 'Формируем подписку...'
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

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-md"
      onClick={(e) => {
        // Не закрываем при клике вне модального окна
        e.stopPropagation()
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
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-16 h-16 sm:w-20 sm:h-20 text-blue-500 animate-spin" />
              </div>
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <CreditCard className="w-8 h-8 sm:w-10 sm:h-10 text-blue-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Сообщение */}
          <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 flex items-center justify-center gap-2">
            <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400 animate-pulse" />
            {message}
          </h3>
          
          <p className="text-slate-400 text-sm sm:text-base mt-4">
            Пожалуйста, подождите, формируем ссылку на оплату...
          </p>

          {/* Анимация точек */}
          <div className="flex justify-center gap-1 mt-6">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PaymentProcessingModal
