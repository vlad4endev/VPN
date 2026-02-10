import { Globe2, FileText, Tag, Link as LinkIcon, ShieldCheck, Info, Image as ImageIcon, Search } from 'lucide-react'

const DEFAULT_ROBOTS = 'index, follow'

function getSeo(settings) {
  return settings?.seo || {}
}

const SeoSettingsPanel = ({ settings, settingsLoading, onChange, onSave }) => {
  const seo = getSeo(settings)

  const handleFieldChange = (field) => (e) => {
    const value = e.target.value
    onChange?.(field, value)
  }

  const handleRobotsModeChange = (e) => {
    const mode = e.target.value
    const robots = mode === 'noindex' ? 'noindex, nofollow' : DEFAULT_ROBOTS
    onChange?.('robots', robots)
  }

  const currentRobots = (seo.robots || DEFAULT_ROBOTS).toLowerCase()
  const robotsMode = currentRobots.startsWith('noindex') ? 'noindex' : 'index'

  return (
    <div className="space-y-[clamp(1rem,0.8rem+1vw,2rem)]">
      <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 section-spacing-sm">
        <div className="mb-4 sm:mb-5 md:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200 mb-1.5 sm:mb-2 flex items-center gap-2">
              <Search className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
              <span className="truncate">SEO и продвижение</span>
            </h2>
            <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400">
              Управление мета‑тегами, открытым графом и индексацией. Настройки применяются ко всему сервису.
            </p>
          </div>
        </div>

        {settingsLoading ? (
          <div className="flex items-center justify-center py-8 sm:py-10 md:py-12">
            <div className="w-7 h-7 sm:w-8 sm:h-8 border-2 border-slate-600 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="space-y-6 sm:space-y-8 p-4 sm:p-5 md:p-6">
            {/* Блок: основные мета‑данные */}
            <section className="space-y-3 sm:space-y-4">
              <div className="flex items-start gap-2">
                <div className="mt-0.5">
                  <FileText className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-slate-200">Основные мета‑данные</h3>
                  <p className="text-xs sm:text-sm text-slate-500">
                    Title и description, которые видят поисковые системы и пользователи в выдаче.
                  </p>
                </div>
              </div>
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label htmlFor="seo-meta-title" className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-medium mb-1.5 sm:mb-2">
                    Meta title
                  </label>
                  <input
                    id="seo-meta-title"
                    type="text"
                    value={seo.metaTitle || ''}
                    onChange={handleFieldChange('metaTitle')}
                    className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                    placeholder="SKYFLOW — сервис с личным кабинетом и гибкими тарифами"
                  />
                </div>
                <div>
                  <label htmlFor="seo-meta-description" className="block text-slate-300 text-sm font-medium mb-1.5 sm:mb-2">
                    Meta description
                  </label>
                  <textarea
                    id="seo-meta-description"
                    rows={3}
                    value={seo.metaDescription || ''}
                    onChange={handleFieldChange('metaDescription')}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
                    placeholder="Связь без границ. Быстрый VPN и стабильный сервис SKYFLOW с личным кабинетом и гибкими тарифами."
                  />
                  <p className="mt-1 text-xs text-slate-500">Рекомендуется 120–160 символов.</p>
                </div>
                <div>
                  <label htmlFor="seo-keywords" className="block text-slate-300 text-sm font-medium mb-1.5 sm:mb-2">
                    Keywords (опционально)
                  </label>
                  <div className="relative">
                    <Tag className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="seo-keywords"
                      type="text"
                      value={seo.keywords || ''}
                      onChange={handleFieldChange('keywords')}
                      className="w-full min-h-[44px] pl-9 pr-3 sm:pl-9 sm:pr-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                      placeholder="vpn, SKYFLOW, личный кабинет, тарифы, поддержка Telegram"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Блок: Open Graph для соцсетей */}
            <section className="space-y-3 sm:space-y-4">
              <div className="flex items-start gap-2">
                <div className="mt-0.5">
                  <ImageIcon className="w-4 h-4 text-fuchsia-400" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-slate-200">Open Graph (соцсети и мессенджеры)</h3>
                  <p className="text-xs sm:text-sm text-slate-500">
                    Текст и картинка предпросмотра при шаринге ссылки.
                  </p>
                </div>
              </div>
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label htmlFor="seo-og-title" className="block text-slate-300 text-sm font-medium mb-1.5 sm:mb-2">
                    og:title
                  </label>
                  <input
                    id="seo-og-title"
                    type="text"
                    value={seo.ogTitle || ''}
                    onChange={handleFieldChange('ogTitle')}
                    className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                    placeholder="SKYFLOW — быстрый VPN и стабильный сервис"
                  />
                </div>
                <div>
                  <label htmlFor="seo-og-description" className="block text-slate-300 text-sm font-medium mb-1.5 sm:mb-2">
                    og:description
                  </label>
                  <textarea
                    id="seo-og-description"
                    rows={3}
                    value={seo.ogDescription || ''}
                    onChange={handleFieldChange('ogDescription')}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
                    placeholder="Личный кабинет, ключ и инструкции после оплаты. Точки присутствия в США, Европе и России."
                  />
                </div>
                <div>
                  <label htmlFor="seo-og-image" className="block text-slate-300 text-sm font-medium mb-1.5 sm:mb-2">
                    og:image (URL)
                  </label>
                  <div className="relative">
                    <Globe2 className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="seo-og-image"
                      type="url"
                      value={seo.ogImage || ''}
                      onChange={handleFieldChange('ogImage')}
                      className="w-full min-h-[44px] pl-9 pr-3 sm:pl-9 sm:pr-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                      placeholder="https://skypath.fun/og-image.png"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Рекомендуется минимум 1200×630 px, формат PNG или JPG.</p>
                </div>
              </div>
            </section>

            {/* Блок: индексация и canonical */}
            <section className="space-y-3 sm:space-y-4">
              <div className="flex items-start gap-2">
                <div className="mt-0.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-slate-200">Индексация и домен</h3>
                  <p className="text-xs sm:text-sm text-slate-500">
                    Управление meta robots и каноническим URL.
                  </p>
                </div>
              </div>
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <span className="block text-slate-300 text-sm font-medium mb-1.5 sm:mb-2">
                    Индексация сайта
                  </span>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 cursor-pointer hover:bg-slate-800">
                      <input
                        type="radio"
                        name="seo-robots-mode"
                        value="index"
                        checked={robotsMode === 'index'}
                        onChange={handleRobotsModeChange}
                        className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-200">Разрешить индексацию (index, follow)</span>
                    </label>
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 cursor-pointer hover:bg-slate-800">
                      <input
                        type="radio"
                        name="seo-robots-mode"
                        value="noindex"
                        checked={robotsMode === 'noindex'}
                        onChange={handleRobotsModeChange}
                        className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-200">Запретить индексацию (noindex, nofollow)</span>
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Текущее значение meta robots: <code className="font-mono text-[11px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">{seo.robots || DEFAULT_ROBOTS}</code>
                  </p>
                </div>
                <div>
                  <label htmlFor="seo-canonical-url" className="block text-slate-300 text-sm font-medium mb-1.5 sm:mb-2">
                    Канонический URL (canonical)
                  </label>
                  <div className="relative">
                    <LinkIcon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="seo-canonical-url"
                      type="url"
                      value={seo.canonicalUrl || ''}
                      onChange={handleFieldChange('canonicalUrl')}
                      className="w-full min-h-[44px] pl-9 pr-3 sm:pl-9 sm:pr-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                      placeholder="https://skypath.fun/"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Помогает склеивать зеркала и корректно показывать основной домен в выдаче.
                  </p>
                </div>
              </div>
            </section>

            {/* Подсказка */}
            <div className="flex items-start gap-2 rounded-lg sm:rounded-xl bg-slate-900 border border-slate-800 px-3 sm:px-4 py-3 sm:py-3.5">
              <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs sm:text-sm text-slate-400">
                Эти настройки хранятся в Firebase и могут использоваться для генерации meta‑тегов, Open Graph и структурированных данных
                на лендинге и внутри приложения.
              </p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2 sm:pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onSave}
                className="btn-icon-only-mobile min-h-[32px] sm:min-h-[40px] w-full sm:w-auto px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 md:py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-base touch-manipulation"
                aria-label="Сохранить SEO‑настройки"
              >
                <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 flex-shrink-0" />
                <span className="btn-text">Сохранить SEO</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SeoSettingsPanel

