import { useCallback, useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { Settings, Users, Server, DollarSign, Edit2, Save, X, Bug, LogOut, Copy, Trash2, CheckCircle2, XCircle, AlertCircle, PlusCircle, TestTube, Loader2, Network, Activity, Link2, Monitor, CreditCard, Smartphone, Laptop, Apple } from 'lucide-react'
import { useAdminContext } from '../context/AdminContext.jsx'
import LoggerPanel from '../../../shared/components/LoggerPanel.jsx'
import Sidebar from '../../../shared/components/Sidebar.jsx'
import { getUserStatus } from '../../../shared/utils/userStatus.js'
import VirtualizedUserTable from './VirtualizedUserTable.jsx'
import UserCard from './UserCard.jsx'
import N8nPanel from './N8nPanel.jsx'
import YooMoneyPanel from './YooMoneyPanel.jsx'
import SystemMonitor from './SystemMonitor.jsx'
import { AdminPanelPropTypes } from './AdminPanel.propTypes.js'
import { logError } from '../utils/errorHandler.js'

const AdminPanel = ({
  currentUser,
  adminTab,
  onSetAdminTab,
  onSetView,
  onHandleLogout,
  users,
  editingUser,
  onSetEditingUser,
  onHandleUpdateUser,
  onHandleDeleteUser,
  onHandleCopy,
  servers,
  editingServer,
  onSetEditingServer,
  onHandleAddServer,
  onHandleSaveServer,
  onHandleDeleteServer,
  onHandleTestServerSession,
  testingServerId,
  newServerIdRef,
  settingsLoading,
  tariffs,
  editingTariff,
  onSetEditingTariff,
  onHandleSaveTariff,
  onHandleDeleteTariff,
  onHandleSaveSettings,
  formatDate,
  showLogger,
  onSetShowLogger,
  success,
  error,
  // Обработчики для полей сервера
  onHandleServerNameChange,
  onHandleServerIPChange,
  onHandleServerPortChange,
  onHandleServerProtocolChange,
  onHandleServerRandomPathChange,
  onHandleServerRandomPathBlur,
  onHandleServerUsernameChange,
  onHandleServerPasswordChange,
  onHandleServerInboundIdChange,
  onHandleServerLocationChange,
  onHandleServerActiveChange,
  onHandleServerTariffChange,
  // Обработчики для полей тарифа
  onHandleTariffNameChange,
  onHandleTariffPlanChange,
  onHandleTariffPriceChange,
  onHandleTariffDevicesChange,
  onHandleTariffTrafficGBChange,
  onHandleTariffDurationDaysChange,
  onHandleTariffActiveChange,
  onHandleTariffSubscriptionLinkChange,
  settings,
  onHandleAppLinkChange,
}) => {
  // Валидация пропсов в режиме разработки
  if (import.meta.env.DEV) {
    PropTypes.checkPropTypes(AdminPanelPropTypes, { 
      currentUser, adminTab, onSetAdminTab, onSetView, onHandleLogout,
      users, editingUser, onSetEditingUser, onHandleUpdateUser, onHandleDeleteUser, onHandleCopy,
      servers, editingServer, onSetEditingServer, onHandleAddServer, onHandleSaveServer,
      onHandleDeleteServer, onHandleTestServerSession, testingServerId, newServerIdRef,
      settingsLoading, tariffs, editingTariff, onSetEditingTariff, onHandleSaveTariff,
      onHandleDeleteTariff, onHandleSaveSettings, formatDate, showLogger, onSetShowLogger,
      success, error, onHandleServerNameChange, onHandleServerIPChange, onHandleServerPortChange,
      onHandleServerProtocolChange, onHandleServerRandomPathChange, onHandleServerRandomPathBlur,
      onHandleServerUsernameChange, onHandleServerPasswordChange, onHandleServerInboundIdChange,
      onHandleServerLocationChange, onHandleServerActiveChange, onHandleServerTariffChange,
      onHandleTariffNameChange, onHandleTariffPlanChange, onHandleTariffPriceChange,
      onHandleTariffDevicesChange, onHandleTariffTrafficGBChange, onHandleTariffDurationDaysChange,
      onHandleTariffActiveChange, settings, onHandleAppLinkChange
      // onHandleSaveUserCard и onGenerateUUID больше не передаются через пропсы - используются из контекста в UserCard
    }, 'prop', 'AdminPanel')
  }
  
  // Состояние для открытия карточки пользователя
  const [selectedUser, setSelectedUser] = useState(null)
  
  // Обновляем selectedUser при изменении users, чтобы карточка показывала актуальные данные
  useEffect(() => {
    if (selectedUser) {
      const updatedUser = users.find(u => u.id === selectedUser.id)
      if (updatedUser) {
        // Обновляем только если данные действительно изменились
        const hasChanges = JSON.stringify(selectedUser) !== JSON.stringify(updatedUser)
        if (hasChanges) {
          console.log('🔄 Обновление selectedUser в карточке:', { old: selectedUser, new: updatedUser })
          setSelectedUser(updatedUser)
        }
      }
    }
  }, [users, selectedUser?.id])

  // Обработчик открытия карточки пользователя
  const handleUserRowClick = useCallback((user) => {
    setSelectedUser(user)
  }, [])

  // Обработчик закрытия карточки
  const handleCloseUserCard = useCallback(() => {
    setSelectedUser(null)
  }, [])

  // Функции handleSaveUserCard и generateUUID теперь получаются из контекста в UserCard
  // AdminPanel больше не передает эти функции через пропсы

  // Обработчики для полей пользователя (создаем внутри компонента)
  const handleUserRoleChange = useCallback((e) => {
    const value = e.target.value
    onSetEditingUser(prev => prev ? { ...prev, role: value } : null)
  }, [onSetEditingUser])

  const handleUserPlanChange = useCallback((e) => {
    const value = e.target.value
    onSetEditingUser(prev => prev ? { ...prev, plan: value } : null)
  }, [onSetEditingUser])

  const handleUserDevicesChange = useCallback((e) => {
    const value = Number(e.target.value) || 1
    onSetEditingUser(prev => prev ? { ...prev, devices: value } : null)
  }, [onSetEditingUser])

  const handleUserExpiresAtChange = useCallback((e) => {
    const value = e.target.value ? new Date(e.target.value).getTime() : null
    onSetEditingUser(prev => prev ? { ...prev, expiresAt: value } : null)
  }, [onSetEditingUser])

  const tabs = [
    { id: 'users', label: 'Пользователи', icon: Users },
    { id: 'settings', label: 'Настройки', icon: Server },
    { id: 'tariffs', label: 'Тарифы и цены', icon: DollarSign },
    { id: 'payments', label: 'Платежи', icon: CreditCard },
    { id: 'n8n', label: 'n8n', icon: Link2 },
  ]

  // Состояние для модального окна мониторинга
  const [showMonitoring, setShowMonitoring] = useState(false)

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden">
      <Sidebar currentUser={currentUser} view="admin" onSetView={onSetView} onLogout={onHandleLogout} />
      <div className="flex-1 w-full min-w-0 p-3 sm:p-4 md:p-6 lg:pl-0 pt-14 sm:pt-16 lg:pt-4 lg:pt-6 lg:overflow-y-auto">
        <div className="w-full max-w-[90rem] mx-auto">
          {/* Шапка - Mobile First компактная */}
          <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl p-3 sm:p-4 mb-3 sm:mb-4 border border-slate-800">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
              <div className="flex-1 min-w-0">
                <h1 className="text-lg sm:text-[clamp(1.25rem,1.1rem+0.75vw,1.875rem)] font-bold text-slate-200 flex items-center gap-2">
                  <Settings className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                  <span className="truncate">Админ-панель</span>
                </h1>
                <p className="text-xs sm:text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400 mt-0.5">Управление системой</p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setShowMonitoring(true)}
                  className="btn-icon-only-mobile min-h-[36px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 sm:py-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-lg transition-all flex items-center justify-center gap-1.5 text-xs sm:text-sm flex-1 sm:flex-initial touch-manipulation"
                  title="Открыть мониторинг сервера"
                  aria-label="Открыть мониторинг"
                >
                  <Monitor className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="btn-text whitespace-nowrap">Мониторинг</span>
                </button>
                <button
                  onClick={() => onSetShowLogger(true)}
                  className="btn-icon-only-mobile min-h-[36px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 sm:py-2 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg transition-all flex items-center justify-center gap-1.5 text-xs sm:text-sm flex-1 sm:flex-initial touch-manipulation"
                  title="Открыть логи"
                  aria-label="Открыть логи"
                >
                  <Bug className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="btn-text whitespace-nowrap">Логи</span>
                </button>
              </div>
            </div>
          </div>

        {/* Табы - Mobile First: компактные с горизонтальной прокруткой */}
        <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 mb-3 sm:mb-4 overflow-hidden">
          <div className="flex border-b border-slate-800 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => onSetAdminTab(tab.id)}
                  className={`min-h-[40px] sm:min-h-[44px] flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 font-medium transition-all whitespace-nowrap flex-shrink-0 touch-manipulation ${
                    adminTab === tab.id
                      ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-800/50'
                      : 'text-slate-400 hover:text-slate-200 active:text-slate-200 hover:bg-slate-800/30 active:bg-slate-800/50'
                  }`}
                  aria-label={tab.label}
                  aria-selected={adminTab === tab.id}
                >
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="text-xs sm:text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Контент табов */}
        {adminTab === 'users' && (
          <>
            <VirtualizedUserTable
              users={users}
              editingUser={editingUser}
              onSetEditingUser={onSetEditingUser}
              onHandleUpdateUser={onHandleUpdateUser}
              onHandleDeleteUser={onHandleDeleteUser}
              onHandleCopy={onHandleCopy}
              currentUser={currentUser}
              formatDate={formatDate}
              handleUserRoleChange={handleUserRoleChange}
              handleUserPlanChange={handleUserPlanChange}
              handleUserDevicesChange={handleUserDevicesChange}
              handleUserExpiresAtChange={handleUserExpiresAtChange}
              onUserRowClick={handleUserRowClick}
            />
            {/* Карточка пользователя */}
            {selectedUser && (
              <UserCard
                user={selectedUser}
                onClose={handleCloseUserCard}
                onCopy={onHandleCopy}
                tariffs={tariffs}
                formatDate={formatDate}
              />
            )}
          </>
        )}

        {adminTab === 'settings' && (
          <div className="space-y-[clamp(1rem,0.8rem+1vw,2rem)]">
            {/* Блок 1: Серверы 3x-ui - Mobile First */}
            <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 section-spacing-sm">
              <div className="mb-4 sm:mb-5 md:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200 mb-1.5 sm:mb-2 flex items-center gap-2">
                    <Server className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
                    <span className="truncate">Серверы 3x-ui</span>
                  </h2>
                  <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400">Управление серверами для взаимодействия с панелями 3x-ui</p>
                </div>
                <button
                  onClick={onHandleAddServer}
                  className="btn-icon-only-mobile min-h-[32px] sm:min-h-[40px] w-full sm:w-auto px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 md:py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-base touch-manipulation"
                  aria-label="Добавить сервер"
                >
                  <PlusCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 flex-shrink-0" />
                  <span className="btn-text whitespace-nowrap">Добавить сервер</span>
                </button>
              </div>

              {settingsLoading ? (
                <div className="flex items-center justify-center py-8 sm:py-10 md:py-12">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 border-2 border-slate-600 border-t-blue-600 rounded-full animate-spin"></div>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {/* Форма редактирования сервера - Mobile First */}
                  {editingServer && (
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault()
                        onHandleSaveServer()
                      }}
                      className="p-4 sm:p-5 md:p-6 bg-slate-800 rounded-lg sm:rounded-xl border border-slate-700"
                    >
                      <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg font-semibold text-slate-200 mb-3 sm:mb-4">
                        {editingServer.id && servers.find(s => s.id === editingServer.id) ? 'Редактирование сервера' : 'Новый сервер'}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div>
                          <label htmlFor={`server-${editingServer.id || 'new'}-name`} className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-medium mb-1.5 sm:mb-2">Название сервера *</label>
                          <input
                            id={`server-${editingServer.id || 'new'}-name`}
                            name="server-name"
                            type="text"
                            value={editingServer.name || ''}
                            onChange={onHandleServerNameChange}
                            className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                            placeholder="NL Server 1"
                          />
                        </div>
                        <div>
                          <label htmlFor={`server-${editingServer.id || 'new'}-ip`} className="block text-slate-300 text-sm font-medium mb-2">IP адрес / Домен *</label>
                          <input
                            id={`server-${editingServer.id || 'new'}-ip`}
                            name="server-ip"
                            type="text"
                            value={editingServer.serverIP || ''}
                            onChange={onHandleServerIPChange}
                            className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                            placeholder="localhost или your-server.com"
                          />
                        </div>
                        <div>
                          <label htmlFor={`server-${editingServer.id || 'new'}-port`} className="block text-slate-300 text-sm font-medium mb-2">Порт *</label>
                          <input
                            id={`server-${editingServer.id || 'new'}-port`}
                            name="server-port"
                            type="number"
                            min="1"
                            max="65535"
                            value={editingServer.serverPort || 2053}
                            onChange={onHandleServerPortChange}
                            className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                            placeholder="2053"
                          />
                        </div>
                        <div>
                          <label htmlFor={`server-${editingServer.id || 'new'}-protocol`} className="block text-slate-300 text-sm font-medium mb-2">Протокол *</label>
                          <select
                            id={`server-${editingServer.id || 'new'}-protocol`}
                            name="server-protocol"
                            value={editingServer.protocol || (editingServer.serverPort === 443 || editingServer.serverPort === 40919 ? 'https' : 'http')}
                            onChange={onHandleServerProtocolChange}
                            className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                          >
                            <option value="http">HTTP</option>
                            <option value="https">HTTPS</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`server-${editingServer.id || 'new'}-path`} className="block text-slate-300 text-sm font-medium mb-2">Random Path</label>
                          <input
                            id={`server-${editingServer.id || 'new'}-path`}
                            name="server-path"
                            type="text"
                            value={editingServer.randompath || ''}
                            onChange={onHandleServerRandomPathChange}
                            onBlur={onHandleServerRandomPathBlur}
                            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                            placeholder="/Gxckr4KcZGtB6aOZdw"
                          />
                        </div>
                        <div>
                          <label htmlFor={`server-${editingServer.id || 'new'}-username`} className="block text-slate-300 text-sm font-medium mb-2">Username *</label>
                          <input
                            id={`server-${editingServer.id || 'new'}-username`}
                            name="server-username"
                            type="text"
                            value={editingServer.xuiUsername || ''}
                            onChange={onHandleServerUsernameChange}
                            autoComplete="username"
                            className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                            placeholder="admin"
                          />
                        </div>
                        <div>
                          <label htmlFor={`server-${editingServer.id || 'new'}-password`} className="block text-slate-300 text-sm font-medium mb-2">Password *</label>
                          <input
                            id={`server-${editingServer.id || 'new'}-password`}
                            name="server-password"
                            type="password"
                            value={editingServer.xuiPassword || ''}
                            onChange={onHandleServerPasswordChange}
                            autoComplete="new-password"
                            className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                            placeholder="••••••••"
                          />
                        </div>
                        <div>
                          <label htmlFor={`server-${editingServer.id || 'new'}-inbound`} className="block text-slate-300 text-sm font-medium mb-2">Inbound ID *</label>
                          <input
                            id={`server-${editingServer.id || 'new'}-inbound`}
                            name="server-inbound"
                            type="text"
                            value={editingServer.xuiInboundId || ''}
                            onChange={onHandleServerInboundIdChange}
                            className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                            placeholder="1"
                          />
                        </div>
                        <div>
                          <label htmlFor={`server-${editingServer.id || 'new'}-location`} className="block text-slate-300 text-sm font-medium mb-2">Локация</label>
                          <input
                            id={`server-${editingServer.id || 'new'}-location`}
                            name="server-location"
                            type="text"
                            value={editingServer.location || ''}
                            onChange={onHandleServerLocationChange}
                            className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                            placeholder="NL, US, RU и т.д."
                          />
                        </div>
                        <div className="md:col-span-2">
                          <div className="block text-slate-300 text-sm font-medium mb-2">Привязка к тарифам</div>
                          <div className="flex flex-wrap gap-2">
                            {tariffs.map(tariff => (
                              <label key={tariff.id} htmlFor={`server-${editingServer.id || 'new'}-tariff-${tariff.id}`} className="flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded cursor-pointer hover:bg-slate-800">
                                <input
                                  id={`server-${editingServer.id || 'new'}-tariff-${tariff.id}`}
                                  name={`server-tariff-${tariff.id}`}
                                  type="checkbox"
                                  checked={(editingServer.tariffIds || []).includes(tariff.id)}
                                  onChange={(e) => onHandleServerTariffChange(tariff.id, e.target.checked)}
                                  className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 rounded focus:ring-blue-500"
                                />
                                <span className="text-slate-300 text-sm">{tariff.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <label htmlFor={`server-${editingServer.id || 'new'}-active`} className="flex items-center gap-2">
                            <input
                              id={`server-${editingServer.id || 'new'}-active`}
                              name="server-active"
                              type="checkbox"
                              checked={editingServer.active !== false}
                              onChange={onHandleServerActiveChange}
                              className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 rounded focus:ring-blue-500"
                            />
                            <span className="text-slate-300 text-sm">Активен</span>
                          </label>
                        </div>
                      </div>
                      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 mt-4 sm:mt-5 md:mt-6">
                        <button
                          type="button"
                          onClick={() => {
                            newServerIdRef.current = null
                            onSetEditingServer(null)
                          }}
                          className="btn-icon-only-mobile min-h-[32px] sm:min-h-[40px] w-full sm:w-auto px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 md:py-2.5 bg-slate-600 hover:bg-slate-700 active:bg-slate-800 text-white rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-base touch-manipulation"
                          aria-label="Отмена"
                        >
                          <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 flex-shrink-0" />
                          <span className="btn-text">Отмена</span>
                        </button>
                        <button
                          type="submit"
                          className="btn-icon-only-mobile min-h-[32px] sm:min-h-[40px] w-full sm:w-auto px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 md:py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-base touch-manipulation"
                          aria-label="Сохранить"
                        >
                          <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 flex-shrink-0" />
                          <span className="btn-text">Сохранить</span>
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Список серверов - Mobile First с вертикальным стеком на мобильных */}
                  {servers.length === 0 ? (
                    <div className="text-center py-8 sm:py-10 md:py-12 text-slate-400">
                      <Server className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                      <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">Серверы не добавлены</p>
                      <p className="text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] mt-2">Нажмите "Добавить сервер" для создания</p>
                    </div>
                  ) : (
                    <div className="space-y-3 sm:space-y-4">
                      {servers.map((server) => {
                        const isTesting = testingServerId === server.id
                        const protocol = server.serverPort === 443 ? 'https' : 'http'
                        const serverURL = `${protocol}://${server.serverIP}:${server.serverPort}${server.randompath || ''}`
                        
                        return (
                          <div key={server.id} className="p-4 sm:p-5 bg-slate-800 rounded-lg sm:rounded-xl border border-slate-700">
                            <div className="flex flex-col lg:flex-row items-start lg:items-start justify-between gap-3 sm:gap-4">
                              <div className="flex-1 min-w-0 w-full">
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                                  <h4 className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg font-semibold text-slate-200 truncate">{server.name}</h4>
                                  {server.active ? (
                                    <span className="px-2 py-1 bg-green-900/30 text-green-400 rounded text-xs font-medium">Активен</span>
                                  ) : (
                                    <span className="px-2 py-1 bg-slate-700 text-slate-400 rounded text-xs font-medium">Неактивен</span>
                                  )}
                                  {server.sessionTested && (
                                    <span className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${
                                      server.sessionError 
                                        ? 'bg-red-900/30 text-red-400' 
                                        : 'bg-green-900/30 text-green-400'
                                    }`}>
                                      {server.sessionError ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                                      {server.sessionError ? 'Ошибка сессии' : 'Сессия OK'}
                                    </span>
                                  )}
                                  {server.location && (
                                    <span className="px-2 py-1 bg-blue-900/30 text-blue-400 rounded text-xs font-medium">
                                      {server.location}
                                    </span>
                                  )}
                                </div>
                                <div className="space-y-1.5 sm:space-y-2 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400 break-words">
                                  <p className="break-all"><strong className="text-slate-300">URL:</strong> <code className="font-mono text-xs sm:text-sm break-all">{serverURL}</code></p>
                                  <p><strong className="text-slate-300">Inbound ID:</strong> {server.xuiInboundId || '—'}</p>
                                  {server.tariffIds && server.tariffIds.length > 0 && (
                                    <p>
                                      <strong className="text-slate-300">Тарифы:</strong>{' '}
                                      {server.tariffIds.map(id => {
                                        const tariff = tariffs.find(t => t.id === id)
                                        return tariff ? tariff.name : id
                                      }).join(', ')}
                                    </p>
                                  )}
                                  {server.sessionTestedAt && (
                                    <p className="text-xs text-slate-500">
                                      Последний тест: {formatDate(server.sessionTestedAt)}
                                    </p>
                                  )}
                                </div>
                              </div>
                              {/* Кнопки действий - вертикальный стек на мобильных, горизонтальный на десктопе */}
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto lg:flex-shrink-0">
                                <button
                                  onClick={() => onHandleTestServerSession(server)}
                                  disabled={isTesting}
                                  className="btn-icon-only-mobile min-h-[32px] sm:min-h-[40px] px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg sm:rounded-xl text-xs sm:text-sm md:text-base transition-all flex items-center justify-center gap-1.5 sm:gap-2 touch-manipulation flex-1 sm:flex-initial"
                                  title="Получить данные сессии и сохранить cookies"
                                  aria-label="Получить данные сессии"
                                >
                                  {isTesting ? (
                                    <>
                                      <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin flex-shrink-0" />
                                      <span className="btn-text whitespace-nowrap">Получение...</span>
                                    </>
                                  ) : (
                                    <>
                                      <TestTube className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                                      <span className="btn-text whitespace-nowrap">Получить данные</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => {
                                    const serverToEdit = { ...server }
                                    console.log('🔍 Открытие формы редактирования сервера', {
                                      serverId: serverToEdit.id,
                                      serverName: serverToEdit.name,
                                      protocol: serverToEdit.protocol,
                                      serverPort: serverToEdit.serverPort,
                                      allFields: serverToEdit
                                    })
                                    onSetEditingServer(serverToEdit)
                                  }}
                                  className="btn-icon-only-mobile min-h-[32px] sm:min-h-[40px] px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-2.5 bg-slate-600 hover:bg-slate-700 active:bg-slate-800 text-white rounded-lg sm:rounded-xl text-xs sm:text-sm md:text-base transition-all flex items-center justify-center gap-1.5 sm:gap-2 touch-manipulation flex-1 sm:flex-initial"
                                  aria-label="Редактировать сервер"
                                >
                                  <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 flex-shrink-0" />
                                  <span className="btn-text whitespace-nowrap">Редактировать</span>
                                </button>
                                <button
                                  onClick={() => onHandleDeleteServer(server.id)}
                                  className="btn-icon-only-mobile min-h-[32px] sm:min-h-[40px] px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-lg sm:rounded-xl text-xs sm:text-sm md:text-base transition-all flex items-center justify-center gap-1.5 sm:gap-2 touch-manipulation flex-1 sm:flex-initial"
                                  aria-label="Удалить сервер"
                                >
                                  <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 flex-shrink-0" />
                                  <span className="btn-text whitespace-nowrap">Удалить</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Блок 2: Ссылки на приложения HAPP Proxy - Mobile First */}
            <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 section-spacing-sm">
              <div className="mb-4 sm:mb-5 md:mb-6">
                <div className="flex-1 min-w-0">
                  <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200 mb-1.5 sm:mb-2 flex items-center gap-2">
                    <Link2 className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
                    <span className="truncate">Ссылки на приложения HAPP Proxy</span>
                  </h2>
                  <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400">
                    Настройка ссылок для скачивания приложений. Ссылки будут использоваться в кнопках конфигурации вместо happ://
                  </p>
                </div>
              </div>

              {settingsLoading ? (
                <div className="flex items-center justify-center py-8 sm:py-10 md:py-12">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 border-2 border-slate-600 border-t-blue-600 rounded-full animate-spin"></div>
                </div>
              ) : (
                <div className="space-y-4 sm:space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    {/* Android */}
                    <div>
                      <label htmlFor="app-link-android" className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-medium mb-1.5 sm:mb-2 flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-green-400 flex-shrink-0" />
                        <span>Android</span>
                      </label>
                      <input
                        id="app-link-android"
                        type="url"
                        value={settings?.appLinks?.android || ''}
                        onChange={(e) => onHandleAppLinkChange('android', e.target.value)}
                        className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                        placeholder="https://play.google.com/store/apps/details?id=..."
                      />
                    </div>

                    {/* iOS */}
                    <div>
                      <label htmlFor="app-link-ios" className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-medium mb-1.5 sm:mb-2 flex items-center gap-2">
                        <Apple className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        <span>iOS</span>
                      </label>
                      <input
                        id="app-link-ios"
                        type="url"
                        value={settings?.appLinks?.ios || ''}
                        onChange={(e) => onHandleAppLinkChange('ios', e.target.value)}
                        className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                        placeholder="https://apps.apple.com/app/..."
                      />
                    </div>

                    {/* macOS */}
                    <div>
                      <label htmlFor="app-link-macos" className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-medium mb-1.5 sm:mb-2 flex items-center gap-2">
                        <Laptop className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        <span>macOS</span>
                      </label>
                      <input
                        id="app-link-macos"
                        type="url"
                        value={settings?.appLinks?.macos || ''}
                        onChange={(e) => onHandleAppLinkChange('macos', e.target.value)}
                        className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                        placeholder="https://apps.apple.com/app/..."
                      />
                    </div>

                    {/* Windows */}
                    <div>
                      <label htmlFor="app-link-windows" className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-medium mb-1.5 sm:mb-2 flex items-center gap-2">
                        <Monitor className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        <span>Windows</span>
                      </label>
                      <input
                        id="app-link-windows"
                        type="url"
                        value={settings?.appLinks?.windows || ''}
                        onChange={(e) => onHandleAppLinkChange('windows', e.target.value)}
                        className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                        placeholder="https://microsoft.com/store/apps/..."
                      />
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2 sm:pt-3 border-t border-slate-800">
                    <button
                      onClick={onHandleSaveSettings}
                      className="btn-icon-only-mobile min-h-[32px] sm:min-h-[40px] w-full sm:w-auto px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 md:py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-base touch-manipulation"
                      aria-label="Сохранить ссылки на приложения"
                    >
                      <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 flex-shrink-0" />
                      <span className="btn-text">Сохранить ссылки</span>
                    </button>
                  </div>

                  <div className="bg-blue-900/20 border border-blue-800 rounded-lg sm:rounded-xl p-3 sm:p-4">
                    <p className="text-slate-300 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">
                      <strong className="text-blue-400">Примечание:</strong> Если ссылка не указана для платформы, будет использоваться формат <code className="text-blue-300 font-mono">happ://add/</code> с URL подписки.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {adminTab === 'payments' && (
          <YooMoneyPanel onSaveSettings={onHandleSaveSettings} />
        )}

        {adminTab === 'tariffs' && (
          <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 section-spacing-sm">
            <div className="mb-4 sm:mb-5 md:mb-6">
              <div>
                <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200 mb-1.5 sm:mb-2">Тарифы и цены</h2>
                <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400">Управление тарифными планами SUPER и MULTI</p>
              </div>
            </div>

            {editingTariff && (
              <div className="mb-4 sm:mb-5 md:mb-6 p-4 sm:p-5 md:p-6 bg-slate-800 rounded-lg sm:rounded-xl border border-slate-700">
                <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg font-semibold text-slate-200 mb-3 sm:mb-4">
                  {editingTariff.id && !editingTariff.id.startsWith('default-') ? 'Редактирование тарифа' : 'Новый тариф'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label htmlFor={`tariff-${editingTariff.id || 'new'}-name`} className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-medium mb-1.5 sm:mb-2">Название</label>
                    <input
                      id={`tariff-${editingTariff.id || 'new'}-name`}
                      name="tariff-name"
                      type="text"
                      value={editingTariff.name || ''}
                      onChange={onHandleTariffNameChange}
                      className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                      placeholder="Премиум"
                    />
                  </div>
                  <div>
                    <label htmlFor={`tariff-${editingTariff.id || 'new'}-plan`} className="block text-slate-300 text-sm font-medium mb-2">План (ID)</label>
                    <input
                      id={`tariff-${editingTariff.id || 'new'}-plan`}
                      name="tariff-plan"
                      type="text"
                      value={editingTariff.plan || ''}
                      onChange={onHandleTariffPlanChange}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="premium"
                    />
                  </div>
                  <div>
                    <label htmlFor={`tariff-${editingTariff.id || 'new'}-price`} className="block text-slate-300 text-sm font-medium mb-2">Цена (руб.)</label>
                    <input
                      id={`tariff-${editingTariff.id || 'new'}-price`}
                      name="tariff-price"
                      type="number"
                      min="0"
                      value={editingTariff.price || 0}
                      onChange={onHandleTariffPriceChange}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="500"
                    />
                  </div>
                  <div>
                    <label htmlFor={`tariff-${editingTariff.id || 'new'}-devices`} className="block text-slate-300 text-sm font-medium mb-2">Количество устройств</label>
                    <input
                      id={`tariff-${editingTariff.id || 'new'}-devices`}
                      name="tariff-devices"
                      type="number"
                      min="1"
                      value={editingTariff.devices || 1}
                      onChange={onHandleTariffDevicesChange}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="5"
                    />
                  </div>
                  <div>
                    <label htmlFor={`tariff-${editingTariff.id || 'new'}-traffic-gb`} className="block text-slate-300 text-sm font-medium mb-2">Трафик (GB, 0 = безлимит)</label>
                    <input
                      id={`tariff-${editingTariff.id || 'new'}-traffic-gb`}
                      name="tariff-traffic-gb"
                      type="number"
                      min="0"
                      value={editingTariff.trafficGB || 0}
                      onChange={onHandleTariffTrafficGBChange}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label htmlFor={`tariff-${editingTariff.id || 'new'}-duration-days`} className="block text-slate-300 text-sm font-medium mb-2">Длительность (дней)</label>
                    <input
                      id={`tariff-${editingTariff.id || 'new'}-duration-days`}
                      name="tariff-duration-days"
                      type="number"
                      min="1"
                      value={editingTariff.durationDays || 30}
                      onChange={onHandleTariffDurationDaysChange}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="30"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor={`tariff-${editingTariff.id || 'new'}-subscription-link`} className="block text-slate-300 text-sm font-medium mb-2">
                      Ссылка для подписок (без subId)
                    </label>
                    <input
                      id={`tariff-${editingTariff.id || 'new'}-subscription-link`}
                      name="tariff-subscription-link"
                      type="url"
                      value={editingTariff.subscriptionLink || ''}
                      onChange={onHandleTariffSubscriptionLinkChange}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                      placeholder="https://subs.skypath.fun:3458/vk198/"
                    />
                    <p className="text-slate-500 text-xs mt-1">
                      Введите ссылку без subId. При оформлении подписки к ней будет добавлен subId пользователя.
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor={`tariff-${editingTariff.id || 'new'}-active`} className="flex items-center gap-2">
                      <input
                        id={`tariff-${editingTariff.id || 'new'}-active`}
                        name="tariff-active"
                        type="checkbox"
                        checked={editingTariff.active !== false}
                        onChange={onHandleTariffActiveChange}
                        className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 rounded focus:ring-blue-500"
                      />
                      <span className="text-slate-300 text-sm">Активен</span>
                    </label>
                  </div>
                </div>
                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 mt-4 sm:mt-5">
                  <button
                    onClick={() => onSetEditingTariff(null)}
                    className="btn-icon-only-mobile min-h-[32px] sm:min-h-[40px] w-full sm:w-auto px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 md:py-2.5 bg-slate-600 hover:bg-slate-700 active:bg-slate-800 text-white rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-base touch-manipulation"
                    aria-label="Отмена"
                  >
                    <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 flex-shrink-0" />
                    <span className="btn-text">Отмена</span>
                  </button>
                  <button
                    onClick={() => onHandleSaveTariff(editingTariff)}
                    className="btn-icon-only-mobile min-h-[32px] sm:min-h-[40px] w-full sm:w-auto px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 md:py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-base touch-manipulation"
                    aria-label="Сохранить тариф"
                  >
                    <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 flex-shrink-0" />
                    <span className="btn-text">Сохранить</span>
                  </button>
                </div>
              </div>
            )}

            {/* Table with Card layout on mobile, table on desktop */}
            <div className="overflow-x-auto -mx-2 sm:mx-0 md:hidden">
              {/* Mobile Card Layout */}
              <div className="space-y-3 px-2">
                {tariffs.map((tariff) => (
                  <div key={tariff.id} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs font-medium text-slate-400 uppercase">Название</span>
                        <p className="text-slate-200 font-semibold mt-0.5">{tariff.name}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-slate-400 uppercase">План</span>
                        <p className="text-slate-400 font-mono text-sm mt-0.5">{tariff.plan}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-slate-400 uppercase">Цена</span>
                        <p className="text-slate-200 mt-0.5">{tariff.price} ₽</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-slate-400 uppercase">Устройства</span>
                        <p className="text-slate-200 mt-0.5">{tariff.devices}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-slate-400 uppercase">Трафик</span>
                        <p className="text-slate-200 mt-0.5">
                          {tariff.trafficGB === 0 ? 'Безлимит' : `${tariff.trafficGB} GB`}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-slate-400 uppercase">Длительность</span>
                        <p className="text-slate-200 mt-0.5">{tariff.durationDays} дн.</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-slate-400 uppercase">Статус</span>
                        <div className="mt-0.5">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            tariff.active ? 'bg-green-900/30 text-green-400' : 'bg-slate-700 text-slate-400'
                          }`}>
                            {tariff.active ? 'Активен' : 'Неактивен'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-700">
                        <button
                          onClick={() => onSetEditingTariff({ ...tariff })}
                          className="btn-icon-only-mobile min-h-[32px] sm:min-h-[40px] min-w-[32px] sm:min-w-[40px] flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 touch-manipulation"
                          aria-label="Редактировать тариф"
                        >
                          <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                          <span className="btn-text">Редактировать</span>
                        </button>
                        {(() => {
                          const plan = tariff.plan?.toLowerCase()
                          const name = tariff.name?.toLowerCase()
                          const isSuperOrMulti = plan === 'super' || plan === 'multi' || name === 'super' || name === 'multi'
                          
                          if (!isSuperOrMulti && !tariff.id?.startsWith('default-')) {
                            return (
                              <button
                                onClick={() => onHandleDeleteTariff(tariff.id)}
                                className="btn-icon-only-mobile min-h-[32px] sm:min-h-[40px] min-w-[32px] sm:min-w-[40px] flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 sm:py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-lg text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 touch-manipulation"
                                aria-label="Удалить тариф"
                              >
                                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                <span className="btn-text">Удалить</span>
                              </button>
                            )
                          }
                          return null
                        })()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Desktop Table Layout */}
            <div className="hidden md:block overflow-x-auto -mx-2 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <table className="min-w-full divide-y divide-slate-800">
                  <thead className="bg-slate-800">
                    <tr>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Название</th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">План</th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Цена</th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Устройства</th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Трафик</th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Длительность</th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Статус</th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {tariffs.map((tariff) => (
                      <tr key={tariff.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-slate-200">{tariff.name}</td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-slate-400 font-mono text-sm">{tariff.plan}</td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-slate-200">{tariff.price} ₽</td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-slate-200">{tariff.devices}</td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-slate-200">
                          {tariff.trafficGB === 0 ? 'Безлимит' : `${tariff.trafficGB} GB`}
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-slate-200">{tariff.durationDays} дн.</td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            tariff.active ? 'bg-green-900/30 text-green-400' : 'bg-slate-700 text-slate-400'
                          }`}>
                            {tariff.active ? 'Активен' : 'Неактивен'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <button
                              onClick={() => onSetEditingTariff({ ...tariff })}
                              className="min-h-[32px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 touch-manipulation"
                              aria-label="Редактировать тариф"
                            >
                              <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                              <span>Редактировать</span>
                            </button>
                            {(() => {
                              const plan = tariff.plan?.toLowerCase()
                              const name = tariff.name?.toLowerCase()
                              const isSuperOrMulti = plan === 'super' || plan === 'multi' || name === 'super' || name === 'multi'
                              
                              if (!isSuperOrMulti && !tariff.id?.startsWith('default-')) {
                                return (
                                  <button
                                    onClick={() => onHandleDeleteTariff(tariff.id)}
                                    className="min-h-[32px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 sm:py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-lg text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 touch-manipulation"
                                    aria-label="Удалить тариф"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                    <span>Удалить</span>
                                  </button>
                                )
                              }
                              return null
                            })()}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {adminTab === 'n8n' && (
          <N8nPanel onSaveSettings={onHandleSaveSettings} />
        )}

        {success && (
          <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-green-900/30 border border-green-800 rounded-lg sm:rounded-xl text-green-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">
            {success}
          </div>
        )}

        {error && (
          <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-red-900/30 border border-red-800 rounded-lg sm:rounded-xl text-red-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">
            {error}
          </div>
        )}
        </div>
      </div>
      {showLogger && <LoggerPanel onClose={() => onSetShowLogger(false)} />}
      {showMonitoring && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4" onClick={() => setShowMonitoring(false)}>
          <div className="bg-slate-900 rounded-xl shadow-2xl border border-slate-800 w-full max-w-7xl max-h-[90vh] overflow-y-auto m-2 sm:m-4" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-4 sm:p-6 flex items-center justify-between z-10">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-200 flex items-center gap-2">
                <Monitor className="w-6 h-6" />
                Мониторинг сервера
              </h2>
              <button
                onClick={() => setShowMonitoring(false)}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
                aria-label="Закрыть мониторинг"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6">
              <SystemMonitor />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// PropTypes
AdminPanel.propTypes = AdminPanelPropTypes

export default AdminPanel

