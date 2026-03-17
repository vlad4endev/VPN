import { useCallback, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'
import { Settings, Users, Server, DollarSign, Edit2, Save, X, Bug, LogOut, Copy, Trash2, CheckCircle2, XCircle, AlertCircle, PlusCircle, TestTube, Loader2, Network, Activity, Link2, Monitor, CreditCard, Smartphone, Laptop, Apple, MessageCircle, LayoutDashboard, Database, RefreshCw } from 'lucide-react'
import { useAdminContext } from '../context/AdminContext.jsx'
import { useAppStore } from '../../../lib/store/appStore.js'
import LoggerPanel from '../../../shared/components/LoggerPanel.jsx'
import Sidebar from '../../../shared/components/Sidebar.jsx'
import Footer from '../../../shared/components/Footer.jsx'
import { getUserStatus } from '../../../shared/utils/userStatus.js'
import VirtualizedUserTable from './VirtualizedUserTable.jsx'
import UserCard from './UserCard.jsx'
import N8nPanel from './N8nPanel.jsx'
import PlategaPanel from './PlategaPanel.jsx'
import XuiHttpRequestsPanel from './XuiHttpRequestsPanel.jsx'
import PromocodesPanel from './PromocodesPanel.jsx'
import ReviewsPanel from './ReviewsPanel.jsx'
import SupportTicketsPanel from './SupportTicketsPanel.jsx'
import SystemMonitor from './SystemMonitor.jsx'
import AdminDashboard from './AdminDashboard.jsx'
import SeoSettingsPanel from './SeoSettingsPanel.jsx'
import MailingsSection from '../../notifications/components/MailingsSection.jsx'
import { AdminPanelPropTypes } from './AdminPanel.propTypes.js'
import { getAdminSectionByTabId } from '../constants/navSections.js'
import { logError } from '../utils/errorHandler.js'
import CreateUserModal from './CreateUserModal.jsx'
import ImportFromNocoDBModal from './ImportFromNocoDBModal.jsx'
import TelegramSection from './TelegramSection.jsx'
import AIPanel from './AIPanel.jsx'
import ErrorsPanel from './ErrorsPanel.jsx'
import AnalyticsFunnelPanel from './AnalyticsFunnelPanel.jsx'

const AdminPanel = ({
  currentUser,
  adminTab,
  onSetAdminTab,
  onSetView,
  onHandleLogout,
  editingUser,
  onSetEditingUser,
  onHandleUpdateUser,
  onHandleDeleteUser,
  onHandleCopy,
  editingServer,
  onSetEditingServer,
  onHandleAddServer,
  onHandleSaveServer,
  onHandleDeleteServer,
  onHandleTestServerSession,
  testingServerId,
  newServerIdRef,
  settingsLoading,
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
  onHandleTariffSubscriptionLinkChange = () => {},
  onHandleTariffLinkedTariffIdsChange = () => {},
  onHandleDeduplicateTariffs = () => {},
  onHandleAppLinkChange,
  onHandleSeoChange = () => {},
  onHandleTariffConditionChange = () => {},
  onSetSuccess = () => {},
  onSetError = () => {},
  sidebarView, // для раздела «Аналитика»: передать 'analytics', чтобы в сайдбаре подсвечивался нужный пункт
}) => {
    const { users, servers, tariffs, settings } = useAppStore()
  const ctx = useAdminContext()
  const onHandleDeduplicateTariffsEffective = ctx?.handleDeduplicateTariffs ?? onHandleDeduplicateTariffs
  const onHandleTariffLinkedTariffIdsChangeEffective = ctx?.handleTariffLinkedTariffIdsChange ?? onHandleTariffLinkedTariffIdsChange
  const onHandleAddLinkedTariff = ctx?.handleAddLinkedTariff ?? (() => {})
  const onHandleRemoveLinkedTariff = ctx?.handleRemoveLinkedTariff ?? (() => {})
  const onHandleUpdateLinkedTariffConfig = ctx?.handleUpdateLinkedTariffConfig ?? (() => {})
  // Форма тарифа использует контекст, чтобы состояние и обработчики были из одного источника (иначе поля не редактируются)
  const effectiveEditingTariff = ctx?.editingTariff ?? editingTariff
  const effectiveSetEditingTariff = ctx?.setEditingTariff ?? onSetEditingTariff
  const effectiveHandleTariffNameChange = ctx?.handleTariffNameChange ?? onHandleTariffNameChange
  const effectiveHandleTariffPlanChange = ctx?.handleTariffPlanChange ?? onHandleTariffPlanChange
  const effectiveHandleTariffPriceChange = ctx?.handleTariffPriceChange ?? onHandleTariffPriceChange
  const effectiveHandleTariffDevicesChange = ctx?.handleTariffDevicesChange ?? onHandleTariffDevicesChange
  const effectiveHandleTariffTrafficGBChange = ctx?.handleTariffTrafficGBChange ?? onHandleTariffTrafficGBChange
  const effectiveHandleTariffDurationDaysChange = ctx?.handleTariffDurationDaysChange ?? onHandleTariffDurationDaysChange
  const effectiveHandleTariffActiveChange = ctx?.handleTariffActiveChange ?? onHandleTariffActiveChange
  const effectiveHandleTariffSubscriptionLinkChange = ctx?.handleTariffSubscriptionLinkChange ?? onHandleTariffSubscriptionLinkChange
  const effectiveHandleSaveTariff = ctx?.handleSaveTariff ?? onHandleSaveTariff
  const linkedConfigsSyncedRef = useRef(false)
  useEffect(() => {
    if (!effectiveEditingTariff || !tariffs?.length) return
    const ids = effectiveEditingTariff.linkedTariffIds
    const configs = effectiveEditingTariff.linkedTariffConfigs
    if (Array.isArray(ids) && ids.length > 0 && (!Array.isArray(configs) || configs.length === 0) && !linkedConfigsSyncedRef.current) {
      linkedConfigsSyncedRef.current = true
      const built = ids.map(tariffId => {
        const t = tariffs.find(x => x.id === tariffId)
        return t ? { tariffId: t.id, subscriptionLink: (t.subscriptionLink || '').trim(), devices: Number(t.devices) || 1, trafficGB: Number(t.trafficGB) ?? 0 } : null
      }).filter(Boolean)
      if (built.length) effectiveSetEditingTariff({ ...effectiveEditingTariff, linkedTariffConfigs: built })
    }
    if (!effectiveEditingTariff.linkedTariffIds?.length) linkedConfigsSyncedRef.current = false
  }, [effectiveEditingTariff?.id, effectiveEditingTariff?.linkedTariffIds?.length, tariffs?.length, effectiveSetEditingTariff])
  // Валидация пропсов в режиме разработки
  if (import.meta.env.DEV) {
    PropTypes.checkPropTypes(AdminPanelPropTypes, { 
      currentUser, adminTab, onSetAdminTab, onSetView, onHandleLogout, editingUser, onSetEditingUser, onHandleUpdateUser, onHandleDeleteUser, onHandleCopy, editingServer, onSetEditingServer, onHandleAddServer, onHandleSaveServer,
      onHandleDeleteServer, onHandleTestServerSession, testingServerId, newServerIdRef,
      settingsLoading, editingTariff, onSetEditingTariff, onHandleSaveTariff,
      onHandleDeleteTariff, onHandleSaveSettings, formatDate, showLogger, onSetShowLogger,
      success, error, onSetSuccess, onSetError, onHandleServerNameChange, onHandleServerIPChange, onHandleServerPortChange,
      onHandleServerProtocolChange, onHandleServerRandomPathChange, onHandleServerRandomPathBlur,
      onHandleServerUsernameChange, onHandleServerPasswordChange, onHandleServerInboundIdChange,
      onHandleServerLocationChange, onHandleServerActiveChange, onHandleServerTariffChange,
      onHandleTariffNameChange, onHandleTariffPlanChange, onHandleTariffPriceChange,
      onHandleTariffDevicesChange, onHandleTariffTrafficGBChange, onHandleTariffDurationDaysChange,
      onHandleTariffActiveChange, onHandleTariffSubscriptionLinkChange, onHandleTariffLinkedTariffIdsChange, onHandleDeduplicateTariffs, onHandleAppLinkChange, onHandleSeoChange, onHandleTariffConditionChange
      // onHandleSaveUserCard и onGenerateUUID больше не передаются через пропсы - используются из контекста в UserCard
    }, 'prop', 'AdminPanel')
  }
  
  const adminContext = useAdminContext()
  const { t } = useTranslation()
  const {
    reviews = [],
    reviewsLoading = false,
    loadReviews,
    handleApproveReview,
    handleRejectReview,
    loadUsers,
  } = adminContext || {}

  // Состояние для открытия карточки пользователя
  const [selectedUser, setSelectedUser] = useState(null)
  const [showCreateUserModal, setShowCreateUserModal] = useState(false)
  const [showImportNocoDBModal, setShowImportNocoDBModal] = useState(false)

  // Обновляем selectedUser при изменении чтобы карточка показывала актуальные данные
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
  }, [ selectedUser?.id])

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

  // Состояние для модального окна мониторинга
  const [showMonitoring, setShowMonitoring] = useState(false)

  const sectionInfo = getAdminSectionByTabId(adminTab)

  return (
    <div className="min-h-screen min-h-[100dvh] flex-1 flex flex-col lg:flex-row lg:min-h-0 lg:h-screen lg:overflow-hidden overflow-x-hidden bg-slate-950">
      <Sidebar
        currentUser={currentUser}
        view={sidebarView || 'admin'}
        onSetView={onSetView}
        onLogout={onHandleLogout}
        adminTab={adminTab}
        onSetAdminTab={onSetAdminTab}
      />
      <div className="flex-1 w-full min-w-0 flex flex-col min-h-0 pt-14 sm:pt-16 lg:pt-4 lg:pt-6 pb-20 sm:pb-24 lg:pb-6">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 lg:pl-0 lg:pr-4">
          <div className={`w-full max-w-content lg:max-w-none mx-auto min-w-0 ${adminTab === 'users' ? 'flex flex-col flex-1 min-h-0' : ''}`}>
          {/* Шапка - Mobile First компактная */}
          <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl p-3 sm:p-4 mb-3 sm:mb-4 border border-slate-800">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
              <div className="flex-1 min-w-0">
                <h1 className="text-lg sm:text-[clamp(1.25rem,1.1rem+0.75vw,1.875rem)] font-bold text-slate-200 flex items-center gap-2">
                  <Settings className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                  <span className="truncate">{t('sidebar.admin')}</span>
                </h1>
                <p className="text-xs sm:text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400 mt-0.5">
                  {sectionInfo ? (
                    <span><span className="text-slate-500">{t(sectionInfo.sectionTitleKey)}</span><span className="text-slate-500 mx-1">→</span><span>{t(sectionInfo.itemLabelKey)}</span></span>
                  ) : (
                    t('admin.manageSystem')
                  )}
                </p>
              </div>
              <div className="flex flex-row items-center gap-1.5 sm:gap-2 w-full sm:w-auto min-w-0 shrink-0 flex-wrap sm:flex-nowrap">
                {adminTab !== 'dashboard' && (
                  <button
                    onClick={() => onSetAdminTab('dashboard')}
                    className="flex-1 sm:flex-none btn-icon-only-mobile min-h-[44px] sm:min-h-[40px] min-w-0 px-2 sm:px-3 py-2 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg transition-all flex items-center justify-center gap-1.5 text-xs sm:text-sm touch-manipulation"
                    title={t('admin.toDashboard')}
                    aria-label={t('admin.dashboard')}
                  >
                    <LayoutDashboard className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="btn-text whitespace-nowrap">{t('admin.dashboard')}</span>
                  </button>
                )}
                <button
                  onClick={() => setShowMonitoring(true)}
                  className="flex-1 sm:flex-none btn-icon-only-mobile min-h-[44px] sm:min-h-[40px] min-w-0 px-2 sm:px-3 py-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-lg transition-all flex items-center justify-center gap-1.5 text-xs sm:text-sm touch-manipulation"
                  title="Открыть мониторинг сервера"
                  aria-label="Открыть мониторинг"
                >
                  <Monitor className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="btn-text whitespace-nowrap">Мониторинг</span>
                </button>
                <button
                  onClick={() => onSetAdminTab('tickets')}
                  className={`flex-1 sm:flex-none btn-icon-only-mobile min-h-[44px] sm:min-h-[40px] min-w-0 px-2 sm:px-3 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 text-xs sm:text-sm touch-manipulation ${adminTab === 'tickets' ? 'bg-blue-600 text-white' : 'bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white'}`}
                  title="Перейти к тикетам"
                  aria-label="Тикеты"
                >
                  <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="btn-text whitespace-nowrap">Тикеты</span>
                </button>
                <button
                  onClick={() => onSetShowLogger(true)}
                  className="flex-1 sm:flex-none btn-icon-only-mobile min-h-[44px] sm:min-h-[40px] min-w-0 px-2 sm:px-3 py-2 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg transition-all flex items-center justify-center gap-1.5 text-xs sm:text-sm touch-manipulation"
                  title="Открыть логи"
                  aria-label="Открыть логи"
                >
                  <Bug className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="btn-text whitespace-nowrap">Логи</span>
                </button>
              </div>
            </div>
          </div>

        {/* Навигация по разделам — в боковом меню (десктоп) и в нижней панели (мобильные), дубли в контенте убраны */}

        {/* Контент табов */}
        {adminTab === 'dashboard' && (
          <AdminDashboard
            users={users}
            servers={servers}
            tariffs={tariffs}
            onSetAdminTab={onSetAdminTab}
          />
        )}

        {adminTab === 'users' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-shrink-0 mb-3 sm:mb-4 flex flex-wrap items-center justify-end gap-2 sm:gap-2.5">
              {typeof loadUsers === 'function' && (
                <button
                  type="button"
                  onClick={() => loadUsers()}
                  className="inline-flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] px-3 sm:px-4 py-2 rounded-xl sm:rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs sm:text-sm font-medium transition-colors touch-manipulation"
                  title="Обновить список пользователей"
                  aria-label="Обновить список"
                >
                  <RefreshCw className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Обновить</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowImportNocoDBModal(true)}
                className="inline-flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] px-3 sm:px-4 py-2 rounded-xl sm:rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-xs sm:text-sm font-medium transition-colors touch-manipulation"
                aria-label="Импорт из NocoDB"
              >
                <Database className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">Импорт из NocoDB</span>
                <span className="sm:hidden">NocoDB</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCreateUserModal(true)}
                className="inline-flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] px-3 sm:px-4 py-2 rounded-xl sm:rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium transition-colors touch-manipulation"
                aria-label="Добавить пользователя"
              >
                <PlusCircle className="w-4 h-4 flex-shrink-0" />
                <span>Добавить</span>
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
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
            </div>
            {/* Карточка пользователя — через портал, чтобы не обрезалась из-за overflow на десктопе */}
            {selectedUser && createPortal(
              <UserCard
                user={selectedUser}
                onClose={handleCloseUserCard}
                onCopy={onHandleCopy}
                tariffs={tariffs}
                formatDate={formatDate}
              />,
              document.body
            )}
            {showCreateUserModal && (
              <CreateUserModal onClose={() => setShowCreateUserModal(false)} />
            )}
            {showImportNocoDBModal && (
              <ImportFromNocoDBModal onClose={() => setShowImportNocoDBModal(false)} />
            )}
          </div>
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
                                  {Array.isArray(server.tariffIds) && server.tariffIds.length > 0 && (
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

            {/* Подраздел 3x-ui: HTTP запросы */}
            <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 section-spacing-sm">
              <div className="mb-4 sm:mb-5 md:mb-6">
                <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200 mb-1.5 sm:mb-2 flex items-center gap-2">
                  <Activity className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
                  <span className="truncate">HTTP запросы (3x-ui)</span>
                </h2>
                <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400">
                  Все запросы к API 3x-ui по методам. Можно редактировать path и body, подставлять переменные из настроек сервера и пользователя.
                </p>
              </div>
              {settingsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-7 h-7 border-2 border-slate-600 border-t-blue-600 rounded-full animate-spin" />
                </div>
              ) : (
                <XuiHttpRequestsPanel
                  servers={servers}
                  settings={settings}
                />
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

            {/* Блок 3: Описания и условия тарифов (отображаются в личном кабинете) */}
            <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 section-spacing-sm">
              <div className="mb-4 sm:mb-5 md:mb-6">
                <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200 mb-1.5 sm:mb-2 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
                  <span>Описания и условия тарифов</span>
                </h2>
                <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400">
                  Текст отображается в личном кабинете под описанием тарифа. Ключи: Super, MULTI, MegaMIX, для остальных — «По умолчанию».
                </p>
              </div>
              {settingsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-7 h-7 border-2 border-slate-600 border-t-blue-600 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  {[
                    { key: 'super', label: 'Super' },
                    { key: 'multi', label: 'MULTI' },
                    { key: 'megamix', label: 'MegaMIX' },
                    { key: 'default', label: 'По умолчанию (остальные тарифы)' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label htmlFor={`tariff-condition-${key}`} className="block text-slate-300 text-sm font-medium mb-1.5">{label}</label>
                      <textarea
                        id={`tariff-condition-${key}`}
                        rows={2}
                        value={settings?.tariffConditions?.[key] ?? ''}
                        onChange={(e) => onHandleTariffConditionChange(key, e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y min-h-[60px]"
                        placeholder={key === 'default' ? 'Условия для тарифов без отдельной настройки' : `Условия тарифа ${label}`}
                      />
                    </div>
                  ))}
                  <div className="flex justify-end pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={onHandleSaveSettings}
                      className="min-h-[40px] px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Сохранить настройки
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {adminTab === 'payments' && (
          <PlategaPanel onSaveSettings={onHandleSaveSettings} />
        )}

        {adminTab === 'promocodes' && (
          <PromocodesPanel currentUserId={currentUser?.id} tariffs={tariffs} />
        )}

        {adminTab === 'seo' && (
          <SeoSettingsPanel
            settings={settings}
            settingsLoading={settingsLoading}
            onChange={onHandleSeoChange}
            onSave={onHandleSaveSettings}
          />
        )}

        {adminTab === 'tariffs' && (
          <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 section-spacing-sm">
            <div className="mb-4 sm:mb-5 md:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200 mb-1.5 sm:mb-2">Тарифы и цены</h2>
                <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-400">Управление тарифными планами. Новые тарифы отображаются в выборе в личном кабинете.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onHandleDeduplicateTariffsEffective}
                  className="min-h-[40px] px-4 py-2 bg-slate-600 hover:bg-slate-500 active:bg-slate-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 touch-manipulation"
                  aria-label="Объединить дубли тарифов"
                  title="Объединить полностью одинаковые тарифы в один; пользователи и платежи привяжутся к оставшемуся"
                >
                  <Trash2 className="w-4 h-4 flex-shrink-0" />
                  <span>Объединить дубли тарифов</span>
                </button>
                <button
                  type="button"
                  onClick={() => effectiveSetEditingTariff({ id: 'default-new', name: '', plan: '', price: 0, devices: 1, trafficGB: 0, durationDays: 30, active: true, subscriptionLink: '', linkedTariffIds: [] })}
                  className="min-h-[40px] px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 touch-manipulation"
                  aria-label="Добавить тариф"
                >
                  <PlusCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Добавить тариф</span>
                </button>
              </div>
            </div>

            {effectiveEditingTariff && (
              <div className="mb-4 sm:mb-5 md:mb-6 p-4 sm:p-5 md:p-6 bg-slate-800 rounded-lg sm:rounded-xl border border-slate-700">
                <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg font-semibold text-slate-200 mb-3 sm:mb-4">
                  {effectiveEditingTariff.id && !effectiveEditingTariff.id.startsWith('default-') ? 'Редактирование тарифа' : 'Новый тариф'}
                </h3>
                {(() => {
                  const isCombined = Array.isArray(effectiveEditingTariff?.linkedTariffConfigs) && effectiveEditingTariff.linkedTariffConfigs.length > 0
                  return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label htmlFor={`tariff-${effectiveEditingTariff.id || 'new'}-name`} className="block text-slate-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] font-medium mb-1.5 sm:mb-2">Название</label>
                    <input
                      id={`tariff-${effectiveEditingTariff.id || 'new'}-name`}
                      name="tariff-name"
                      type="text"
                      value={effectiveEditingTariff.name || ''}
                      onChange={effectiveHandleTariffNameChange}
                      className="w-full min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-lg sm:rounded-xl text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all touch-manipulation"
                      placeholder="Премиум"
                    />
                  </div>
                  <div>
                    <label htmlFor={`tariff-${effectiveEditingTariff.id || 'new'}-plan`} className="block text-slate-300 text-sm font-medium mb-2">План (ID)</label>
                    <input
                      id={`tariff-${effectiveEditingTariff.id || 'new'}-plan`}
                      name="tariff-plan"
                      type="text"
                      value={effectiveEditingTariff.plan || ''}
                      onChange={effectiveHandleTariffPlanChange}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="premium"
                    />
                  </div>
                  <div>
                    <label htmlFor={`tariff-${effectiveEditingTariff.id || 'new'}-price`} className="block text-slate-300 text-sm font-medium mb-2">
                      {isCombined ? 'Общая цена (руб.)' : 'Цена (руб.)'}
                    </label>
                    <input
                      id={`tariff-${effectiveEditingTariff.id || 'new'}-price`}
                      name="tariff-price"
                      type="number"
                      min="0"
                      value={effectiveEditingTariff.price ?? ''}
                      onChange={effectiveHandleTariffPriceChange}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="500"
                    />
                  </div>
                  {!isCombined && (
                    <>
                  <div>
                    <label htmlFor={`tariff-${effectiveEditingTariff.id || 'new'}-devices`} className="block text-slate-300 text-sm font-medium mb-2">Количество устройств</label>
                    <input
                      id={`tariff-${effectiveEditingTariff.id || 'new'}-devices`}
                      name="tariff-devices"
                      type="number"
                      min="1"
                      value={effectiveEditingTariff.devices || 1}
                      onChange={effectiveHandleTariffDevicesChange}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="5"
                    />
                  </div>
                  <div>
                    <label htmlFor={`tariff-${effectiveEditingTariff.id || 'new'}-traffic-gb`} className="block text-slate-300 text-sm font-medium mb-2">Трафик (GB, 0 = безлимит)</label>
                    <input
                      id={`tariff-${effectiveEditingTariff.id || 'new'}-traffic-gb`}
                      name="tariff-traffic-gb"
                      type="number"
                      min="0"
                      value={effectiveEditingTariff.trafficGB || 0}
                      onChange={effectiveHandleTariffTrafficGBChange}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </div>
                    </>
                  )}
                  <div>
                    <label htmlFor={`tariff-${effectiveEditingTariff.id || 'new'}-duration-days`} className="block text-slate-300 text-sm font-medium mb-2">Длительность (дней)</label>
                    <input
                      id={`tariff-${effectiveEditingTariff.id || 'new'}-duration-days`}
                      name="tariff-duration-days"
                      type="number"
                      min="1"
                      value={effectiveEditingTariff.durationDays || 30}
                      onChange={effectiveHandleTariffDurationDaysChange}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="30"
                    />
                  </div>
                  {!isCombined && (
                  <div className="md:col-span-2">
                    <label htmlFor={`tariff-${effectiveEditingTariff.id || 'new'}-subscription-link`} className="block text-slate-300 text-sm font-medium mb-2">
                      Ссылка для подписок (без subId)
                    </label>
                    <input
                      id={`tariff-${effectiveEditingTariff.id || 'new'}-subscription-link`}
                      name="tariff-subscription-link"
                      type="url"
                      value={effectiveEditingTariff.subscriptionLink || ''}
                      onChange={effectiveHandleTariffSubscriptionLinkChange}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                      placeholder="https://subs.skypath.fun:3458/vk198/"
                    />
                    <p className="text-slate-500 text-xs mt-1">
                      Введите ссылку без subId. При оформлении подписки к ней будет добавлен subId пользователя.
                    </p>
                  </div>
                  )}
                  <div className="md:col-span-2">
                    <label className="block text-slate-300 text-sm font-medium mb-2">
                      Объединённые тарифы (2+ серверов)
                    </label>
                    <p className="text-slate-500 text-xs mb-2">
                      Цена — общая (указана выше). Выберите тарифы по порядку: подтянутся ссылки подписки, устройства и трафик; их можно изменить для каждого. Клиент создаётся на каждом сервере, пользователь получает ссылки на подписку для всех.
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {tariffs.filter(t => t.id !== (effectiveEditingTariff?.id)).map((t) => {
                        const configs = Array.isArray(effectiveEditingTariff?.linkedTariffConfigs) ? effectiveEditingTariff.linkedTariffConfigs : []
                        const linked = configs.some(c => c.tariffId === t.id)
                        return (
                          <label key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-600 bg-slate-800/50 cursor-pointer hover:border-slate-500">
                            <input
                              type="checkbox"
                              checked={linked}
                              onChange={() => {
                                if (linked) onHandleRemoveLinkedTariff(t.id)
                                else onHandleAddLinkedTariff(t)
                              }}
                              className="w-4 h-4 text-blue-600 rounded border-slate-600"
                            />
                            <span className="text-slate-200 text-sm">{t.name || t.plan}</span>
                          </label>
                        )
                      })}
                      {tariffs.filter(t => t.id !== (effectiveEditingTariff?.id)).length === 0 && (
                        <span className="text-slate-500 text-sm">Нет других тарифов для выбора</span>
                      )}
                    </div>
                    {Array.isArray(effectiveEditingTariff?.linkedTariffConfigs) && effectiveEditingTariff.linkedTariffConfigs.length > 0 && (
                      <div className="space-y-3 mt-3 p-3 rounded-lg border border-slate-600 bg-slate-800/30">
                        <span className="text-slate-400 text-xs font-medium uppercase">Настройки по каждому тарифу (ссылка, устройства, трафик)</span>
                        {effectiveEditingTariff.linkedTariffConfigs.map((cfg, idx) => {
                          const t = tariffs.find(x => x.id === cfg.tariffId)
                          const name = t?.name || t?.plan || cfg.tariffId
                          return (
                            <div key={cfg.tariffId} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                              <div className="sm:col-span-12 flex items-center justify-between gap-2">
                                <span className="text-slate-200 font-medium text-sm">#{idx + 1} {name}</span>
                                <button type="button" onClick={() => onHandleRemoveLinkedTariff(cfg.tariffId)} className="text-red-400 hover:text-red-300 text-xs">Убрать</button>
                              </div>
                              <div className="sm:col-span-12">
                                <label className="block text-slate-400 text-xs mb-1">Ссылка подписки</label>
                                <input
                                  type="url"
                                  value={cfg.subscriptionLink || ''}
                                  onChange={(e) => onHandleUpdateLinkedTariffConfig(cfg.tariffId, { subscriptionLink: e.target.value })}
                                  placeholder="https://..."
                                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-slate-200 text-sm"
                                />
                              </div>
                              <div className="sm:col-span-4">
                                <label className="block text-slate-400 text-xs mb-1">Устройства</label>
                                <input
                                  type="number"
                                  min={1}
                                  value={cfg.devices ?? 1}
                                  onChange={(e) => onHandleUpdateLinkedTariffConfig(cfg.tariffId, { devices: e.target.value })}
                                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-slate-200 text-sm"
                                />
                              </div>
                              <div className="sm:col-span-4">
                                <label className="block text-slate-400 text-xs mb-1">Трафик (GB, 0 = безлимит)</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={cfg.trafficGB ?? 0}
                                  onChange={(e) => onHandleUpdateLinkedTariffConfig(cfg.tariffId, { trafficGB: e.target.value })}
                                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-slate-200 text-sm"
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor={`tariff-${effectiveEditingTariff.id || 'new'}-active`} className="flex items-center gap-2">
                      <input
                        id={`tariff-${effectiveEditingTariff.id || 'new'}-active`}
                        name="tariff-active"
                        type="checkbox"
                        checked={effectiveEditingTariff.active !== false}
                        onChange={effectiveHandleTariffActiveChange}
                        className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 rounded focus:ring-blue-500"
                      />
                      <span className="text-slate-300 text-sm">Активен</span>
                    </label>
                  </div>
                </div>
                ); })()}
                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 mt-4 sm:mt-5">
                  <button
                    onClick={() => effectiveSetEditingTariff(null)}
                    className="btn-icon-only-mobile min-h-[32px] sm:min-h-[40px] w-full sm:w-auto px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 md:py-2.5 bg-slate-600 hover:bg-slate-700 active:bg-slate-800 text-white rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-base touch-manipulation"
                    aria-label="Отмена"
                  >
                    <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 flex-shrink-0" />
                    <span className="btn-text">Отмена</span>
                  </button>
                  <button
                    onClick={() => effectiveHandleSaveTariff(effectiveEditingTariff)}
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
                        <span className="text-xs font-medium text-slate-400 uppercase">Пользователи</span>
                        <p className="text-slate-200 mt-0.5">{tariff.usersCount ?? 0}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-slate-400 uppercase">Платежи</span>
                        <p className="text-slate-200 mt-0.5">{tariff.paymentsCount ?? 0}</p>
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
                          onClick={() => effectiveSetEditingTariff({ ...tariff })}
                          className="btn-icon-only-mobile min-h-[32px] sm:min-h-[40px] min-w-[32px] sm:min-w-[40px] flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 touch-manipulation"
                          aria-label="Редактировать тариф"
                        >
                          <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                          <span className="btn-text">Редактировать</span>
                        </button>
                        {(() => {
                          const users = Number(tariff.usersCount) || 0
                          const payments = Number(tariff.paymentsCount) || 0
                          const hasNoUsage = users === 0 && payments === 0
                          const canDelete = !tariff.id?.startsWith('default-') && hasNoUsage
                          if (canDelete) {
                            return (
                              <button
                                onClick={() => onHandleDeleteTariff(tariff.id)}
                                className="btn-icon-only-mobile min-h-[32px] sm:min-h-[40px] min-w-[32px] sm:min-w-[40px] flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 sm:py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-lg text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 touch-manipulation"
                                aria-label="Удалить тариф"
                                title="Удалить тариф (0 пользователей, 0 платежей)"
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
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Пользователи</th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Платежи</th>
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
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-slate-200">{tariff.usersCount ?? 0}</td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-slate-200">{tariff.paymentsCount ?? 0}</td>
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
                              onClick={() => effectiveSetEditingTariff({ ...tariff })}
                              className="min-h-[32px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 touch-manipulation"
                              aria-label="Редактировать тариф"
                            >
                              <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                              <span>Редактировать</span>
                            </button>
                            {(() => {
                              const users = Number(tariff.usersCount) || 0
                              const payments = Number(tariff.paymentsCount) || 0
                              const hasNoUsage = users === 0 && payments === 0
                              const canDelete = !tariff.id?.startsWith('default-') && hasNoUsage
                              if (canDelete) {
                                return (
                                  <button
                                    onClick={() => onHandleDeleteTariff(tariff.id)}
                                    className="min-h-[32px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 sm:py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-lg text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 touch-manipulation"
                                    aria-label="Удалить тариф"
                                    title="Удалить тариф (0 пользователей, 0 платежей)"
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

        {adminTab === 'reviews' && (
          <ReviewsPanel
            reviews={reviews}
            reviewsLoading={reviewsLoading}
            loadReviews={loadReviews}
            onApproveReview={handleApproveReview}
            onRejectReview={handleRejectReview}
            formatDate={formatDate}
          />
        )}

        {adminTab === 'tickets' && (
          <SupportTicketsPanel currentUser={currentUser} users={users} loadUsers={loadUsers} />
        )}

        {adminTab === 'notifications' && (
          <MailingsSection
            users={users}
            tariffs={tariffs}
            onSuccess={onSetSuccess}
            onError={onSetError}
          />
        )}

        {adminTab === 'n8n' && (
          <N8nPanel onSaveSettings={onHandleSaveSettings} />
        )}

        {adminTab === 'telegram' && (
          <TelegramSection />
        )}

        {adminTab === 'ai' && (
          <AIPanel />
        )}

        {adminTab === 'analytics-funnel' && (
          <AnalyticsFunnelPanel
            users={users}
            tariffs={tariffs}
            formatDate={formatDate}
            onCopy={onHandleCopy}
          />
        )}

        {adminTab === 'errors' && (
          <ErrorsPanel />
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
        <div className="max-sm:hidden flex-shrink-0">
          <Footer />
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

