/**
 * Хук для использования XUIService в React компонентах
 * Предоставляет доступ к сервису и его методам
 */

import { useContext } from 'react'
import { XUIContext } from '../context/XUIContext.js'

export function useXUI() {
  const context = useContext(XUIContext)
  
  if (!context) {
    throw new Error('useXUI must be used within XUIProvider')
  }
  
  return context
}

export default useXUI

