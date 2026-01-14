import React from 'react'
import AdminPanel from '../components/AdminPanel.jsx'

/**
 * AdminPage - обертка для AdminPanel
 * 
 * ВАЖНО: Этот компонент должен получать ВСЕ необходимые пропсы от родительского компонента.
 * Если пропсы не переданы, компонент создаст fallback функции, но это не рекомендуется.
 * 
 * Правильное использование:
 * <AdminPage
 *   onHandleSaveUserCard={handleSaveUserCard}
 *   onGenerateUUID={generateUUID}
 *   {...otherProps}
 * />
 * 
 * @param {Object} props - Все пропсы для AdminPanel
 * @param {Function} props.onHandleSaveUserCard - Функция для сохранения пользователя (ОБЯЗАТЕЛЬНО)
 * @param {Function} props.onGenerateUUID - Функция для генерации UUID (ОБЯЗАТЕЛЬНО)
 * @param {...any} props - Остальные пропсы передаются как есть
 */
const AdminPage = (props) => {
  const {
    onHandleSaveUserCard,
    onGenerateUUID,
    ...restProps
  } = props

  // КРИТИЧЕСКАЯ проверка обязательных пропсов
  console.log('🔍 AdminPage: Проверка пропсов перед передачей в AdminPanel', {
    hasOnHandleSaveUserCard: !!onHandleSaveUserCard,
    onHandleSaveUserCardType: typeof onHandleSaveUserCard,
    isOnHandleSaveUserCardFunction: typeof onHandleSaveUserCard === 'function',
    onHandleSaveUserCardValue: onHandleSaveUserCard,
    isOnHandleSaveUserCardFalse: onHandleSaveUserCard === false,
    isOnHandleSaveUserCardUndefined: onHandleSaveUserCard === undefined,
    hasOnGenerateUUID: !!onGenerateUUID,
    onGenerateUUIDType: typeof onGenerateUUID,
    isOnGenerateUUIDFunction: typeof onGenerateUUID === 'function',
    onGenerateUUIDValue: onGenerateUUID,
    isOnGenerateUUIDFalse: onGenerateUUID === false,
    isOnGenerateUUIDUndefined: onGenerateUUID === undefined,
    allPropsKeys: Object.keys(props),
    allProps: props,
  })

  // Проверка на false значения (это ошибка!)
  if (onHandleSaveUserCard === false) {
    console.error('❌ AdminPage: КРИТИЧЕСКАЯ ОШИБКА - onHandleSaveUserCard передан как FALSE!', {
      onHandleSaveUserCard,
      type: typeof onHandleSaveUserCard,
      allProps: props,
    })
  }

  if (onGenerateUUID === false) {
    console.error('❌ AdminPage: КРИТИЧЕСКАЯ ОШИБКА - onGenerateUUID передан как FALSE!', {
      onGenerateUUID,
      type: typeof onGenerateUUID,
      allProps: props,
    })
  }

  // Проверка на undefined
  if (onHandleSaveUserCard === undefined) {
    console.error('❌ AdminPage: onHandleSaveUserCard не передан (undefined)!', {
      allProps: props,
    })
  }

  if (onGenerateUUID === undefined) {
    console.error('❌ AdminPage: onGenerateUUID не передан (undefined)!', {
      allProps: props,
    })
  }

  // Гарантируем, что onHandleSaveUserCard всегда функция
  // ВАЖНО: Если передан false или undefined, создаем fallback
  const safeOnHandleSaveUserCard = (onHandleSaveUserCard && typeof onHandleSaveUserCard === 'function')
    ? onHandleSaveUserCard
    : (async (updatedUser) => {
        console.error('❌ AdminPage: onHandleSaveUserCard не доступен (fallback вызван)', {
          updatedUser,
          onHandleSaveUserCard,
          type: typeof onHandleSaveUserCard,
          isFalse: onHandleSaveUserCard === false,
          isUndefined: onHandleSaveUserCard === undefined,
          allProps: props,
        })
        throw new Error('Функция сохранения пользователя не доступна. Проп onHandleSaveUserCard не передан в AdminPage.')
      })

  // Гарантируем, что onGenerateUUID всегда функция
  const safeOnGenerateUUID = (onGenerateUUID && typeof onGenerateUUID === 'function')
    ? onGenerateUUID
    : () => {
        console.error('❌ AdminPage: onGenerateUUID не доступен (fallback вызван)', {
          onGenerateUUID,
          type: typeof onGenerateUUID,
          isFalse: onGenerateUUID === false,
          isUndefined: onGenerateUUID === undefined,
          allProps: props,
        })
        return ''
      }

  // Финальная проверка перед передачей
  console.log('🔍 AdminPage: Финальная проверка перед передачей в AdminPanel', {
    hasSafeOnHandleSaveUserCard: !!safeOnHandleSaveUserCard,
    safeOnHandleSaveUserCardType: typeof safeOnHandleSaveUserCard,
    isSafeOnHandleSaveUserCardFunction: typeof safeOnHandleSaveUserCard === 'function',
    hasSafeOnGenerateUUID: !!safeOnGenerateUUID,
    safeOnGenerateUUIDType: typeof safeOnGenerateUUID,
    isSafeOnGenerateUUIDFunction: typeof safeOnGenerateUUID === 'function',
  })

  return (
    <AdminPanel
      {...restProps}
      onHandleSaveUserCard={safeOnHandleSaveUserCard}
      onGenerateUUID={safeOnGenerateUUID}
    />
  )
}

export default AdminPage

