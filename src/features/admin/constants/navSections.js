import { Users, MessageCircle, Megaphone, Server, DollarSign, CreditCard, Tag, Star, Link2, LayoutDashboard, Search, Send, AlertTriangle, Bot, TrendingDown } from 'lucide-react'

/** Подразделы админ-панели: группа → пункты меню (единый источник правды для Sidebar и AdminPanel). titleKey/labelKey — ключи i18n. */
export const ADMIN_NAV_SECTIONS = [
  {
    titleKey: 'admin.sectionHome',
    items: [
      { id: 'dashboard', labelKey: 'admin.dashboard', icon: LayoutDashboard },
    ],
  },
  {
    titleKey: 'admin.sectionUsersSupport',
    items: [
      { id: 'users', labelKey: 'admin.users', icon: Users },
      { id: 'tickets', labelKey: 'admin.tickets', icon: MessageCircle },
      { id: 'notifications', labelKey: 'admin.notifications', icon: Megaphone },
    ],
  },
  {
    titleKey: 'admin.sectionSettings',
    items: [
      { id: 'settings', labelKey: 'admin.settings', icon: Server },
      { id: 'tariffs', labelKey: 'admin.tariffs', icon: DollarSign },
    ],
  },
  {
    titleKey: 'admin.sectionFinance',
    items: [
      { id: 'payments', labelKey: 'admin.payments', icon: CreditCard },
      { id: 'promocodes', labelKey: 'admin.promocodes', icon: Tag },
      { id: 'reviews', labelKey: 'admin.reviews', icon: Star },
    ],
  },
  {
    titleKey: 'admin.sectionAnalytics',
    items: [
      { id: 'analytics-funnel', labelKey: 'admin.analyticsFunnel', icon: TrendingDown },
    ],
  },
  {
    titleKey: 'admin.sectionMarketing',
    items: [
      { id: 'seo', labelKey: 'admin.seo', icon: Search },
    ],
  },
  {
    titleKey: 'admin.sectionIntegrations',
    items: [
      { id: 'n8n', labelKey: 'admin.n8n', icon: Link2 },
      { id: 'telegram', labelKey: 'admin.telegram', icon: Send },
      { id: 'ai', labelKey: 'admin.ai', icon: Bot },
    ],
  },
  {
    titleKey: 'admin.sectionMonitoring',
    items: [
      { id: 'errors', labelKey: 'admin.errors', icon: AlertTriangle },
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
 * Возвращает заголовок раздела и название пункта по id таба (для шапки контента).
 * Возвращает ключи i18n: sectionTitleKey, itemLabelKey — вызывающая сторона должна использовать t(sectionTitleKey), t(itemLabelKey).
 */
export function getAdminSectionByTabId(tabId) {
  if (!tabId) return null
  for (const section of ADMIN_NAV_SECTIONS) {
    const item = section.items.find((i) => i.id === tabId)
    if (item) return { sectionTitleKey: section.titleKey, itemLabelKey: item.labelKey }
  }
  return null
}
