import { createContext, useContext } from 'react'

/**
 * Контекст для передачи функций админ-панели
 * Устраняет необходимость в prop drilling для функций управления
 */
const AdminContext = createContext(null)

/**
 * Хук для использования AdminContext
 * @returns {Object} Значение контекста с функциями админ-панели
 * @throws {Error} Если используется вне AdminProvider
 * 
 * @example
 * const { handleSaveUserCard, generateUUID } = useAdminContext()
 */
export const useAdminContext = () => {
  const context = useContext(AdminContext)
  
  if (!context) {
    throw new Error('useAdminContext must be used within AdminProvider')
  }
  
  return context
}

/**
 * Провайдер контекста для админ-панели
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Дочерние компоненты
 * @param {Object} props.value - Значение контекста (функции админ-панели)
 */
export const AdminProvider = ({ children, value }) => {
  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  )
}

export default AdminContext
