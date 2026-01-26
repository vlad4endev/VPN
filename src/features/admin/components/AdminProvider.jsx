import { AdminProvider as AdminContextProvider } from '../context/AdminContext.jsx'
import { ensureFunction } from '../utils/safeExecute.js'

function buildContextValue(adminHandlers, adminTab, setAdminTab) {
  if (!adminHandlers) return null
  return {
    handleSaveUserCard: ensureFunction(adminHandlers.handleSaveUserCard, 'handleSaveUserCard'),
    generateUUID: ensureFunction(adminHandlers.generateUUID, 'generateUUID'),
    generateSubId: ensureFunction(adminHandlers.generateSubId, 'generateSubId'),
    handleUpdateUser: ensureFunction(adminHandlers.handleUpdateUser, 'handleUpdateUser'),
    handleDeleteUser: ensureFunction(adminHandlers.handleDeleteUser, 'handleDeleteUser'),
    loadUsers: ensureFunction(adminHandlers.loadUsers, 'loadUsers'),
    setEditingUser: adminHandlers.setEditingUser,
    editingUser: adminHandlers.editingUser,
    handleAddServer: ensureFunction(adminHandlers.handleAddServer, 'handleAddServer'),
    handleSaveServer: ensureFunction(adminHandlers.handleSaveServer, 'handleSaveServer'),
    handleDeleteServer: ensureFunction(adminHandlers.handleDeleteServer, 'handleDeleteServer'),
    handleTestServerSession: ensureFunction(adminHandlers.handleTestServerSession, 'handleTestServerSession'),
    setEditingServer: adminHandlers.setEditingServer,
    editingServer: adminHandlers.editingServer,
    testingServerId: adminHandlers.testingServerId,
    handleSaveTariff: ensureFunction(adminHandlers.handleSaveTariff, 'handleSaveTariff'),
    handleDeleteTariff: ensureFunction(adminHandlers.handleDeleteTariff, 'handleDeleteTariff'),
    setEditingTariff: adminHandlers.setEditingTariff,
    editingTariff: adminHandlers.editingTariff,
    loadTariffs: ensureFunction(adminHandlers.loadTariffs, 'loadTariffs'),
    handleSaveSettings: ensureFunction(adminHandlers.handleSaveSettings, 'handleSaveSettings'),
    loadSettings: ensureFunction(adminHandlers.loadSettings, 'loadSettings'),
    settings: adminHandlers.settings,
    settingsLoading: adminHandlers.settingsLoading,
    handleServerNameChange: ensureFunction(adminHandlers.handleServerNameChange, 'handleServerNameChange'),
    handleServerIPChange: ensureFunction(adminHandlers.handleServerIPChange, 'handleServerIPChange'),
    handleServerPortChange: ensureFunction(adminHandlers.handleServerPortChange, 'handleServerPortChange'),
    handleServerProtocolChange: ensureFunction(adminHandlers.handleServerProtocolChange, 'handleServerProtocolChange'),
    handleServerRandompathChange: ensureFunction(adminHandlers.handleServerRandompathChange, 'handleServerRandompathChange'),
    handleServerXuiUsernameChange: ensureFunction(adminHandlers.handleServerXuiUsernameChange, 'handleServerXuiUsernameChange'),
    handleServerXuiPasswordChange: ensureFunction(adminHandlers.handleServerXuiPasswordChange, 'handleServerXuiPasswordChange'),
    handleServerXuiInboundIdChange: ensureFunction(adminHandlers.handleServerXuiInboundIdChange, 'handleServerXuiInboundIdChange'),
    handleServerLocationChange: ensureFunction(adminHandlers.handleServerLocationChange, 'handleServerLocationChange'),
    handleServerActiveChange: ensureFunction(adminHandlers.handleServerActiveChange, 'handleServerActiveChange'),
    handleServerTariffChange: ensureFunction(adminHandlers.handleServerTariffChange, 'handleServerTariffChange'),
    handleTariffNameChange: ensureFunction(adminHandlers.handleTariffNameChange, 'handleTariffNameChange'),
    handleTariffPlanChange: ensureFunction(adminHandlers.handleTariffPlanChange, 'handleTariffPlanChange'),
    handleTariffPriceChange: ensureFunction(adminHandlers.handleTariffPriceChange, 'handleTariffPriceChange'),
    handleTariffDevicesChange: ensureFunction(adminHandlers.handleTariffDevicesChange, 'handleTariffDevicesChange'),
    handleTariffTrafficGBChange: ensureFunction(adminHandlers.handleTariffTrafficGBChange, 'handleTariffTrafficGBChange'),
    handleTariffDurationDaysChange: ensureFunction(adminHandlers.handleTariffDurationDaysChange, 'handleTariffDurationDaysChange'),
    handleTariffActiveChange: ensureFunction(adminHandlers.handleTariffActiveChange, 'handleTariffActiveChange'),
    adminTab: adminTab ?? 'users',
    setAdminTab: setAdminTab || (() => {}),
  }
}

const noopAsync = async () => {
  throw new Error('Admin function not available')
}

const FALLBACK_CONTEXT = {
  handleSaveUserCard: ensureFunction(null, 'handleSaveUserCard', noopAsync),
  generateUUID: ensureFunction(null, 'generateUUID', () => ''),
  generateSubId: ensureFunction(null, 'generateSubId', noopAsync),
  handleUpdateUser: ensureFunction(null, 'handleUpdateUser', noopAsync),
  handleDeleteUser: ensureFunction(null, 'handleDeleteUser', noopAsync),
  loadUsers: ensureFunction(null, 'loadUsers', noopAsync),
  setEditingUser: () => {},
  editingUser: null,
  handleAddServer: ensureFunction(null, 'handleAddServer', noopAsync),
  handleSaveServer: ensureFunction(null, 'handleSaveServer', noopAsync),
  handleDeleteServer: ensureFunction(null, 'handleDeleteServer', noopAsync),
  handleTestServerSession: ensureFunction(null, 'handleTestServerSession', noopAsync),
  setEditingServer: () => {},
  editingServer: null,
  testingServerId: null,
  handleSaveTariff: ensureFunction(null, 'handleSaveTariff', noopAsync),
  handleDeleteTariff: ensureFunction(null, 'handleDeleteTariff', noopAsync),
  setEditingTariff: () => {},
  editingTariff: null,
  loadTariffs: ensureFunction(null, 'loadTariffs', noopAsync),
  handleSaveSettings: ensureFunction(null, 'handleSaveSettings', noopAsync),
  loadSettings: ensureFunction(null, 'loadSettings', noopAsync),
  settings: null,
  settingsLoading: false,
  adminTab: 'users',
  setAdminTab: () => {},
}

/**
 * Обертка-провайдер для админ-панели. Хуков не вызывает.
 * Ожидает готовый объект injectHandlers (от useAdmin) и опционально adminTab/setAdminTab.
 * Контекст для дочерних компонентов всегда берётся из injectHandlers или из FALLBACK_CONTEXT.
 */
export const AdminProviderWrapper = ({ children, injectHandlers, adminTab, setAdminTab }) => {
  const value =
    injectHandlers != null
      ? (buildContextValue(injectHandlers, adminTab ?? 'users', setAdminTab || (() => {})) ?? FALLBACK_CONTEXT)
      : FALLBACK_CONTEXT
  return <AdminContextProvider value={value}>{children}</AdminContextProvider>
}
