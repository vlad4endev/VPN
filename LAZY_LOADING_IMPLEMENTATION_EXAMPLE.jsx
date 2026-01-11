/**
 * ПРИМЕР: Обновление VPNServiceApp.jsx с ленивой загрузкой
 * 
 * Этот файл показывает, как обновить основной компонент приложения
 * для использования React.lazy и Suspense.
 * 
 * ВАЖНО: Это пример! Не копируйте напрямую, адаптируйте под ваш код.
 */

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useFirebase } from './shared/hooks/useFirebase.js'
import { useAuth } from './features/auth/hooks/useAuth.js'
import { useDashboard } from './features/dashboard/hooks/useDashboard.js'
import { useAdmin } from './features/admin/hooks/useAdmin.js'
import { useAppState } from './shared/hooks/useAppState.js'
import { useView } from './shared/hooks/useView.js'

// ============================================
// ИМПОРТ ВСПОМОГАТЕЛЬНЫХ КОМПОНЕНТОВ
// ============================================
import ErrorBoundary from './shared/components/ErrorBoundary.jsx'
import LoadingSpinner from './shared/components/LoadingSpinner.jsx'

// ============================================
// ЛЕНИВАЯ ЗАГРУЗКА КОМПОНЕНТОВ
// ============================================
// Вместо обычных импортов используем ленивую загрузку
import { 
  LazyDashboard, 
  LazyAdminPanel, 
  LazyLoginForm, 
  LazyLandingPage,
  LazyKeyModal,
  LazyLoggerPanel,
  LazyConfigErrorScreen,
  preloadDashboard,
  preloadAdminPanel
} from './app/lazyComponents.js'

// ============================================
// ОБЫЧНЫЕ ИМПОРТЫ (легкие компоненты)
// ============================================
// Легкие компоненты можно оставить обычными импортами
import Sidebar from './shared/components/Sidebar.jsx'
// ... другие легкие компоненты

export default function VPNServiceApp() {
  // ============================================
  // СУЩЕСТВУЮЩАЯ ЛОГИКА (без изменений)
  // ============================================
  const { app, auth, db, googleProvider, firebaseInitError, configError: firebaseConfigError, loading: firebaseLoading } = useFirebase()
  const appState = useAppState()
  const { users, currentUser, error, success, loading, setUsers, setCurrentUser, setError, setSuccess, setLoading } = appState
  const { view, setView } = useView({ currentUser })
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [showLogger, setShowLogger] = useState(false)

  // ... остальная логика остается без изменений ...

  // ============================================
  // ПРЕДЗАГРУЗКА КОМПОНЕНТОВ
  // ============================================
  // Предзагружаем Dashboard для авторизованных пользователей
  useEffect(() => {
    if (currentUser && view !== 'dashboard') {
      // Предзагружаем Dashboard в фоне
      preloadDashboard()
    }
  }, [currentUser, view])

  // Предзагружаем AdminPanel для администраторов
  useEffect(() => {
    if (currentUser?.role === 'admin' && view !== 'admin') {
      preloadAdminPanel()
    }
  }, [currentUser?.role, view])

  // ============================================
  // РЕНДЕРИНГ С ЛЕНИВОЙ ЗАГРУЗКОЙ
  // ============================================
  
  // Обработка ошибки конфигурации
  if (configError && view !== 'landing') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner message="Загрузка..." />}>
          <LazyConfigErrorScreen configError={configError} />
        </Suspense>
      </ErrorBoundary>
    )
  }

  // Landing page
  if (view === 'landing' && !currentUser) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner message="Загрузка главной страницы..." />}>
          <LazyLandingPage onSetView={setView} />
        </Suspense>
      </ErrorBoundary>
    )
  }

  // Loading state
  if (loading && currentUser) {
    return <LoadingSpinner message="Загрузка приложения..." />
  }

  // Login/Register
  if (view === 'login' || view === 'register') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner message="Загрузка формы входа..." />}>
          <LazyLoginForm
            authMode={authHandlers.authMode}
            loginData={authHandlers.loginData}
            error={authHandlers.error || error}
            success={authHandlers.success || success}
            onEmailChange={authHandlers.handleEmailChange}
            onPasswordChange={authHandlers.handlePasswordChange}
            onNameChange={authHandlers.handleNameChange}
            onAuthModeLogin={authHandlers.handleAuthModeLogin}
            onAuthModeRegister={authHandlers.handleAuthModeRegister}
            onLogin={authHandlers.handleLogin}
            onRegister={authHandlers.handleRegister}
            onGoogleSignIn={authHandlers.handleGoogleSignIn}
            googleSignInLoading={authHandlers.googleSignInLoading}
            onSetView={setView}
          />
        </Suspense>
      </ErrorBoundary>
    )
  }

  // Admin Panel
  if (view === 'admin') {
    if (!currentUser || currentUser.role !== 'admin') {
      setView('dashboard')
      setError('Недостаточно прав для доступа к админ-панели')
      return null
    }

    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner message="Загрузка админ-панели..." />}>
          <LazyAdminPanel
            currentUser={currentUser}
            adminTab={adminHandlers.adminTab}
            onSetAdminTab={adminHandlers.setAdminTab}
            onSetView={setView}
            onHandleLogout={authHandlers.handleLogout}
            users={users}
            editingUser={adminHandlers.editingUser}
            onSetEditingUser={adminHandlers.setEditingUser}
            onHandleUpdateUser={adminHandlers.handleUpdateUser}
            onHandleDeleteUser={adminHandlers.handleDeleteUser}
            onHandleCopy={handleCopy}
            servers={adminHandlers.servers}
            editingServer={adminHandlers.editingServer}
            onSetEditingServer={adminHandlers.setEditingServer}
            onHandleAddServer={adminHandlers.handleAddServer}
            onHandleSaveServer={adminHandlers.handleSaveServer}
            onHandleDeleteServer={adminHandlers.handleDeleteServer}
            onHandleTestServerSession={adminHandlers.handleTestServerSession}
            testingServerId={adminHandlers.testingServerId}
            newServerIdRef={null}
            settingsLoading={adminHandlers.settingsLoading}
            tariffs={tariffs}
            editingTariff={adminHandlers.editingTariff}
            onSetEditingTariff={adminHandlers.setEditingTariff}
            onHandleSaveTariff={adminHandlers.handleSaveTariff}
            onHandleDeleteTariff={adminHandlers.handleDeleteTariff}
            onHandleSaveSettings={adminHandlers.handleSaveSettings}
            formatDate={formatDate}
            showLogger={showLogger}
            onSetShowLogger={setShowLogger}
            success={authHandlers.success}
            error={authHandlers.error}
            // ... остальные пропсы
          />
        </Suspense>
      </ErrorBoundary>
    )
  }

  // Dashboard
  if (currentUser && (view === 'dashboard' || !view || view === 'landing')) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner message="Загрузка личного кабинета..." />}>
          <LazyDashboard
            currentUser={currentUser}
            view={view}
            onSetView={setView}
            onLogout={authHandlers.handleLogout}
            tariffs={tariffs}
            loadTariffs={loadTariffs}
            dashboardTab={dashboardHandlers.dashboardTab}
            onSetDashboardTab={dashboardHandlers.setDashboardTab}
            editingProfile={dashboardHandlers.editingProfile}
            onSetEditingProfile={dashboardHandlers.setEditingProfile}
            profileData={dashboardHandlers.profileData}
            creatingSubscription={dashboardHandlers.creatingSubscription}
            onHandleCreateSubscription={dashboardHandlers.handleCreateSubscription}
            onHandleRenewSubscription={dashboardHandlers.handleRenewSubscription}
            onHandleUpdateProfile={dashboardHandlers.handleUpdateProfile}
            onHandleDeleteAccount={dashboardHandlers.handleDeleteAccount}
            onProfileNameChange={dashboardHandlers.handleProfileNameChange}
            onProfilePhoneChange={dashboardHandlers.handleProfilePhoneChange}
            payments={dashboardHandlers.payments}
            paymentsLoading={dashboardHandlers.paymentsLoading}
            loadPayments={dashboardHandlers.loadPayments}
            formatDate={formatDate}
            formatTraffic={formatTraffic}
            settings={adminHandlers.settings}
            onCopy={handleCopy}
            showKeyModal={showKeyModal}
            onSetShowKeyModal={setShowKeyModal}
            showLogger={showLogger}
            onSetShowLogger={setShowLogger}
            onGetKey={dashboardHandlers.handleGetKey}
          />
        </Suspense>
        
        {/* Модальные окна с ленивой загрузкой */}
        {showKeyModal && (
          <Suspense fallback={
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
            </div>
          }>
            <LazyKeyModal
              // ... пропсы для KeyModal
            />
          </Suspense>
        )}

        {showLogger && (
          <Suspense fallback={
            <div className="fixed bottom-4 right-4 bg-slate-800 p-4 rounded-lg shadow-lg">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-600"></div>
            </div>
          }>
            <LazyLoggerPanel
              // ... пропсы для LoggerPanel
            />
          </Suspense>
        )}
      </ErrorBoundary>
    )
  }

  // По умолчанию показываем landing
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingSpinner />}>
        <LazyLandingPage onSetView={setView} />
      </Suspense>
    </ErrorBoundary>
  )
}

/**
 * АЛЬТЕРНАТИВНЫЙ ПОДХОД: Использование одного Suspense для всего приложения
 * 
 * Можно обернуть все приложение в один Suspense, но это менее гибко:
 * 
 * return (
 *   <ErrorBoundary>
 *     <Suspense fallback={<LoadingSpinner message="Загрузка приложения..." />}>
 *       {view === 'dashboard' && <LazyDashboard {...props} />}
 *       {view === 'admin' && <LazyAdminPanel {...props} />}
 *       {view === 'login' && <LazyLoginForm {...props} />}
 *       {/* ... */}
 *     </Suspense>
 *   </ErrorBoundary>
 * )
 * 
 * РЕКОМЕНДАЦИЯ: Используйте отдельные Suspense для каждого крупного компонента
 * для более точного контроля над fallback UI.
 */

