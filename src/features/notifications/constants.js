/**
 * Типы уведомлений
 */
export const NOTIFICATION_TYPES = {
  admin_broadcast: 'admin_broadcast',
  subscription: 'subscription',
  feature: 'feature',
  interaction: 'interaction',
}

export const NOTIFICATION_TYPE_LABELS = {
  [NOTIFICATION_TYPES.admin_broadcast]: 'Рассылка',
  [NOTIFICATION_TYPES.subscription]: 'Подписка',
  [NOTIFICATION_TYPES.feature]: 'Новая функция',
  [NOTIFICATION_TYPES.interaction]: 'Взаимодействие',
}
