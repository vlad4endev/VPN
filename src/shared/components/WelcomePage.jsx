import { Shield, Globe, Check, Zap, Smartphone, Users, X, Star, Quote } from 'lucide-react'
import Footer from './Footer.jsx'

/**
 * Экран приветствия (Welcome) — единственная стартовая страница для неавторизованных пользователей.
 * Разметка соответствует SEO: один h1, семантические main/header/section, aria-метки.
 *
 * @param {Object} props
 * @param {Function} props.onSetView - Переключение view ('login', 'register')
 * @param {Array<{ id: string, author: string, rating: number, text: string, date?: string }>} [props.reviews] - Одобренные отзывы
 */
export default function WelcomePage({ onSetView, reviews = [] }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 overflow-x-hidden selection:bg-blue-500/30">
      <main id="main" role="main">
        {/* Hero — экран приветствия */}
        <header className="relative pt-20 pb-16 px-4 sm:px-6 lg:px-8 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950" style={{ backgroundSize: 'cover', backgroundPosition: 'center' }} role="banner" aria-label="Главный экран">
          <div className="max-w-7xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-bold mb-8 animate-bounce" aria-hidden="true">
              <Zap size={14} /> Новый стандарт анонимности
            </div>
            <h1 className="text-5xl lg:text-7xl font-black text-white mb-6 tracking-tighter italic">
              <span className="text-blue-600">SKYPATH</span> FLOW
            </h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Суперзащищенный протокол <span className="text-white font-bold">VLESS</span> и <span className="text-white font-bold">обход белых списков в России</span> для полной свободы в сети.
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
            <h2 className="text-xl font-black text-white mb-3 uppercase tracking-tight">Суперзащищенный VLESS</h2>
            <p className="text-slate-500 font-medium">Самый современный протокол передачи данных, который невозможно обнаружить современными средствами DPI.</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] group hover:border-blue-500/40 transition-all">
            <div className="bg-blue-500/10 w-14 h-14 rounded-2xl flex items-center justify-center text-blue-500 mb-6 group-hover:scale-110 transition-transform">
              <Check size={28} />
            </div>
            <h2 className="text-xl font-black text-white mb-3 uppercase tracking-tight">Обход белых списков</h2>
            <p className="text-slate-500 font-medium">Специальная технология обхода белых списков в России, разработанная для стабильной работы в любых регионах.</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] group hover:border-blue-500/40 transition-all">
            <div className="bg-blue-500/10 w-14 h-14 rounded-2xl flex items-center justify-center text-blue-500 mb-6 group-hover:scale-110 transition-transform">
              <Globe size={28} />
            </div>
            <h2 className="text-xl font-black text-white mb-3 uppercase tracking-tight">Локации</h2>
            <p className="text-slate-500 font-medium">Сервера в США, Нидерландах, Швейцарии, Германии и России для минимального пинга.</p>
          </div>
        </section>

        {/* Тарифы */}
        <section className="max-w-7xl mx-auto px-6 py-20" aria-labelledby="welcome-tariffs-heading">
          <div className="text-center mb-16">
            <h2 id="welcome-tariffs-heading" className="text-4xl lg:text-5xl font-black text-white mb-4 tracking-tighter">Выберите свой тариф</h2>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Прозрачные цены без скрытых платежей</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="relative bg-slate-900 border border-slate-800 p-10 rounded-[3rem] shadow-2xl transition-transform hover:scale-[1.02]">
              <div className="absolute top-8 right-8 bg-blue-600 text-[10px] font-black px-3 py-1 rounded-full uppercase text-white tracking-widest shadow-lg" aria-hidden="true">ХИТ</div>
              <h3 className="text-3xl font-black text-white mb-2 italic">Super</h3>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-5xl font-black text-blue-500">150</span>
                <span className="text-xl font-bold text-slate-500 italic">₽/мес</span>
              </div>
              <ul className="space-y-4 mb-10">
                <li className="flex items-center gap-3 text-slate-300 font-bold">
                  <Smartphone className="text-blue-500" size={20} /> <span>1 Устройство</span>
                </li>
                <li className="flex items-center gap-3 text-slate-300 font-bold">
                  <Check className="text-blue-500" size={20} /> <span>Обход белого списка</span>
                </li>
                <li className="flex items-center gap-3 text-slate-300 font-bold">
                  <Shield className="text-blue-500" size={20} /> <span>Протокол VLESS</span>
                </li>
              </ul>
              <button onClick={() => onSetView('register')} className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl font-black text-white transition-all shadow-xl shadow-blue-600/20 active:scale-95">Выбрать Super</button>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3rem] shadow-2xl transition-transform hover:scale-[1.02]">
              <h3 className="text-3xl font-black text-white mb-2 italic">MULTI</h3>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-5xl font-black text-blue-500">250</span>
                <span className="text-xl font-bold text-slate-500 italic">₽/мес</span>
              </div>
              <ul className="space-y-4 mb-10">
                <li className="flex items-center gap-3 text-slate-300 font-bold">
                  <Users className="text-blue-500" size={20} /> <span>5 Устройств</span>
                </li>
                <li className="flex items-center gap-3 text-slate-300 font-bold">
                  <Zap className="text-blue-500" size={20} /> <span>Высокая скорость трафика</span>
                </li>
                <li className="flex items-center gap-3 text-slate-400 font-medium">
                  <X className="text-red-500" size={20} /> <span>Без обхода белого списка</span>
                </li>
              </ul>
              <button onClick={() => onSetView('register')} className="w-full bg-slate-800 hover:bg-slate-700 py-5 rounded-2xl font-black text-white transition-all shadow-xl active:scale-95">Выбрать MULTI</button>
            </div>
          </div>
        </section>

        {/* Локации */}
        <section className="bg-slate-900/30 py-20 px-6 border-y border-slate-900" aria-label="Локации">
          <div className="max-w-7xl mx-auto text-center">
            <h2 className="text-4xl font-black text-white mb-4 leading-none italic">Глобальное покрытие серверов</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-12 font-medium leading-relaxed">Мы размещаем наши узлы в лучших дата-центрах мира для обеспечения минимальной задержки и максимальной пропускной способности.</p>
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 max-w-4xl mx-auto list-none p-0 m-0">
              {['США', 'Нидерланды', 'Швейцария', 'Германия', 'Россия'].map((city) => (
                <li key={city} className={`flex items-center justify-center min-h-[4.5rem] bg-slate-900/80 border border-slate-700/60 rounded-2xl py-4 px-5 font-bold text-white text-base shadow-sm hover:border-blue-500/30 transition-colors ${city === 'Россия' ? 'col-span-2 sm:col-span-1' : ''}`}>
                  {city}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Отзывы */}
        <section className="max-w-7xl mx-auto px-6 py-20" aria-labelledby="welcome-reviews-heading">
          <div className="text-center mb-16">
            <h2 id="welcome-reviews-heading" className="text-4xl lg:text-5xl font-black text-white mb-4 tracking-tighter">Оценки и Отзывы</h2>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Что говорят наши пользователи</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {reviews.length > 0 ? (
              reviews.map((review) => (
                <article key={review.id} className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] flex flex-col hover:border-blue-500/40 transition-all">
                  <div className="flex items-center gap-1 mb-4" aria-label={`Оценка ${review.rating} из 5`}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star key={star} size={20} className={star <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-600'} />
                    ))}
                  </div>
                  <Quote size={24} className="text-blue-500/50 mb-3" aria-hidden="true" />
                  <p className="text-slate-300 font-medium mb-6 flex-1 leading-relaxed">{review.text}</p>
                  <footer className="flex items-center justify-between pt-4 border-t border-slate-800">
                    <span className="font-bold text-white">{review.author}</span>
                    {review.date && (
                      <time className="text-slate-500 text-sm font-medium" dateTime={new Date(review.date).toISOString().slice(0, 10)}>
                        {new Date(review.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </time>
                    )}
                  </footer>
                </article>
              ))
            ) : (
              <p className="col-span-full text-center py-16 text-slate-500 font-medium">Отзывы скоро появятся здесь.</p>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
