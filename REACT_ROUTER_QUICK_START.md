# Быстрый старт: Интеграция React Router

## Шаг 1: Установка

```bash
npm install react-router-dom
```

## Шаг 2: Что уже создано

✅ **Компоненты:**
- `src/shared/components/ProtectedRoute.jsx` - защита маршрутов
- `src/shared/components/PublicRoute.jsx` - публичные маршруты с редиректом

✅ **Страницы:**
- `src/features/auth/pages/LoginPage.jsx`
- `src/features/auth/pages/RegisterPage.jsx`
- `src/features/dashboard/pages/DashboardPage.jsx`
- `src/features/admin/pages/AdminPage.jsx`

✅ **Обновлённые компоненты:**
- `src/shared/components/Sidebar.jsx` - использует `NavLink`
- `src/features/auth/components/LoginForm.jsx` - использует `useNavigate`

## Шаг 3: Обновление App.jsx

### 3.1. Добавьте импорты в начало файла:

```jsx
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import ProtectedRoute from '../shared/components/ProtectedRoute.jsx'
import PublicRoute from '../shared/components/PublicRoute.jsx'
import LoginPage from '../features/auth/pages/LoginPage.jsx'
import RegisterPage from '../features/auth/pages/RegisterPage.jsx'
import DashboardPage from '../features/dashboard/pages/DashboardPage.jsx'
import AdminPage from '../features/admin/pages/AdminPage.jsx'
```

### 3.2. Оберните компонент App в BrowserRouter:

```jsx
// Создайте внутренний компонент для использования хуков
const AppContent = () => {
  const navigate = useNavigate()
  // ... вся ваша текущая логика App.jsx ...
  
  // Замените логику отображения на основе view на Routes
  return (
    <Routes>
      <Route 
        path="/login" 
        element={
          <PublicRoute user={currentUser}>
            <LoginPage
              authMode={authMode}
              loginData={loginData}
              error={error}
              success={success}
              onEmailChange={onEmailChange}
              onPasswordChange={onPasswordChange}
              onNameChange={onNameChange}
              onAuthModeLogin={onAuthModeLogin}
              onAuthModeRegister={onAuthModeRegister}
              onLogin={handleLogin}
              onRegister={handleRegister}
              onGoogleSignIn={handleGoogleSignIn}
              googleSignInLoading={googleSignInLoading}
            />
          </PublicRoute>
        } 
      />
      
      <Route 
        path="/register" 
        element={
          <PublicRoute user={currentUser}>
            <RegisterPage
              authMode={authMode}
              loginData={loginData}
              error={error}
              success={success}
              onEmailChange={onEmailChange}
              onPasswordChange={onPasswordChange}
              onNameChange={onNameChange}
              onAuthModeLogin={onAuthModeLogin}
              onAuthModeRegister={onAuthModeRegister}
              onLogin={handleLogin}
              onRegister={handleRegister}
              onGoogleSignIn={handleGoogleSignIn}
              googleSignInLoading={googleSignInLoading}
            />
          </PublicRoute>
        } 
      />

      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute user={currentUser}>
            <DashboardPage
              currentUser={currentUser}
              view={view}
              onSetView={setView}
              onLogout={handleLogout}
              // ... все остальные пропсы для Dashboard ...
            />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/admin" 
        element={
          <ProtectedRoute user={currentUser} requireRole="admin">
            <AdminPage
              currentUser={currentUser}
              // ... все остальные пропсы для AdminPanel ...
            />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/" 
        element={
          <Navigate 
            to={currentUser ? (currentUser.role === 'admin' ? '/admin' : '/dashboard') : '/login'} 
            replace 
          />
        } 
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// Оберните в BrowserRouter
const App = () => {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
```

### 3.3. Обновите обработчики для использования navigate:

**В handleLogin, handleRegister, handleGoogleSignIn:**
```jsx
// После успешной авторизации:
if (userData?.role === 'admin') {
  navigate('/admin')
} else {
  navigate('/dashboard')
}
```

**В handleLogout:**
```jsx
const handleLogout = async () => {
  try {
    await signOut(auth)
    setCurrentUser(null)
    navigate('/login')
  } catch (error) {
    // обработка ошибки
  }
}
```

## Шаг 4: Обновление AdminPanel

В `src/features/admin/components/AdminPanel.jsx` замените:

```jsx
import { useNavigate } from 'react-router-dom'

const AdminPanel = ({ onHandleLogout, ... }) => {
  const navigate = useNavigate()
  
  // Замените onSetView('dashboard') на:
  navigate('/dashboard')
  
  // В handleLogout:
  onHandleLogout()
  navigate('/login')
}
```

## Шаг 5: Тестирование

1. Запустите приложение: `npm run dev`
2. Проверьте маршруты:
   - `/login` - страница входа
   - `/register` - страница регистрации
   - `/dashboard` - личный кабинет (требует авторизации)
   - `/admin` - админ-панель (требует роль admin)
3. Проверьте редиректы:
   - Неавторизованный пользователь → `/login`
   - Авторизованный пользователь на `/login` → `/dashboard` или `/admin`
   - Админ на `/dashboard` → `/admin` (если требуется роль)

## Готово! 🎉

Теперь ваше приложение использует React Router для навигации.

**Подробное руководство:** см. `REACT_ROUTER_INTEGRATION.md`

