import { useState } from 'react'
import { Star, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react'
import { reviewsService } from '../services/reviewsService.js'

/**
 * Мини-страница «Оставить отзыв» по отдельной ссылке (#review).
 * Доступна без авторизации; отзыв уходит на модерацию и после одобрения отображается в панели отзывов.
 *
 * @param {Object} props
 * @param {Function} props.onSetView - Переключение view (например на 'welcome')
 */
export default function PublicReviewPage({ onSetView }) {
  const [author, setAuthor] = useState('')
  const [rating, setRating] = useState(5)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || trimmed.length < 2) {
      setError('Напишите отзыв (минимум 2 символа)')
      return
    }
    if (trimmed.length > 3000) {
      setError('Текст отзыва не более 3000 символов')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await reviewsService.submitPublicReview({
        author: author.trim() || undefined,
        rating,
        text: trimmed,
      })
      setSent(true)
    } catch (err) {
      setError(err.message || 'Не удалось отправить отзыв')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center p-4 sm:p-6 selection:bg-blue-500/30">
      <div className="w-full max-w-md">
        <a
          href="#welcome"
          onClick={(e) => {
            e.preventDefault()
            if (onSetView) onSetView('welcome')
          }}
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-6 transition-colors"
        >
          <ArrowLeft size={18} />
          На главную
        </a>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-white mb-1">Оставить отзыв</h1>
          <p className="text-slate-500 text-sm mb-6">
            Ваш отзыв будет проверен модератором и может быть опубликован на главной странице.
          </p>

          {sent ? (
            <div className="py-6 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-500/20 text-green-400 mb-4">
                <CheckCircle2 size={28} />
              </div>
              <p className="text-green-400 font-semibold mb-2">Спасибо!</p>
              <p className="text-slate-400 text-sm mb-6">
                Отзыв отправлен на модерацию. После одобрения он появится в разделе отзывов.
              </p>
              <button
                type="button"
                onClick={() => onSetView?.('welcome')}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition-colors"
              >
                На главную
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="public-review-author" className="block text-slate-400 text-sm font-medium mb-1.5">
                  Ваше имя <span className="text-slate-600">(необязательно)</span>
                </label>
                <input
                  id="public-review-author"
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Как к вам обращаться"
                  maxLength={100}
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <span className="block text-slate-400 text-sm font-medium mb-2">Оценка</span>
                <div className="flex gap-1" role="group" aria-label="Оценка от 1 до 5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="p-1 rounded-lg hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-label={`${star} из 5`}
                      aria-pressed={rating >= star}
                    >
                      <Star
                        size={28}
                        className={star <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="public-review-text" className="block text-slate-400 text-sm font-medium mb-1.5">
                  Текст отзыва <span className="text-red-400" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="public-review-text"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value)
                    setError(null)
                  }}
                  placeholder="Напишите ваш отзыв (обязательно)..."
                  rows={4}
                  maxLength={3000}
                  required
                  aria-required="true"
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                />
                <p className="text-slate-600 text-xs mt-1">{text.length} / 3000</p>
              </div>

              {error && (
                <p className="text-red-400 text-sm" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !text.trim() || text.trim().length < 2}
                className="w-full min-h-[48px] px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Отправка...
                  </>
                ) : (
                  'Отправить отзыв'
                )}
              </button>
            </form>
          )}
        </div>

        <p className="text-slate-600 text-xs text-center mt-6">
          SKYFLOW — отзыв о сервисе без регистрации
        </p>
      </div>
    </div>
  )
}
