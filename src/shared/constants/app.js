/**
 * Константы приложения
 */

/**
 * ID приложения для путей Firestore.
 * Должен совпадать с APP_ID на сервере (server/.env), иначе настройки платежей и данные будут в разных документах.
 * Используется в путях вида: artifacts/${APP_ID}/public/data/...
 */
export const APP_ID = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_ID) || 'skyputh'

