import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, XCircle, Loader2, CreditCard, Package, Calendar, Smartphone, ArrowRight } from 'lucide-react'

const PAYMENT_METHOD_LABEL = 'ЮMoney'

/**
 * Страница результата оплаты (успех или неудача).
 * Читает orderId из query, подгружает данные платежа и показывает тариф, сумму, способ оплаты и т.д.
 */
export default function PaymentResultPage({ success, onGoToDashboard }) {
  const { t } = useTranslation()
  const [payment, setPayment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const orderId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('orderId')
    : null

  useEffect(() => {
    if (!orderId) {
      setLoading(false)
      setError(t('paymentResult.orderIdRequired'))
      return
    }

    let cancelled = false
    const fetchPayment = async () => {
      try {
        const res = await fetch(`/api/payment/status/${encodeURIComponent(orderId)}`)
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(data.error || t('paymentResult.loadError'))
          setPayment(null)
          return
        }
        if (data.success && data.payment) {
          setPayment(data.payment)
          setError(null)
        } else {
          setError(data.error || t('paymentResult.loadError'))
        }
      } catch (err) {
        if (!cancelled) {
          setError(t('paymentResult.loadError'))
          setPayment(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchPayment()
    return () => { cancelled = true }
  }, [orderId, t])

  const handleGoToDashboard = () => {
    if (onGoToDashboard) {
      onGoToDashboard()
    } else {
      window.location.href = '/'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex flex-col items-center justify-center p-4 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/10 via-slate-950 to-slate-950">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-400">{t('paymentResult.loading')}</p>
      </div>
    )
  }

  const title = success ? t('paymentResult.successTitle') : t('paymentResult.failTitle')
  const Icon = success ? CheckCircle2 : XCircle
  const iconClass = success ? 'text-emerald-500' : 'text-red-500'
  const cardBorderClass = success ? 'border-emerald-800/50' : 'border-red-800/50'
  const bgClass = success ? 'bg-emerald-900/20' : 'bg-red-900/20'

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex flex-col bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/10 via-slate-950 to-slate-950 overflow-x-hidden">
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className={`w-full max-w-md bg-slate-900/90 border ${cardBorderClass} rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl`}>
          <div className="flex flex-col items-center text-center mb-6">
            <Icon className={`w-16 h-16 sm:w-20 sm:h-20 ${iconClass} mb-4`} strokeWidth={1.5} />
            <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">{title}</h1>
            {orderId && (
              <p className="text-slate-500 text-sm font-mono">{t('paymentResult.orderId')} {orderId}</p>
            )}
          </div>

          {error && !payment && (
            <div className={`mb-6 p-4 rounded-xl ${bgClass} border ${success ? 'border-emerald-800/50' : 'border-red-800/50'} text-slate-200 text-sm`}>
              {error}
            </div>
          )}

          {payment && (
            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <Package className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <div className="text-left flex-1 min-w-0">
                  <p className="text-slate-500 text-xs uppercase tracking-wider">{t('paymentResult.tariff')}</p>
                  <p className="text-white font-medium truncate">{payment.tariffName || t('subscriptionSuccess.notSpecified')}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <CreditCard className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <div className="text-left flex-1 min-w-0">
                  <p className="text-slate-500 text-xs uppercase tracking-wider">{t('paymentResult.amount')}</p>
                  <p className="text-white font-medium">{payment.amount != null ? `${Number(payment.amount).toLocaleString('ru-RU')} ₽` : '—'}</p>
                </div>
              </div>

              {payment.periodMonths != null && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                  <Calendar className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-slate-500 text-xs uppercase tracking-wider">{t('paymentResult.period')}</p>
                    <p className="text-white font-medium">
                      {payment.periodMonths === 1
                        ? t('paymentResult.periodMonth')
                        : t('paymentResult.periodMonths', { count: payment.periodMonths })}
                    </p>
                  </div>
                </div>
              )}

              {payment.devices != null && payment.devices > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                  <Smartphone className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-slate-500 text-xs uppercase tracking-wider">{t('subscriptionSuccess.devicesLabel')}</p>
                    <p className="text-white font-medium">{payment.devices}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <CreditCard className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <div className="text-left flex-1 min-w-0">
                  <p className="text-slate-500 text-xs uppercase tracking-wider">{t('paymentResult.paymentMethod')}</p>
                  <p className="text-white font-medium">{PAYMENT_METHOD_LABEL}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {success ? (
              <p className="text-slate-400 text-sm text-center mb-2">{t('paymentResult.successNote')}</p>
            ) : (
              <p className="text-slate-400 text-sm text-center mb-2">{t('paymentResult.failNote')}</p>
            )}
            <button
              type="button"
              onClick={handleGoToDashboard}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
            >
              {t('paymentResult.goToDashboard')}
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
