# Интеграция React Router в проект

## Пошаговое руководство

---

## Шаг 1: Установка react-router-dom

```bash
npm install react-router-dom
```

---

## Шаг 2: Создание структуры маршрутов

### 2.1. Создание компонента ProtectedRoute

Создайте файл `src/shared/components/ProtectedRoute.jsx`:

```jsx
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
```

### 2.2. Создание компонента PublicRoute

Создайте файл `src/shared/components/PublicRoute.jsx`:

```jsx
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
```

---

## Шаг 3: Создание страниц (Pages)

### 3.1. Страница Login

Создайте файл `src/features/auth/pages/LoginPage.jsx`:

```jsx
import { useState } from 'react'
import LoginForm from '../components/LoginForm.jsx'

const LoginPage = ({
  authMode,
  loginData,
  error,
  success,
  onEmailChange,
  onPasswordChange,
  onNameChange,
  onAuthModeLogin,
  onAuthModeRegister,
  onLogin,
  onRegister,
  onGoogleSignIn,
  googleSignInLoading,
}) => {
  return (
    <LoginForm
      authMode={authMode}
      loginData={loginData}
      error={error}
      success={success}
      onEmailChange={onEmailChange}
      onPasswordChange={onPasswordChange}
      onNameChange={onNameChange}
      onAuthModeLogin={onAuthModeLogin}
      onAuthModeRegister={onAuthModeRegister}
      onLogin={onLogin}
      onRegister={onRegister}
      onGoogleSignIn={onGoogleSignIn}
      googleSignInLoading={googleSignInLoading}
      onSetView={() => {}} // Не используется в роутере
    />
  )
}

export default LoginPage
```

### 3.2. Страница Register

Создайте файл `src/features/auth/pages/RegisterPage.jsx`:

```jsx
import { useState } from 'react'
import LoginForm from '../components/LoginForm.jsx'

const RegisterPage = ({
  authMode,
  loginData,
  error,
  success,
  onEmailChange,
  onPasswordChange,
  onNameChange,
  onAuthModeLogin,
  onAuthModeRegister,
  onLogin,
  onRegister,
  onGoogleSignIn,
  googleSignInLoading,
}) => {
  // Устанавливаем режим регистрации при монтировании
  useState(() => {
    onAuthModeRegister()
  }, [])

  return (
    <LoginForm
      authMode="register"
      loginData={loginData}
      error={error}
      success={success}
      onEmailChange={onEmailChange}
      onPasswordChange={onPasswordChange}
      onNameChange={onNameChange}
      onAuthModeLogin={onAuthModeLogin}
      onAuthModeRegister={onAuthModeRegister}
      onLogin={onLogin}
      onRegister={onRegister}
      onGoogleSignIn={onGoogleSignIn}
      googleSignInLoading={googleSignInLoading}
      onSetView={() => {}} // Не используется в роутере
    />
  )
}

export default RegisterPage
```

### 3.3. Страница Dashboard

Создайте файл `src/features/dashboard/pages/DashboardPage.jsx`:

```jsx
import Dashboard from '../components/Dashboard.jsx'

const DashboardPage = (props) => {
  return <Dashboard {...props} />
}

export default DashboardPage
```

### 3.4. Страница Admin

Создайте файл `src/features/admin/pages/AdminPage.jsx`:

```jsx
import AdminPanel from '../components/AdminPanel.jsx'

const AdminPage = (props) => {
  return <AdminPanel {...props} />
}

export default AdminPage
```

---

## Шаг 4: Обновление App.jsx

### 4.1. Импорты

Добавьте в начало `src/app/App.jsx`:

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from '../shared/components/ProtectedRoute.jsx'
import PublicRoute from '../shared/components/PublicRoute.jsx'
import LoginPage from '../features/auth/pages/LoginPage.jsx'
import RegisterPage from '../features/auth/pages/RegisterPage.jsx'
import DashboardPage from '../features/dashboard/pages/DashboardPage.jsx'
import AdminPage from '../features/admin/pages/AdminPage.jsx'
```

### 4.2. Обновление структуры компонента

Замените логику отображения компонентов на основе `view` на маршрутизацию:

**Было:**
```jsx
{view === 'login' && <LoginForm ... />}
{view === 'dashboard' && <Dashboard ... />}
{view === 'admin' && <AdminPanel ... />}
```

**Стало:**
```jsx
<BrowserRouter>
  <Routes>
    {/* Публичные маршруты */}
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

    {/* Защищённые маршруты */}
    <Route 
      path="/dashboard" 
      element={
        <ProtectedRoute user={currentUser}>
          <DashboardPage
            currentUser={currentUser}
            view={view}
            onSetView={setView}
            onLogout={handleLogout}
            tariffs={tariffs}
            loadTariffs={loadTariffs}
            dashboardTab={dashboardTab}
            onSetDashboardTab={setDashboardTab}
            editingProfile={editingProfile}
            onSetEditingProfile={setEditingProfile}
            profileData={profileData}
            onSetProfileData={setProfileData}
            creatingSubscription={creatingSubscription}
            onHandleCreateSubscription={handleCreateSubscription}
            onHandleRenewSubscription={handleRenewSubscription}
            onHandleUpdateProfile={handleUpdateProfile}
            onHandleDeleteAccount={handleDeleteAccount}
            onProfileNameChange={handleProfileNameChange}
            onProfilePhoneChange={handleProfilePhoneChange}
            payments={payments}
            paymentsLoading={paymentsLoading}
            loadPayments={loadPayments}
            formatDate={formatDate}
            formatTraffic={formatTraffic}
            settings={settings}
            onCopy={handleCopy}
            showKeyModal={showKeyModal}
            onSetShowKeyModal={setShowKeyModal}
            showLogger={showLogger}
            onSetShowLogger={setShowLogger}
            onGetKey={handleGetKey}
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
            adminTab={adminTab}
            onSetAdminTab={setAdminTab}
            onSetView={setView}
            onHandleLogout={handleLogout}
            users={users}
            editingUser={editingUser}
            onSetEditingUser={setEditingUser}
            onHandleUpdateUser={handleUpdateUser}
            onHandleDeleteUser={handleDeleteUser}
            onHandleCopy={handleCopy}
            servers={servers}
            editingServer={editingServer}
            onSetEditingServer={setEditingServer}
            onHandleAddServer={handleAddServer}
            onHandleSaveServer={handleSaveServer}
            onHandleDeleteServer={handleDeleteServer}
            onHandleTestServerSession={handleTestServerSession}
            testingServerId={testingServerId}
            newServerIdRef={newServerIdRef}
            settingsLoading={settingsLoading}
            tariffs={tariffs}
            editingTariff={editingTariff}
            onSetEditingTariff={setEditingTariff}
            onHandleSaveTariff={handleSaveTariff}
            onHandleDeleteTariff={handleDeleteTariff}
            onHandleSaveSettings={handleSaveSettings}
            formatDate={formatDate}
            showLogger={showLogger}
            onSetShowLogger={setShowLogger}
            success={success}
            error={error}
            onHandleServerNameChange={handleServerNameChange}
            onHandleServerIPChange={handleServerIPChange}
            onHandleServerPortChange={handleServerPortChange}
            onHandleServerProtocolChange={handleServerProtocolChange}
            onHandleServerRandomPathChange={handleServerRandomPathChange}
            onHandleServerRandomPathBlur={handleServerRandomPathBlur}
            onHandleServerUsernameChange={handleServerUsernameChange}
            onHandleServerPasswordChange={handleServerPasswordChange}
            onHandleServerInboundIdChange={handleServerInboundIdChange}
            onHandleServerLocationChange={handleServerLocationChange}
            onHandleServerActiveChange={handleServerActiveChange}
            onHandleServerTariffChange={handleServerTariffChange}
            onHandleTariffNameChange={handleTariffNameChange}
            onHandleTariffPlanChange={handleTariffPlanChange}
            onHandleTariffPriceChange={handleTariffPriceChange}
            onHandleTariffDevicesChange={handleTariffDevicesChange}
            onHandleTariffTrafficGBChange={handleTariffTrafficGBChange}
            onHandleTariffDurationDaysChange={handleTariffDurationDaysChange}
            onHandleTariffActiveChange={handleTariffActiveChange}
          />
        </ProtectedRoute>
      } 
    />

    {/* Редирект с корня на dashboard или login */}
    <Route 
      path="/" 
      element={
        <Navigate 
          to={currentUser ? (currentUser.role === 'admin' ? '/admin' : '/dashboard') : '/login'} 
          replace 
        />
      } 
    />

    {/* 404 - несуществующий маршрут */}
    <Route 
      path="*" 
      element={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white mb-4">404</h1>
            <p className="text-slate-400 mb-6">Страница не найдена</p>
            <Navigate to="/" replace />
          </div>
        </div>
      } 
    />
  </Routes>
</BrowserRouter>
```

### 4.3. Обновление обработчиков навигации

Замените все вызовы `setView()` на `navigate()`:

```jsx
import { useNavigate } from 'react-router-dom'

// Внутри компонента App:
const navigate = useNavigate()

// Вместо setView('dashboard'):
navigate('/dashboard')

// Вместо setView('admin'):
navigate('/admin')

// Вместо setView('login'):
navigate('/login')
```

---

## Шаг 5: Обновление компонентов для использования навигации

### 5.1. Обновление LoginForm

В `src/features/auth/components/LoginForm.jsx` замените кнопку "Вернуться на главную":

```jsx
import { useNavigate } from 'react-router-dom'

const LoginForm = ({ ... }) => {
  const navigate = useNavigate()
  
  // ... остальной код ...
  
  // Замените:
  // <button onClick={() => onSetView('landing')}>Вернуться на главную</button>
  // На:
  <button onClick={() => navigate('/')} className="w-full mt-8 text-slate-600 text-xs font-bold hover:text-blue-400 transition-colors hover:underline">
    Вернуться на главную
  </button>
}
```

### 5.2. Обновление Sidebar

В `src/shared/components/Sidebar.jsx` используйте `NavLink` для навигации:

```jsx
import { NavLink, useNavigate } from 'react-router-dom'

const Sidebar = ({ currentUser, onLogout }) => {
  const navigate = useNavigate()

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800">
      <nav className="p-4">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `block px-4 py-2 rounded-lg mb-2 transition-colors ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800'
            }`
          }
        >
          Личный кабинет
        </NavLink>

        {currentUser?.role === 'admin' && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `block px-4 py-2 rounded-lg mb-2 transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`
            }
          >
            Админ-панель
          </NavLink>
        )}

        <button
          onClick={() => {
            onLogout()
            navigate('/login')
          }}
          className="w-full px-4 py-2 rounded-lg text-red-400 hover:bg-red-900/20 transition-colors"
        >
          Выйти
        </button>
      </nav>
    </aside>
  )
}
```

### 5.3. Обновление AdminPanel

В `src/features/admin/components/AdminPanel.jsx`:

```jsx
import { useNavigate } from 'react-router-dom'

const AdminPanel = ({ onHandleLogout, ... }) => {
  const navigate = useNavigate()

  // Замените:
  // onClick={() => onSetView('dashboard')}
  // На:
  // onClick={() => navigate('/dashboard')}
  
  // В кнопке "Личный кабинет":
  <button
    onClick={() => navigate('/dashboard')}
    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
  >
    Личный кабинет
  </button>
  
  // В кнопке "Выйти":
  <button
    onClick={() => {
      onHandleLogout()
      navigate('/login')
    }}
    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors flex items-center gap-2"
  >
    <LogOut className="w-4 h-4" />
    Выйти
  </button>
}
```

---

## Шаг 6: Программная навигация после действий

### 6.1. После успешного входа

В `handleLogin` и `handleRegister`:

```jsx
import { useNavigate } from 'react-router-dom'

const App = () => {
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    // ... логика входа ...
    
    if (userCredential) {
      // После успешного входа
      const userData = await loadUserData(firebaseUser.uid)
      
      if (userData?.role === 'admin') {
        navigate('/admin')
      } else {
        navigate('/dashboard')
      }
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    // ... логика регистрации ...
    
    if (userCredential) {
      navigate('/dashboard')
    }
  }

  const handleGoogleSignIn = async () => {
    // ... логика Google Sign In ...
    
    if (userCredential) {
      const userData = await loadUserData(firebaseUser.uid)
      
      if (userData?.role === 'admin') {
        navigate('/admin')
      } else {
        navigate('/dashboard')
      }
    }
  }
}
```

### 6.2. После выхода

```jsx
const handleLogout = async () => {
  try {
    await signOut(auth)
    setCurrentUser(null)
    navigate('/login')
  } catch (error) {
    logger.error('Auth', 'Ошибка выхода', {}, error)
  }
}
```

---

## Шаг 7: Использование useLocation для отслеживания маршрута

Если нужно отслеживать текущий маршрут:

```jsx
import { useLocation } from 'react-router-dom'

const SomeComponent = () => {
  const location = useLocation()
  
  useEffect(() => {
    console.log('Текущий маршрут:', location.pathname)
  }, [location.pathname])
  
  return <div>...</div>
}
```

---

## Шаг 8: Использование useParams для динамических маршрутов

Если в будущем понадобятся динамические маршруты:

```jsx
// В Routes:
<Route path="/user/:userId" element={<UserProfile />} />

// В компоненте:
import { useParams } from 'react-router-dom'

const UserProfile = () => {
  const { userId } = useParams()
  // userId будет содержать значение из URL
}
```

---

## Шаг 9: Использование useSearchParams для query-параметров

```jsx
import { useSearchParams } from 'react-router-dom'

const SomeComponent = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  
  // Получить параметр
  const tab = searchParams.get('tab') || 'default'
  
  // Установить параметр
  const handleTabChange = (newTab) => {
    setSearchParams({ tab: newTab })
  }
}
```

---

## Шаг 10: Редиректы (Redirects)

### 10.1. Условный редирект

```jsx
import { Navigate } from 'react-router-dom'

const ConditionalRedirect = ({ condition, to, children }) => {
  if (condition) {
    return <Navigate to={to} replace />
  }
  return children
}
```

### 10.2. Редирект с сохранением location state

```jsx
import { useNavigate, useLocation } from 'react-router-dom'

const SomeComponent = () => {
  const navigate = useNavigate()
  const location = useLocation()
  
  const handleAction = () => {
    // Сохраняем текущий путь для возврата
    navigate('/login', { 
      state: { from: location.pathname },
      replace: true 
    })
  }
  
  // В LoginPage можно получить сохранённый путь:
  const location = useLocation()
  const from = location.state?.from || '/dashboard'
  
  // После входа:
  navigate(from, { replace: true })
}
```

---

## Полный пример структуры App.jsx

```jsx
import { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import ProtectedRoute from '../shared/components/ProtectedRoute.jsx'
import PublicRoute from '../shared/components/PublicRoute.jsx'
import LoginPage from '../features/auth/pages/LoginPage.jsx'
import RegisterPage from '../features/auth/pages/RegisterPage.jsx'
import DashboardPage from '../features/dashboard/pages/DashboardPage.jsx'
import AdminPage from '../features/admin/pages/AdminPage.jsx'
// ... остальные импорты ...

const AppContent = () => {
  const navigate = useNavigate()
  // ... вся логика приложения ...
  
  return (
    <Routes>
      <Route 
        path="/login" 
        element={
          <PublicRoute user={currentUser}>
            <LoginPage {...loginProps} />
          </PublicRoute>
        } 
      />
      <Route 
        path="/register" 
        element={
          <PublicRoute user={currentUser}>
            <RegisterPage {...registerProps} />
          </PublicRoute>
        } 
      />
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute user={currentUser}>
            <DashboardPage {...dashboardProps} />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/admin" 
        element={
          <ProtectedRoute user={currentUser} requireRole="admin">
            <AdminPage {...adminProps} />
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

const App = () => {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
```

---

## Чеклист интеграции

- [ ] Установлен `react-router-dom`
- [ ] Создан компонент `ProtectedRoute`
- [ ] Создан компонент `PublicRoute`
- [ ] Созданы страницы (LoginPage, RegisterPage, DashboardPage, AdminPage)
- [ ] Обновлён `App.jsx` с `BrowserRouter` и `Routes`
- [ ] Заменены все `setView()` на `navigate()`
- [ ] Обновлён `Sidebar` с использованием `NavLink`
- [ ] Обновлены обработчики входа/выхода для навигации
- [ ] Протестированы все маршруты
- [ ] Протестированы защищённые маршруты
- [ ] Протестированы редиректы

---

## Преимущества использования React Router

1. **URL-адреса**: Каждая страница имеет свой URL
2. **Навигация браузера**: Работают кнопки "Назад" и "Вперёд"
3. **Закладки**: Можно сохранить ссылку на конкретную страницу
4. **SEO**: Поисковые системы могут индексировать страницы
5. **Разделение логики**: Чёткое разделение между страницами
6. **Защита маршрутов**: Удобная реализация защищённых маршрутов

---

## Дополнительные возможности

### Lazy Loading (ленивая загрузка)

```jsx
import { lazy, Suspense } from 'react'

const DashboardPage = lazy(() => import('../features/dashboard/pages/DashboardPage.jsx'))

<Route 
  path="/dashboard" 
  element={
    <Suspense fallback={<div>Загрузка...</div>}>
      <ProtectedRoute user={currentUser}>
        <DashboardPage {...props} />
      </ProtectedRoute>
    </Suspense>
  } 
/>
```

### Анимации переходов

Можно использовать библиотеку `framer-motion` для анимаций при смене маршрутов.

---

## Заключение

После выполнения всех шагов ваше приложение будет использовать React Router для навигации. Все маршруты будут защищены, а навигация станет более удобной и стандартной для веб-приложений.

