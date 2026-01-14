import { AdminProvider as AdminContextProvider } from '../context/AdminContext.jsx'
import { useAdmin } from '../hooks/useAdmin.js'
import { ensureFunction } from '../utils/safeExecute.js'

/**
 * Обертка-провайдер для админ-панели
 * 
 * Получает функции из useAdmin хука, оборачивает их через ensureFunction
 * и предоставляет через контекст всем дочерним компонентам.
 * 
 * @param {Object} props - Пропсы для useAdmin
 * @param {React.ReactNode} props.children - Дочерние компоненты
 * @param {Object} props.currentUser - Текущий пользователь
 * @param {Array} props.users - Список пользователей
 * @param {Function} props.setUsers - Функция обновления пользователей
 * @param {Function} props.setCurrentUser - Функция обновления текущего пользователя
 * @param {Array} props.tariffs - Список тарифов
 * @param {Function} props.setTariffs - Функция обновления тарифов
 * @param {Function} props.setError - Функция установки ошибки
 * @param {Function} props.setSuccess - Функция установки успеха
 */
export const AdminProviderWrapper = ({ children, ...adminProps }) => {
  const adminHandlers = useAdmin(adminProps)
  
  // ВАЖНО: Проверяем, что adminHandlers существует
  if (!adminHandlers) {
    console.error('❌ AdminProviderWrapper: adminHandlers не определен!', {
      adminProps,
      adminHandlers,
    })
    // Возвращаем минимальный контекст с fallback функциями
    const fallbackContextValue = {
      handleSaveUserCard: ensureFunction(null, 'handleSaveUserCard'),
      generateUUID: ensureFunction(null, 'generateUUID'),
      generateSubId: ensureFunction(null, 'generateSubId'),
      handleUpdateUser: ensureFunction(null, 'handleUpdateUser'),
      handleDeleteUser: ensureFunction(null, 'handleDeleteUser'),
      loadUsers: ensureFunction(null, 'loadUsers'),
      setEditingUser: () => {},
      editingUser: null,
      handleAddServer: ensureFunction(null, 'handleAddServer'),
      handleSaveServer: ensureFunction(null, 'handleSaveServer'),
      handleDeleteServer: ensureFunction(null, 'handleDeleteServer'),
      handleTestServerSession: ensureFunction(null, 'handleTestServerSession'),
      setEditingServer: () => {},
      editingServer: null,
      testingServerId: null,
      handleSaveTariff: ensureFunction(null, 'handleSaveTariff'),
      handleDeleteTariff: ensureFunction(null, 'handleDeleteTariff'),
      setEditingTariff: () => {},
      editingTariff: null,
      loadTariffs: ensureFunction(null, 'loadTariffs'),
      handleSaveSettings: ensureFunction(null, 'handleSaveSettings'),
      loadSettings: ensureFunction(null, 'loadSettings'),
      settings: null,
      settingsLoading: false,
      adminTab: 'users',
      setAdminTab: () => {},
    }
    return (
      <AdminContextProvider value={fallbackContextValue}>
        {children}
      </AdminContextProvider>
    )
  }
  
  // Создаем контекстное значение с гарантированными функциями
  const contextValue = {
    // Функции пользователей
    handleSaveUserCard: ensureFunction(
      adminHandlers.handleSaveUserCard,
      'handleSaveUserCard'
    ),
    generateUUID: ensureFunction(
      adminHandlers.generateUUID,
      'generateUUID'
    ),
    generateSubId: ensureFunction(
      adminHandlers.generateSubId,
      'generateSubId'
    ),
    handleUpdateUser: ensureFunction(
      adminHandlers.handleUpdateUser,
      'handleUpdateUser'
    ),
    handleDeleteUser: ensureFunction(
      adminHandlers.handleDeleteUser,
      'handleDeleteUser'
    ),
    loadUsers: ensureFunction(
      adminHandlers.loadUsers,
      'loadUsers'
    ),
    setEditingUser: adminHandlers.setEditingUser,
    editingUser: adminHandlers.editingUser,
    
    // Функции серверов
    handleAddServer: ensureFunction(
      adminHandlers.handleAddServer,
      'handleAddServer'
    ),
    handleSaveServer: ensureFunction(
      adminHandlers.handleSaveServer,
      'handleSaveServer'
    ),
    handleDeleteServer: ensureFunction(
      adminHandlers.handleDeleteServer,
      'handleDeleteServer'
    ),
    handleTestServerSession: ensureFunction(
      adminHandlers.handleTestServerSession,
      'handleTestServerSession'
    ),
    setEditingServer: adminHandlers.setEditingServer,
    editingServer: adminHandlers.editingServer,
    testingServerId: adminHandlers.testingServerId,
    
    // Функции тарифов
    handleSaveTariff: ensureFunction(
      adminHandlers.handleSaveTariff,
      'handleSaveTariff'
    ),
    handleDeleteTariff: ensureFunction(
      adminHandlers.handleDeleteTariff,
      'handleDeleteTariff'
    ),
    setEditingTariff: adminHandlers.setEditingTariff,
    editingTariff: adminHandlers.editingTariff,
    loadTariffs: ensureFunction(
      adminHandlers.loadTariffs,
      'loadTariffs'
    ),
    
    // Функции настроек
    handleSaveSettings: ensureFunction(
      adminHandlers.handleSaveSettings,
      'handleSaveSettings'
    ),
    loadSettings: ensureFunction(
      adminHandlers.loadSettings,
      'loadSettings'
    ),
    settings: adminHandlers.settings,
    settingsLoading: adminHandlers.settingsLoading,
    
    // Обработчики полей сервера
    handleServerNameChange: ensureFunction(
      adminHandlers.handleServerNameChange,
      'handleServerNameChange'
    ),
    handleServerIPChange: ensureFunction(
      adminHandlers.handleServerIPChange,
      'handleServerIPChange'
    ),
    handleServerPortChange: ensureFunction(
      adminHandlers.handleServerPortChange,
      'handleServerPortChange'
    ),
    handleServerProtocolChange: ensureFunction(
      adminHandlers.handleServerProtocolChange,
      'handleServerProtocolChange'
    ),
    handleServerRandompathChange: ensureFunction(
      adminHandlers.handleServerRandompathChange,
      'handleServerRandompathChange'
    ),
    handleServerXuiUsernameChange: ensureFunction(
      adminHandlers.handleServerXuiUsernameChange,
      'handleServerXuiUsernameChange'
    ),
    handleServerXuiPasswordChange: ensureFunction(
      adminHandlers.handleServerXuiPasswordChange,
      'handleServerXuiPasswordChange'
    ),
    handleServerXuiInboundIdChange: ensureFunction(
      adminHandlers.handleServerXuiInboundIdChange,
      'handleServerXuiInboundIdChange'
    ),
    handleServerLocationChange: ensureFunction(
      adminHandlers.handleServerLocationChange,
      'handleServerLocationChange'
    ),
    handleServerActiveChange: ensureFunction(
      adminHandlers.handleServerActiveChange,
      'handleServerActiveChange'
    ),
    handleServerTariffChange: ensureFunction(
      adminHandlers.handleServerTariffChange,
      'handleServerTariffChange'
    ),
    
    // Обработчики полей тарифа
    handleTariffNameChange: ensureFunction(
      adminHandlers.handleTariffNameChange,
      'handleTariffNameChange'
    ),
    handleTariffPlanChange: ensureFunction(
      adminHandlers.handleTariffPlanChange,
      'handleTariffPlanChange'
    ),
    handleTariffPriceChange: ensureFunction(
      adminHandlers.handleTariffPriceChange,
      'handleTariffPriceChange'
    ),
    handleTariffDevicesChange: ensureFunction(
      adminHandlers.handleTariffDevicesChange,
      'handleTariffDevicesChange'
    ),
    handleTariffTrafficGBChange: ensureFunction(
      adminHandlers.handleTariffTrafficGBChange,
      'handleTariffTrafficGBChange'
    ),
    handleTariffDurationDaysChange: ensureFunction(
      adminHandlers.handleTariffDurationDaysChange,
      'handleTariffDurationDaysChange'
    ),
    handleTariffActiveChange: ensureFunction(
      adminHandlers.handleTariffActiveChange,
      'handleTariffActiveChange'
    ),
    
    // Состояние вкладки
    adminTab: adminHandlers.adminTab,
    setAdminTab: adminHandlers.setAdminTab,
  }
  
  // ВАЖНО: Убеждаемся, что contextValue всегда определен
  if (!contextValue) {
    console.error('❌ AdminProviderWrapper: contextValue не определен!', {
      adminHandlers,
      adminProps,
    })
    throw new Error('AdminProviderWrapper: contextValue не может быть undefined')
  }
  
  return (
    <AdminContextProvider value={contextValue}>
      {children}
    </AdminContextProvider>
  )
}
