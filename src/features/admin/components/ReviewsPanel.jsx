import { useEffect, useState } from 'react'
import { Star, User, Mail, Calendar, CheckCircle2, XCircle, RefreshCw, Loader2, MessageSquare } from 'lucide-react'

const STATUS_LABELS = {
  pending: 'На модерации',
  approved: 'Одобрен',
  rejected: 'Отклонён',
}

const STATUS_STYLES = {
  pending: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  approved: 'bg-green-500/20 text-green-400 border-green-500/40',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/40',
}

function normalizeStatus(s) {
  return String(s || '').toLowerCase()
}

export default function ReviewsPanel({
  reviews = [],
  reviewsLoading = false,
  loadReviews,
  onApproveReview,
  onRejectReview,
  formatDate = (v) => (v ? new Date(v).toLocaleString('ru-RU') : '—'),
}) {
  const [filter, setFilter] = useState('pending')

  useEffect(() => {
    if (typeof loadReviews === 'function') loadReviews()
  }, [loadReviews])

  const filtered = filter === 'all'
    ? reviews
    : reviews.filter((r) => normalizeStatus(r.status) === filter)

  const pendingCount = reviews.filter((r) => normalizeStatus(r.status) === 'pending').length

  return (
    <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 section-spacing-sm">
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200 mb-1.5 sm:mb-2 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
            Отзывы пользователей
          </h2>
          <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400">
            Модерация отзывов. Одобренные отображаются на главной странице.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => typeof loadReviews === 'function' && loadReviews()}
            disabled={reviewsLoading}
            className="min-h-[36px] sm:min-h-[40px] px-3 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg transition-all flex items-center gap-2 text-sm"
            aria-label="Обновить список"
          >
            {reviewsLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span>Обновить</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 sm:mb-6">
        {[
          { id: 'pending', label: `На модерации${pendingCount ? ` (${pendingCount})` : ''}`, accent: !!pendingCount },
          { id: 'approved', label: 'Одобренные' },
          { id: 'rejected', label: 'Отклонённые' },
          { id: 'all', label: 'Все' },
        ].map(({ id, label, accent }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`min-h-[36px] px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === id
                ? 'bg-blue-600 text-white'
                : accent
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {reviewsLoading && reviews.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mr-2" />
          Загрузка отзывов...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 rounded-lg border border-slate-800 bg-slate-800/30">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">
            {filter === 'pending'
              ? 'Нет отзывов на модерации'
              : filter === 'all'
                ? 'Отзывов пока нет'
                : `Нет отзывов со статусом «${STATUS_LABELS[filter] || filter}»`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((review) => (
            <article
              key={review.id}
              className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 sm:p-5 flex flex-col gap-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="flex items-center gap-1 text-amber-400" title={`Оценка: ${review.rating}`}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={18}
                        className={star <= (review.rating ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}
                      />
                    ))}
                  </span>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_STYLES[normalizeStatus(review.status)] || 'bg-slate-500/20 text-slate-400'}`}
                  >
                    {STATUS_LABELS[normalizeStatus(review.status)] ?? review.status ?? '—'}
                  </span>
                </div>
                <span className="text-slate-500 text-sm flex items-center gap-1">
                  <Calendar size={14} />
                  {formatDate(review.createdAt)}
                </span>
              </div>

              <p className="text-slate-200 font-medium leading-relaxed">{review.text || '—'}</p>

              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                <span className="flex items-center gap-1.5">
                  <User size={14} />
                  {review.author || 'Пользователь'}
                </span>
                {review.userEmail && (
                  <span className="flex items-center gap-1.5">
                    <Mail size={14} />
                    {review.userEmail}
                  </span>
                )}
              </div>

              {normalizeStatus(review.status) === 'pending' && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700">
                  <button
                    onClick={() => onApproveReview?.(review.id)}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <CheckCircle2 size={16} />
                    Одобрить (показать на лендинге)
                  </button>
                  <button
                    onClick={() => onRejectReview?.(review.id)}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-red-600/80 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <XCircle size={16} />
                    Отклонить
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
