/**
 * Централизованный файл для ленивой загрузки компонентов
 * Все ленивые компоненты определены здесь для удобства управления
 */

import { lazy } from 'react'

// ============================================
// Основные страницы
// ============================================

/**
 * Ленивая загрузка Dashboard (личный кабинет)
 * Размер: ~150-200 KB
 */
export const LazyDashboard = lazy(() => 
  import('../features/dashboard/components/Dashboard.jsx')
)

/**
 * Ленивая загрузка AdminPanel (админ-панель)
 * Размер: ~200-250 KB
 */
export const LazyAdminPanel = lazy(() => 
  import('../features/admin/components/AdminPanel.jsx')
)

/**
 * Ленивая загрузка LoginForm (форма авторизации)
 * Размер: ~50-100 KB
 */
export const LazyLoginForm = lazy(() => 
  import('../features/auth/components/LoginForm.jsx')
)

/**
 * Ленивая загрузка LandingPage (главная страница)
 * Размер: ~30-50 KB
 */
export const LazyLandingPage = lazy(() => 
  import('../shared/components/LandingPage.jsx')
)

// ============================================
// Модальные окна и панели
// ============================================

/**
 * Ленивая загрузка KeyModal (модальное окно с ключом)
 * Размер: ~20-30 KB
 */
export const LazyKeyModal = lazy(() => 
  import('../shared/components/KeyModal.jsx')
)

/**
 * Ленивая загрузка LoggerPanel (панель логов)
 * Размер: ~30-50 KB
 */
export const LazyLoggerPanel = lazy(() => 
  import('../shared/components/LoggerPanel.jsx')
)

// ============================================
// Опционально: дополнительные компоненты
// ============================================

/**
 * Ленивая загрузка ConfigErrorScreen (экран ошибки конфигурации)
 * Размер: ~10-20 KB
 */
export const LazyConfigErrorScreen = lazy(() => 
  import('../shared/components/ConfigErrorScreen.jsx')
)

// ============================================
// Утилиты для предзагрузки
// ============================================

/**
 * Предзагрузка Dashboard для авторизованных пользователей
 */
export const preloadDashboard = () => {
  import('../features/dashboard/components/Dashboard.jsx')
}

/**
 * Предзагрузка AdminPanel для администраторов
 */
export const preloadAdminPanel = () => {
  import('../features/admin/components/AdminPanel.jsx')
}

/**
 * Предзагрузка LoginForm при инициализации
 */
export const preloadLoginForm = () => {
  import('../features/auth/components/LoginForm.jsx')
}

