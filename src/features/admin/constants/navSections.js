import { Users, MessageCircle, Megaphone, Server, DollarSign, CreditCard, Tag, Star, Link2, LayoutDashboard, Search, Send, AlertTriangle, Bot, TrendingDown } from 'lucide-react'

/** Подразделы админ-панели: группа → пункты меню (единый источник правды для Sidebar и AdminPanel) */
export const ADMIN_NAV_SECTIONS = [
  {
    title: 'Главная',
    items: [
      { id: 'dashboard', label: 'Дашборд', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Пользователи и поддержка',
    items: [
      { id: 'users', label: 'Пользователи', icon: Users },
      { id: 'tickets', label: 'Тикеты', icon: MessageCircle },
      { id: 'notifications', label: 'Рассылка', icon: Megaphone },
    ],
  },
  {
    title: 'Настройки',
    items: [
      { id: 'settings', label: 'Настройки', icon: Server },
      { id: 'tariffs', label: 'Тарифы', icon: DollarSign },
    ],
  },
  {
    title: 'Финансы',
    items: [
      { id: 'payments', label: 'Платежи', icon: CreditCard },
      { id: 'promocodes', label: 'Промокоды', icon: Tag },
      { id: 'reviews', label: 'Отзывы', icon: Star },
    ],
  },
  {
    title: 'Аналитика',
    items: [
      { id: 'analytics-funnel', label: 'AI-Воронка', icon: TrendingDown },
    ],
  },
  {
    title: 'Маркетинг и SEO',
    items: [
      { id: 'seo', label: 'SEO', icon: Search },
    ],
  },
  {
    title: 'Интеграции',
    items: [
      { id: 'n8n', label: 'n8n', icon: Link2 },
      { id: 'telegram', label: 'Telegram', icon: Send },
      { id: 'ai', label: 'ИИ', icon: Bot },
    ],
  },
  {
    title: 'Мониторинг',
    items: [
      { id: 'errors', label: 'Ошибки', icon: AlertTriangle },
    ],
  },
]

/** Плоский список всех пунктов (для нижней панели на мобильных) */
export const ADMIN_NAV_ITEMS = ADMIN_NAV_SECTIONS.flatMap((s) => s.items)

/** ID пунктов, которые показываются в мобильной панели отдельными кнопками (Дашборд, Пользователи, Отзывы) */
export const ADMIN_MOBILE_PRIMARY_IDS = ['dashboard', 'users', 'reviews']

/** Пункты для кнопки «Прочее» на мобильных (остальные разделы) */
export const ADMIN_MOBILE_OTHER_ITEMS = ADMIN_NAV_ITEMS.filter(
  (item) => !ADMIN_MOBILE_PRIMARY_IDS.includes(item.id)
)

/**
 * Возвращает заголовок раздела и название пункта по id таба (для шапки контента)
 * @param {string} tabId
 * @returns {{ sectionTitle: string, itemLabel: string } | null}
 */
export function getAdminSectionByTabId(tabId) {
  if (!tabId) return null
  for (const section of ADMIN_NAV_SECTIONS) {
    const item = section.items.find((i) => i.id === tabId)
    if (item) return { sectionTitle: section.title, itemLabel: item.label }
  }
  return null
}
