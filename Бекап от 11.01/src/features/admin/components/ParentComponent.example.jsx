/**
 * Пример родительского компонента, использующего улучшенные версии AdminPanel и UserCard
 * 
 * Этот файл демонстрирует правильный подход к:
 * - Передаче пропсов
 * - Обработке ошибок
 * - Управлению состоянием
 * - Связи с Firestore
 */

import { useState, useCallback, useMemo } from 'react'
import AdminPanel from './AdminPanel.improved.jsx'
import { useAdmin } from '../hooks/useAdmin.js'
import { useUsers } from '../hooks/useUsers.improved.js'
import { formatDate } from '../../../shared/utils/formatDate.js'
import { copyToClipboard } from '../../../shared/utils/copyToClipboard.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Пример родительского компонента
 * 
 * Улучшения:
 * - Минимизация пропсов через группировку
 * - Стабильные функции через useCallback
 * - Обработка ошибок на уровне родителя
 * - Единый источник истины для состояния
 */
export function AdminPageExample({ currentUser, onSetView, onHandleLogout }) {
  // Состояние
  const [users, setUsers] = useState([])
  const [tariffs, setTariffs] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showLogger, setShowLogger] = useState(false)

  // Используем улучшенный хук useAdmin
  const adminHandlers = useAdmin({
    currentUser,
    users,
    setUsers,
    setCurrentUser: (user) => {
      // Обновление текущего пользователя
      // Можно добавить дополнительную логику
    },
    tariffs,
    setTariffs,
    setError,
    setSuccess,
  })

  // Стабильные функции для передачи в AdminPanel
  const handleCopy = useCallback((text) => {
    copyToClipboard(text)
    setSuccess('Скопировано в буфер обмена')
    setTimeout(() => setSuccess(''), 2000)
  }, [])

  const handleSetView = useCallback((view) => {
    onSetView(view)
  }, [onSetView])

  const handleLogout = useCallback(() => {
    onHandleLogout()
  }, [onHandleLogout])

  // Группируем пропсы для упрощения
  const adminPanelProps = useMemo(() => ({
    // Основные данные
    currentUser,
    adminTab: adminHandlers.adminTab,
    onSetAdminTab: adminHandlers.setAdminTab,
    onSetView: handleSetView,
    onHandleLogout: handleLogout,
    
    // Пользователи
    users,
    editingUser: adminHandlers.editingUser,
    onSetEditingUser: adminHandlers.setEditingUser,
    onHandleUpdateUser: adminHandlers.handleUpdateUser,
    onHandleDeleteUser: adminHandlers.handleDeleteUser,
    onHandleCopy: handleCopy,
    
    // Серверы
    servers: adminHandlers.servers,
    editingServer: adminHandlers.editingServer,
    onSetEditingServer: adminHandlers.setEditingServer,
    onHandleAddServer: adminHandlers.handleAddServer,
    onHandleSaveServer: adminHandlers.handleSaveServer,
    onHandleDeleteServer: adminHandlers.handleDeleteServer,
    onHandleTestServerSession: adminHandlers.handleTestServerSession,
    testingServerId: adminHandlers.testingServerId,
    newServerIdRef: { current: null },
    
    // Настройки
    settingsLoading: adminHandlers.settingsLoading,
    
    // Тарифы
    tariffs,
    editingTariff: adminHandlers.editingTariff,
    onSetEditingTariff: adminHandlers.setEditingTariff,
    onHandleSaveTariff: adminHandlers.handleSaveTariff,
    onHandleDeleteTariff: adminHandlers.handleDeleteTariff,
    onHandleSaveSettings: adminHandlers.handleSaveSettings,
    
    // Утилиты
    formatDate,
    
    // UI состояние
    showLogger,
    onSetShowLogger: setShowLogger,
    success,
    error,
    
    // Обработчики серверов
    onHandleServerNameChange: adminHandlers.handleServerNameChange,
    onHandleServerIPChange: adminHandlers.handleServerIPChange,
    onHandleServerPortChange: adminHandlers.handleServerPortChange,
    onHandleServerProtocolChange: adminHandlers.handleServerProtocolChange,
    onHandleServerRandomPathChange: adminHandlers.handleServerRandompathChange,
    onHandleServerRandomPathBlur: () => {}, // Если нужен
    onHandleServerUsernameChange: adminHandlers.handleServerXuiUsernameChange,
    onHandleServerPasswordChange: adminHandlers.handleServerXuiPasswordChange,
    onHandleServerInboundIdChange: adminHandlers.handleServerXuiInboundIdChange,
    onHandleServerLocationChange: adminHandlers.handleServerLocationChange,
    onHandleServerActiveChange: adminHandlers.handleServerActiveChange,
    onHandleServerTariffChange: adminHandlers.handleServerTariffChange,
    
    // Обработчики тарифов
    onHandleTariffNameChange: adminHandlers.handleTariffNameChange,
    onHandleTariffPlanChange: adminHandlers.handleTariffPlanChange,
    onHandleTariffPriceChange: adminHandlers.handleTariffPriceChange,
    onHandleTariffDevicesChange: adminHandlers.handleTariffDevicesChange,
    onHandleTariffTrafficGBChange: adminHandlers.handleTariffTrafficGBChange,
    onHandleTariffDurationDaysChange: adminHandlers.handleTariffDurationDaysChange,
    onHandleTariffActiveChange: adminHandlers.handleTariffActiveChange,
    
    // Функции для UserCard
    onGenerateUUID: adminHandlers.generateUUID,
    onHandleSaveUserCard: adminHandlers.handleSaveUserCard,
  }), [
    currentUser,
    users,
    tariffs,
    adminHandlers,
    handleCopy,
    handleSetView,
    handleLogout,
    showLogger,
    success,
    error,
  ])

  // Обработка ошибок на уровне родителя
  useEffect(() => {
    if (error) {
      logger.error('AdminPage', 'Ошибка', { error })
      // Можно добавить отправку в систему мониторинга
    }
  }, [error])

  return (
    <div>
      <AdminPanel {...adminPanelProps} />
    </div>
  )
}

/**
 * Альтернативный подход: использование Context API
 * 
 * Преимущества:
 * - Меньше пропсов
 * - Легче передавать данные между компонентами
 * - Проще тестировать
 */

import { createContext, useContext } from 'react'

// Создаем Context для Admin данных
const AdminContext = createContext(null)

export function AdminProvider({ children, ...adminData }) {
  return (
    <AdminContext.Provider value={adminData}>
      {children}
    </AdminContext.Provider>
  )
}

export function useAdminContext() {
  const context = useContext(AdminContext)
  if (!context) {
    throw new Error('useAdminContext должен использоваться внутри AdminProvider')
  }
  return context
}

/**
 * Упрощенный AdminPanel с использованием Context
 */
export function AdminPanelWithContext() {
  const adminData = useAdminContext()
  return <AdminPanel {...adminData} />
}

