import { useState, useRef } from 'react'
import { Shield, Globe, Check, Zap, Star, Quote, ChevronLeft, ChevronRight } from 'lucide-react'
import Footer from './Footer.jsx'

/** Порог символов: показывать «Читать далее» для длинных отзывов */
const REVIEW_EXPAND_THRESHOLD = 150

/** Цены по срокам: только 12 мес со скидкой 20% */
const TARIFFS = {
  Super: { pricePerMonth: 150, name: 'Super', devices: '1 устройство' },
  MULTI: { pricePerMonth: 250, name: 'MULTI', devices: '5 устройств' }
}

function getPrices(pricePerMonth) {
  return {
    1: { total: pricePerMonth * 1, perMonth: pricePerMonth },
    3: { total: pricePerMonth * 3, perMonth: pricePerMonth },
    6: { total: pricePerMonth * 6, perMonth: pricePerMonth },
    12: { total: Math.round(pricePerMonth * 12 * 0.8), perMonth: Math.round(pricePerMonth * 12 * 0.8 / 12) }
  }
}

/**
 * Экран приветствия (Welcome) — единственная стартовая страница для неавторизованных пользователей.
 * Разметка соответствует SEO: один h1, семантические main/header/section, aria-метки.
 *
 * @param {Object} props
 * @param {Function} props.onSetView - Переключение view ('login', 'register')
 * @param {Array<{ id: string, author: string, rating: number, text: string, date?: string }>} [props.reviews] - Одобренные отзывы
 */
export default function WelcomePage({ onSetView, reviews = [] }) {
  const [activeTariff, setActiveTariff] = useState('Super')
  const [expandedReviewIds, setExpandedReviewIds] = useState(() => new Set())
  const reviewsScrollRef = useRef(null)
  const prices = getPrices(TARIFFS[activeTariff].pricePerMonth)

  const toggleReviewExpanded = (id) => {
    setExpandedReviewIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const scrollReviews = (direction) => {
    const el = reviewsScrollRef.current
    if (!el) return
    const cardWidth = el.querySelector('article')?.offsetWidth ?? 320
    const gap = 32
    const step = (cardWidth + gap) * (direction === 'left' ? -1 : 1)
    el.scrollBy({ left: step, behavior: 'smooth' })
  }
  const durations = [
    { key: 1, label: '1 месяц' },
    { key: 3, label: '3 месяца' },
    { key: 6, label: '6 месяцев' },
    { key: 12, label: '12 месяцев' }
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 overflow-x-hidden selection:bg-blue-500/30">
      <main id="main" role="main">
        {/* Hero — экран приветствия */}
        <header className="relative pt-20 pb-16 px-4 sm:px-6 lg:px-8 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950" style={{ backgroundSize: 'cover', backgroundPosition: 'center' }} role="banner" aria-label="Главный экран">
          <div className="max-w-7xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-bold mb-8 animate-bounce" aria-hidden="true">
              <Zap size={14} /> Подписка от 150 ₽/мес
            </div>
            <h1 className="text-5xl lg:text-7xl font-black text-white mb-6 tracking-tighter italic">
              <span className="text-blue-600">SKY</span>FLOW
            </h1>
            <p className="text-xl lg:text-2xl text-white/90 max-w-2xl mx-auto mb-3 font-semibold leading-relaxed">
              Стабильная связь, даже там, где это невозможно.
            </p>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-2 leading-relaxed">
              Связь без границ. Быстрый VPN и стабильный сервис с точками присутствия по всему миру.
            </p>
            <p className="text-base text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
              Удобный личный кабинет, простая регистрация и гибкие тарифы. Начните за минуту.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button onClick={() => onSetView('register')} className="w-full sm:w-64 bg-blue-600 hover:bg-blue-500 py-5 rounded-3xl font-black text-white text-xl transition-all shadow-2xl shadow-blue-600/30 active:scale-95">
                Начать работу
              </button>
              <button onClick={() => onSetView('login')} className="w-full sm:w-64 bg-slate-900 hover:bg-slate-800 py-5 rounded-3xl font-black text-white text-xl border border-slate-800 transition-all active:scale-95">
                Войти в кабинет
              </button>
            </div>
          </div>
        </header>

        {/* Преимущества */}
        <section className="max-w-7xl mx-auto px-6 py-20 grid grid-cols-1 md:grid-cols-3 gap-8" aria-label="Преимущества">
          <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] group hover:border-blue-500/40 transition-all">
            <div className="bg-blue-500/10 w-14 h-14 rounded-2xl flex items-center justify-center text-blue-500 mb-6 group-hover:scale-110 transition-transform">
              <Shield size={28} />
            </div>
            <h2 className="text-xl font-black text-white mb-3 uppercase tracking-tight">Личный кабинет</h2>
            <p className="text-slate-500 font-medium">Ключ, инструкции и управление подпиской в одном месте. Всё необходимое после оплаты.</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] group hover:border-blue-500/40 transition-all">
            <div className="bg-blue-500/10 w-14 h-14 rounded-2xl flex items-center justify-center text-blue-500 mb-6 group-hover:scale-110 transition-transform">
              <Check size={28} />
            </div>
            <h2 className="text-xl font-black text-white mb-3 uppercase tracking-tight">Поддержка</h2>
            <p className="text-slate-500 font-medium">Помощь в Telegram в любое время. Ответим на вопросы по подключению и тарифам.</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] group hover:border-blue-500/40 transition-all">
            <div className="bg-blue-500/10 w-14 h-14 rounded-2xl flex items-center justify-center text-blue-500 mb-6 group-hover:scale-110 transition-transform">
              <Globe size={28} />
            </div>
            <h2 className="text-xl font-black text-white mb-3 uppercase tracking-tight">Локации</h2>
            <p className="text-slate-500 font-medium">Точки присутствия в США, Нидерландах, Швейцарии, Германии и России.</p>
          </div>
        </section>

        {/* Тарифы */}
        <section className="py-16 px-4 sm:px-6" aria-labelledby="welcome-tariffs-heading">
          <div className="max-w-7xl mx-auto rounded-[2.5rem] bg-slate-900/60 border border-slate-700/80 shadow-2xl shadow-blue-900/10 px-6 sm:px-8 py-12 sm:py-16">
          <div className="text-center mb-12">
            <h2 id="welcome-tariffs-heading" className="text-4xl lg:text-5xl font-black text-white mb-4 tracking-tighter">Тарифы</h2>
            {/* Переключатель тарифов */}
            <div className="inline-flex p-1 rounded-xl bg-slate-800/80 border border-slate-700" role="tablist" aria-label="Выбор тарифа">
              <button
                type="button"
                role="tab"
                aria-selected={activeTariff === 'Super'}
                onClick={() => setActiveTariff('Super')}
                className={`px-6 py-3 rounded-lg font-black text-sm uppercase tracking-wide transition-all ${activeTariff === 'Super' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                Super
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTariff === 'MULTI'}
                onClick={() => setActiveTariff('MULTI')}
                className={`px-6 py-3 rounded-lg font-black text-sm uppercase tracking-wide transition-all ${activeTariff === 'MULTI' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                MULTI
              </button>
            </div>
          </div>
          {/* Преимущества: локации проекта */}
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 mb-12 text-slate-300">
            <span className="flex items-center gap-2 font-bold">
              <Check className="text-blue-500 shrink-0" size={22} /> {TARIFFS[activeTariff].devices}
            </span>
            <span className="flex items-center gap-2 font-bold">
              <Check className="text-blue-500 shrink-0" size={22} /> Локации: Нидерланды, Россия, США, Швеция
            </span>
          </div>
          {/* Карточки по срокам (без скидок кроме 12 мес −20%) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 max-w-5xl mx-auto mb-10">
            {durations.map(({ key, label }) => {
              const { total, perMonth } = prices[key]
              const is12 = key === 12
              return (
                <div
                  key={key}
                  className={`relative bg-slate-900 p-6 rounded-2xl shadow-xl transition-transform hover:scale-[1.02] flex flex-col ${is12 ? 'border-2 border-blue-500' : 'border border-slate-800'}`}
                >
                  {is12 && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-[10px] font-black px-3 py-1.5 rounded-full uppercase text-white tracking-widest shadow-lg" aria-hidden="true">
                      −20%
                    </div>
                  )}
                  <h3 className="text-lg font-black text-white mb-2 mt-2">{label}</h3>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-3xl font-black text-blue-500">{total}</span>
                    <span className="text-slate-500 font-bold">₽</span>
                  </div>
                  <p className="text-slate-400 text-sm font-medium mb-6">{perMonth}₽/мес</p>
                  <button
                    onClick={() => onSetView('register')}
                    className={`mt-auto w-full py-4 rounded-xl font-black text-white transition-all active:scale-95 ${is12 ? 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/20' : 'bg-slate-800 hover:bg-slate-700'}`}
                  >
                    Выбрать
                  </button>
                </div>
              )
            })}
          </div>
          <p className="flex items-center justify-center gap-2 text-slate-400 font-bold text-center max-w-xl mx-auto">
            <Check className="text-blue-500 shrink-0" size={20} />
            Скидка 20% при оплате на год. Выгоднее всего покупать на 12 месяцев.
          </p>
          </div>
        </section>

        {/* Статистика: отзывы и пользователи */}
        <section className="py-16 px-6" aria-label="Статистика">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {/* Пользователей */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 text-center hover:border-blue-500/40 transition-all">
                <div className="text-5xl font-black text-blue-500 mb-2">200+</div>
                <div className="text-slate-400 font-bold uppercase tracking-wider text-sm">Пользователей</div>
              </div>
              {/* Отзывов */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 text-center hover:border-blue-500/40 transition-all">
                <div className="text-5xl font-black text-white mb-2">{reviews.length}</div>
                <div className="text-slate-400 font-bold uppercase tracking-wider text-sm">Отзывов</div>
              </div>
              {/* Средняя оценка */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 text-center hover:border-blue-500/40 transition-all">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="text-5xl font-black text-amber-400">
                    {reviews.length > 0
                      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
                      : '5.0'}
                  </span>
                  <Star size={32} className="text-amber-400 fill-amber-400" />
                </div>
                <div className="text-slate-400 font-bold uppercase tracking-wider text-sm">Средняя оценка</div>
              </div>
            </div>
          </div>
        </section>

        {/* Локации */}
        <section className="bg-slate-900/30 py-20 px-6 border-y border-slate-900" aria-label="Локации">
          <div className="max-w-7xl mx-auto text-center">
            <h2 className="text-4xl font-black text-white mb-4 leading-none italic">Точки присутствия</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-12 font-medium leading-relaxed">Узлы в США, Европе и России для удобного доступа к сервису.</p>
            <ul className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto list-none p-0 m-0">
              {['Нидерланды', 'Россия', 'США', 'Швеция'].map((city) => (
                <li key={city} className={`flex items-center justify-center min-h-[4.5rem] bg-slate-900/80 border border-slate-700/60 rounded-2xl py-4 px-5 font-bold text-white text-base shadow-sm hover:border-blue-500/30 transition-colors `}>
                  {city}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Отзывы — карусель влево/вправо, длинные тексты сворачиваются */}
        <section className="max-w-7xl mx-auto px-6 py-20" aria-labelledby="welcome-reviews-heading">
          <div className="text-center mb-12">
            <h2 id="welcome-reviews-heading" className="text-4xl lg:text-5xl font-black text-white mb-4 tracking-tighter">Оценки и Отзывы</h2>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Что говорят наши пользователи</p>
          </div>
          {reviews.length > 0 ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => scrollReviews('left')}
                aria-label="Предыдущий отзыв"
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-slate-800/90 border border-slate-700 text-white flex items-center justify-center hover:bg-slate-700 hover:border-blue-500/50 transition-all shadow-xl -translate-x-2 sm:translate-x-0"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                type="button"
                onClick={() => scrollReviews('right')}
                aria-label="Следующий отзыв"
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-slate-800/90 border border-slate-700 text-white flex items-center justify-center hover:bg-slate-700 hover:border-blue-500/50 transition-all shadow-xl translate-x-2 sm:translate-x-0"
              >
                <ChevronRight size={24} />
              </button>
              <div
                ref={reviewsScrollRef}
                className="flex gap-8 overflow-x-auto overflow-y-hidden pb-4 scroll-smooth snap-x snap-mandatory scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
                style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
                role="list"
              >
                {reviews.map((review) => {
                  const isExpanded = expandedReviewIds.has(review.id)
                  const isLong = review.text.length > REVIEW_EXPAND_THRESHOLD
                  return (
                    <article
                      key={review.id}
                      className="flex-shrink-0 w-[85vw] sm:w-[400px] lg:w-[380px] snap-start bg-slate-900/50 border border-slate-800 p-6 sm:p-8 rounded-[2.5rem] flex flex-col hover:border-blue-500/40 transition-all"
                      role="listitem"
                    >
                      <div className="flex items-center gap-1 mb-4" aria-label={`Оценка ${review.rating} из 5`}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star key={star} size={20} className={star <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-600'} />
                        ))}
                      </div>
                      <Quote size={24} className="text-blue-500/50 mb-3 flex-shrink-0" aria-hidden="true" />
                      <p
                        className={`text-slate-300 font-medium flex-1 leading-relaxed ${!isExpanded && isLong ? 'line-clamp-3' : ''}`}
                      >
                        {review.text}
                      </p>
                      {isLong && (
                        <button
                          type="button"
                          onClick={() => toggleReviewExpanded(review.id)}
                          className="mt-2 text-left text-blue-400 hover:text-blue-300 text-sm font-semibold transition-colors"
                        >
                          {isExpanded ? 'Свернуть' : 'Читать далее'}
                        </button>
                      )}
                      <footer className="flex items-center justify-between pt-4 mt-auto border-t border-slate-800">
                        <span className="font-bold text-white">{review.author}</span>
                        {review.date && (
                          <time className="text-slate-500 text-sm font-medium" dateTime={new Date(review.date).toISOString().slice(0, 10)}>
                            {new Date(review.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </time>
                        )}
                      </footer>
                    </article>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-center py-16 text-slate-500 font-medium">Отзывы скоро появятся здесь.</p>
          )}
        </section>
      </main>
      <Footer />
    </div>
  )
}
