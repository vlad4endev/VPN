import { Navigate } from 'react-router-dom'

/**
 * Компонент для публичных маршрутов (редирект, если уже авторизован)
 * @param {Object} props
 * @param {React.ReactNode} props.children - Дочерние компоненты
 * @param {Object|null} props.user - Текущий пользователь
 * @param {string} props.redirectTo - Куда перенаправить авторизованных пользователей
 */
const PublicRoute = ({ children, user, redirectTo = '/dashboard' }) => {
  // Если пользователь уже авторизован, перенаправляем его
  if (user) {
    // Админов перенаправляем в админ-панель
    if (user.role === 'admin') {
      return <Navigate to="/admin" replace />
    }
    return <Navigate to={redirectTo} replace />
  }

  return children
}

export default PublicRoute

