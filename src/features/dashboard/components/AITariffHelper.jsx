import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Sparkles, ChevronRight, Loader2 } from 'lucide-react'
import { getApiBaseUrl } from '../../../shared/utils/apiBase.js'

/**
 * Подбор тарифа с помощью ИИ: пошаговые вопросы с кнопками.
 * Определяет тариф по правилам, опционально запрашивает объяснение от ИИ.
 */
const QUESTIONS = [
  {
    id: 'devices',
    key: 'aiTariff.q1',
    options: [
      { value: '1', key: 'aiTariff.devices1', tariffHint: 'super' },
      { value: '2-3', key: 'aiTariff.devices2_3', tariffHint: null },
      { value: '4-5', key: 'aiTariff.devices4_5', tariffHint: 'multi' },
      { value: '5+', key: 'aiTariff.devices5plus', tariffHint: 'multi' },
    ],
  },
  {
    id: 'usage',
    key: 'aiTariff.q2',
    options: [
      { value: 'phone', key: 'aiTariff.usagePhone', tariffHint: 'super' },
      { value: 'home', key: 'aiTariff.usageHome', tariffHint: 'multi' },
      { value: 'both', key: 'aiTariff.usageBoth', tariffHint: 'megamix' },
    ],
  },
  {
    id: 'priority',
    key: 'aiTariff.q3',
    options: [
      { value: 'price', key: 'aiTariff.priorityPrice', tariffHint: null },
      { value: 'support', key: 'aiTariff.prioritySupport', tariffHint: 'super' },
      { value: 'devices', key: 'aiTariff.priorityDevices', tariffHint: 'multi' },
    ],
  },
]

function resolveTariffFromAnswers(answers, tariffs) {
  const devices = answers.devices
  const usage = answers.usage
  const priority = answers.priority

  const superTariff = tariffs?.find(t => (t.name || '').toLowerCase() === 'super' || (t.plan || '').toLowerCase() === 'super')
  const multiTariff = tariffs?.find(t => (t.name || '').toLowerCase() === 'multi' || (t.plan || '').toLowerCase() === 'multi')
  const megamixTariff = tariffs?.find(t => (t.name || '').toLowerCase() === 'megamix')

  if (usage === 'both') return megamixTariff || superTariff
  if (usage === 'home' && devices !== '1') return multiTariff
  if (usage === 'phone' && devices === '1') return superTariff
  if (devices === '4-5' || devices === '5+') return multiTariff
  if (devices === '2-3' && usage === 'home') return multiTariff
  if (devices === '2-3' && usage === 'phone') return superTariff
  if (devices === '2-3' && priority === 'devices') return multiTariff
  if (devices === '2-3' && priority === 'support') return superTariff
  if (devices === '2-3') return multiTariff
  if (devices === '1') return superTariff

  return superTariff || multiTariff
}

const AITariffHelper = ({ tariffs, onSelectTariff, onClose }) => {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [loadingExplanation, setLoadingExplanation] = useState(false)
  const [explanation, setExplanation] = useState(null)

  const currentQuestion = QUESTIONS[step]
  const isLastStep = step === QUESTIONS.length - 1

  const handleAnswer = (option) => {
    const newAnswers = { ...answers, [currentQuestion.id]: option.value }
    setAnswers(newAnswers)

    if (isLastStep) {
      const recommended = resolveTariffFromAnswers(newAnswers, tariffs)
      setResult(recommended)
      if (recommended) {
        setLoadingExplanation(true)
        fetchExplanation(newAnswers, recommended)
          .then(text => setExplanation(text))
          .catch(() => setExplanation(null))
          .finally(() => setLoadingExplanation(false))
      }
    } else {
      setStep(s => s + 1)
    }
  }

  const fetchExplanation = async (ans, tariff) => {
    try {
      const base = getApiBaseUrl()
      const res = await fetch(`${base}/api/ai/tariff-suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: ans,
          tariffId: tariff?.id,
          tariffName: tariff?.name,
        }),
      })
      const data = await res.json()
      if (data.success && data.explanation) return data.explanation
    } catch (_) {}
    return null
  }

  const handleSelectRecommended = () => {
    if (result && onSelectTariff) {
      onSelectTariff(result)
      onClose?.()
    }
  }

  const handleBack = () => {
    if (step > 0) setStep(s => s - 1)
    else if (result) {
      setResult(null)
      setExplanation(null)
      setStep(0)
      setAnswers({})
    }
  }

  const handleStartOver = () => {
    setStep(0)
    setAnswers({})
    setResult(null)
    setExplanation(null)
  }

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-slate-800 rounded-2xl border border-slate-600 shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
          <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                {t('aiTariff.recommendation', 'Рекомендация')}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
                aria-label={t('common.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-700 mb-4">
              <p className="text-slate-400 text-sm mb-2">{t('aiTariff.forYou', 'Для вас подойдёт')}</p>
              <p className="text-xl font-bold text-blue-400">{result.name}</p>
              <p className="text-slate-500 text-sm mt-1">
                {result.price} {t('dashboard.perMonthShort')}
              </p>
            </div>

            {loadingExplanation ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm py-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('aiTariff.generatingExplanation', 'ИИ готовит объяснение...')}
              </div>
            ) : explanation ? (
              <p className="text-slate-300 text-sm leading-relaxed mb-4 whitespace-pre-wrap">{explanation}</p>
            ) : (
              <p className="text-slate-400 text-sm mb-4">
                {t('aiTariff.recommendationHint', 'Тариф подобран на основе ваших ответов. Нажмите «Выбрать» для оформления подписки.')}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleSelectRecommended}
                className="flex-1 min-h-[44px] px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {t('aiTariff.selectTariff', 'Выбрать тариф')}
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleStartOver}
                className="min-h-[44px] px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium rounded-xl transition-colors"
              >
                {t('aiTariff.startOver', 'Пройти заново')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-2xl border border-slate-600 shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              {t('aiTariff.title', 'Подбор тарифа с ИИ')}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
              aria-label={t('common.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-2 flex gap-1">
            {QUESTIONS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= step ? 'bg-blue-500' : 'bg-slate-700'
                }`}
                aria-hidden
              />
            ))}
          </div>

          <p className="text-slate-300 font-medium mb-4">
            {t(currentQuestion.key)}
          </p>

          <div className="space-y-2">
            {currentQuestion.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleAnswer(opt)}
                className="w-full min-h-[48px] px-4 py-3 text-left bg-slate-700/80 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 rounded-xl text-slate-200 font-medium transition-all flex items-center justify-between gap-2"
              >
                <span>{t(opt.key)}</span>
                <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
              </button>
            ))}
          </div>

          {step > 0 && (
            <button
              type="button"
              onClick={handleBack}
              className="mt-4 text-slate-400 hover:text-white text-sm font-medium"
            >
              ← {t('common.back')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default AITariffHelper
