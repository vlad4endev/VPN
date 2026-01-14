import { Navigate } from 'react-router-dom'

/**
 * Компонент для защиты маршрутов
 * @param {Object} props
 * @param {React.ReactNode} props.children - Дочерние компоненты
 * @param {Object|null} props.user - Текущий пользователь
 * @param {boolean} props.requireAuth - Требуется ли авторизация
 * @param {string} props.redirectTo - Куда перенаправить, если нет доступа
 * @param {string|null} props.requireRole - Требуемая роль (например, 'admin')
 */
const ProtectedRoute = ({ 
  children, 
  user, 
  requireAuth = true, 
  redirectTo = '/login',
  requireRole = null 
}) => {
  // Если требуется авторизация, но пользователь не авторизован
  if (requireAuth && !user) {
    return <Navigate to={redirectTo} replace />
  }

  // Если требуется определенная роль, но у пользователя её нет
  if (requireRole && user?.role !== requireRole) {
    // Админов перенаправляем в админ-панель, остальных - на dashboard
    return <Navigate to={user?.role === 'admin' ? '/admin' : '/dashboard'} replace />
  }

  return children
}

export default ProtectedRoute

