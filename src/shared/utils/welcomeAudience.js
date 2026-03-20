import { getUserStatus } from './userStatus.js'

/**
 * Кто смотрит стартовую страницу:
 * - guest — не вошёл в аккаунт
 * - new — вошёл, но нет активной подписки / ключа (нужно оформить)
 * - active — есть активная подписка, тест или льготный период
 *
 * @param {object|null|undefined} currentUser
 * @returns {'guest'|'new'|'active'}
 */
export function getWelcomeAudience (currentUser) {
  if (!currentUser) return 'guest'

  const { status } = getUserStatus(currentUser, null, null)
  const active = new Set([
    'active',
    'expiring_soon',
    'test_period',
    'activating',
    'grace'
  ])

  if (active.has(status)) return 'active'
  return 'new'
}
