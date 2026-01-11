import PropTypes from 'prop-types'

/**
 * PropTypes для AdminPanel компонента
 * Группируем связанные пропсы в объекты для упрощения
 */
export const AdminPanelPropTypes = {
  // Основные данные
  currentUser: PropTypes.shape({
    id: PropTypes.string.isRequired,
    email: PropTypes.string.isRequired,
    role: PropTypes.string.isRequired,
  }).isRequired,
  
  // Состояние вкладок
  adminTab: PropTypes.oneOf(['users', 'settings', 'tariffs', 'n8n']).isRequired,
  onSetAdminTab: PropTypes.func.isRequired,
  
  // Навигация
  onSetView: PropTypes.func.isRequired,
  onHandleLogout: PropTypes.func.isRequired,
  
  // Пользователи
  users: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      email: PropTypes.string.isRequired,
      uuid: PropTypes.string,
      name: PropTypes.string,
      phone: PropTypes.string,
      expiresAt: PropTypes.number,
      trafficGB: PropTypes.number,
      devices: PropTypes.number,
      tariffId: PropTypes.string,
      plan: PropTypes.string,
      role: PropTypes.string,
    })
  ).isRequired,
  editingUser: PropTypes.object,
  onSetEditingUser: PropTypes.func.isRequired,
  onHandleUpdateUser: PropTypes.func.isRequired,
  onHandleDeleteUser: PropTypes.func.isRequired,
  onHandleCopy: PropTypes.func.isRequired,
  
  // Серверы
  servers: PropTypes.arrayOf(PropTypes.object).isRequired,
  editingServer: PropTypes.object,
  onSetEditingServer: PropTypes.func.isRequired,
  onHandleAddServer: PropTypes.func.isRequired,
  onHandleSaveServer: PropTypes.func.isRequired,
  onHandleDeleteServer: PropTypes.func.isRequired,
  onHandleTestServerSession: PropTypes.func.isRequired,
  testingServerId: PropTypes.string,
  newServerIdRef: PropTypes.shape({
    current: PropTypes.string,
  }),
  
  // Настройки
  settingsLoading: PropTypes.bool.isRequired,
  
  // Тарифы
  tariffs: PropTypes.arrayOf(PropTypes.object).isRequired,
  editingTariff: PropTypes.object,
  onSetEditingTariff: PropTypes.func.isRequired,
  onHandleSaveTariff: PropTypes.func.isRequired,
  onHandleDeleteTariff: PropTypes.func.isRequired,
  onHandleSaveSettings: PropTypes.func.isRequired,
  
  // Утилиты
  formatDate: PropTypes.func.isRequired,
  
  // UI состояние
  showLogger: PropTypes.bool.isRequired,
  onSetShowLogger: PropTypes.func.isRequired,
  success: PropTypes.string,
  error: PropTypes.string,
  
  // Обработчики серверов (можно группировать в объект)
  onHandleServerNameChange: PropTypes.func.isRequired,
  onHandleServerIPChange: PropTypes.func.isRequired,
  onHandleServerPortChange: PropTypes.func.isRequired,
  onHandleServerProtocolChange: PropTypes.func.isRequired,
  onHandleServerRandomPathChange: PropTypes.func.isRequired,
  onHandleServerRandomPathBlur: PropTypes.func.isRequired,
  onHandleServerUsernameChange: PropTypes.func.isRequired,
  onHandleServerPasswordChange: PropTypes.func.isRequired,
  onHandleServerInboundIdChange: PropTypes.func.isRequired,
  onHandleServerLocationChange: PropTypes.func.isRequired,
  onHandleServerActiveChange: PropTypes.func.isRequired,
  onHandleServerTariffChange: PropTypes.func.isRequired,
  
  // Обработчики тарифов (можно группировать в объект)
  onHandleTariffNameChange: PropTypes.func.isRequired,
  onHandleTariffPlanChange: PropTypes.func.isRequired,
  onHandleTariffPriceChange: PropTypes.func.isRequired,
  onHandleTariffDevicesChange: PropTypes.func.isRequired,
  onHandleTariffTrafficGBChange: PropTypes.func.isRequired,
  onHandleTariffDurationDaysChange: PropTypes.func.isRequired,
  onHandleTariffActiveChange: PropTypes.func.isRequired,
  
  // Функции для UserCard
  onHandleSaveUserCard: PropTypes.func.isRequired,
  onGenerateUUID: PropTypes.func.isRequired,
}

export default AdminPanelPropTypes

