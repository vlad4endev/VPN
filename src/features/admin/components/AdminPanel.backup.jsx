import { useCallback, useState, useEffect } from 'react'
import { Settings, Users, Server, DollarSign, Edit2, Save, X, Bug, LogOut, Copy, Trash2, CheckCircle2, XCircle, AlertCircle, PlusCircle, TestTube, Loader2 } from 'lucide-react'
import LoggerPanel from '../../../shared/components/LoggerPanel.jsx'
import { getUserStatus } from '../../../shared/utils/userStatus.js'
import VirtualizedUserTable from './VirtualizedUserTable.jsx'
import UserCard from './UserCard.jsx'

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
  // Новые пропсы для UserCard
  onGenerateUUID,
  onHandleSaveUserCard,
}) => {
  // Проверка наличия обязательных пропсов
  useEffect(() => {
    console.log('🔍 AdminPanel: Проверка пропсов', {
      hasOnGenerateUUID: !!onGenerateUUID,
      hasOnHandleSaveUserCard: !!onHandleSaveUserCard,
      onGenerateUUIDType: typeof onGenerateUUID,
      onHandleSaveUserCardType: typeof onHandleSaveUserCard,
      isOnGenerateUUIDFunction: typeof onGenerateUUID === 'function',
      isOnHandleSaveUserCardFunction: typeof onHandleSaveUserCard === 'function',
      onGenerateUUIDValue: onGenerateUUID,
      onHandleSaveUserCardValue: onHandleSaveUserCard,
      allPropsKeys: Object.keys({ onGenerateUUID, onHandleSaveUserCard }),
    })
    
    if (typeof onHandleSaveUserCard !== 'function') {
      console.error('❌ AdminPanel: onHandleSaveUserCard не является функцией при монтировании!', {
        onHandleSaveUserCard,
        type: typeof onHandleSaveUserCard,
      })
    }
    if (typeof onGenerateUUID !== 'function') {
      console.error('❌ AdminPanel: onGenerateUUID не является функцией при монтировании!', {
        onGenerateUUID,
        type: typeof onGenerateUUID,
      })
    }
  }, [onGenerateUUID, onHandleSaveUserCard])
  
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

  // Обработчик сохранения изменений в карточке
  const handleSaveUserCard = useCallback(async (updatedUser) => {
    console.log('📋 AdminPanel: handleSaveUserCard вызван', {
      hasOnHandleSaveUserCard: !!onHandleSaveUserCard,
      onHandleSaveUserCardType: typeof onHandleSaveUserCard,
      isFunction: typeof onHandleSaveUserCard === 'function',
      updatedUser,
      allProps: { onGenerateUUID: !!onGenerateUUID, onHandleSaveUserCard: !!onHandleSaveUserCard }
    })
    
    // Строгая проверка на функцию
    if (typeof onHandleSaveUserCard !== 'function') {
      console.error('❌ AdminPanel: onHandleSaveUserCard не передан или не является функцией!', {
        props: { 
          onGenerateUUID: !!onGenerateUUID, 
          onGenerateUUIDType: typeof onGenerateUUID,
          onHandleSaveUserCard: !!onHandleSaveUserCard,
          onHandleSaveUserCardType: typeof onHandleSaveUserCard,
          onHandleSaveUserCardValue: onHandleSaveUserCard
        },
        stack: new Error().stack
      })
      throw new Error('Функция сохранения пользователя не доступна. Проверьте, что функция передана в AdminPanel.')
    }
    
    try {
      console.log('📋 AdminPanel: Начало сохранения пользователя', updatedUser)
      await onHandleSaveUserCard(updatedUser)
      console.log('✅ AdminPanel: Пользователь успешно сохранен')
      
      // Обновляем selectedUser с актуальными данными из users после сохранения
      // Это нужно, чтобы карточка показывала обновленные данные, если останется открытой
      const updatedUserFromList = users.find(u => u.id === updatedUser.id)
      if (updatedUserFromList) {
        console.log('🔄 AdminPanel: Обновление selectedUser после сохранения', updatedUserFromList)
        setSelectedUser(updatedUserFromList)
      }
      
      // Закрываем карточку после успешного сохранения (опционально, можно оставить открытой)
      // setSelectedUser(null)
    } catch (err) {
      console.error('❌ AdminPanel: Ошибка сохранения пользователя', err)
      throw err // Пробрасываем ошибку, чтобы показать в UserCard
    }
  }, [onHandleSaveUserCard, onGenerateUUID, users])

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
  ]

  return (
    <div className="min-h-screen bg-slate-950 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Шапка */}
        <div className="bg-slate-900 rounded-lg shadow-xl p-6 mb-6 border border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-200 flex items-center gap-2">
                <Settings className="w-6 h-6" />
                Админ-панель
              </h1>
              <p className="text-slate-400 mt-1">Управление системой</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => onSetShowLogger(true)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors flex items-center gap-2"
                title="Открыть логи"
              >
                <Bug className="w-4 h-4" />
                Логи
              </button>
              <button
                onClick={() => onSetView('dashboard')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Личный кабинет
              </button>
              <button
                onClick={onHandleLogout}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Выйти
              </button>
            </div>
          </div>
        </div>

        {/* Табы */}
        <div className="bg-slate-900 rounded-lg shadow-xl border border-slate-800 mb-6">
          <div className="flex border-b border-slate-800">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => onSetAdminTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${
                    adminTab === tab.id
                      ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-800/50'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
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
                onSave={handleSaveUserCard}
                onCopy={onHandleCopy}
                tariffs={tariffs}
                formatDate={formatDate}
                onGenerateUUID={onGenerateUUID}
              />
            )}
          </>
        )}

        {adminTab === 'settings' && (
          <div className="space-y-6">
            {/* Блок 1: Серверы 3x-ui */}
            <div className="bg-slate-900 rounded-lg shadow-xl border border-slate-800 p-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-200 mb-2 flex items-center gap-2">
                    <Server className="w-6 h-6" />
                    Серверы 3x-ui
                  </h2>
                  <p className="text-slate-400 text-sm">Управление серверами для взаимодействия с панелями 3x-ui</p>
                </div>
                <button
                  onClick={onHandleAddServer}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-2"
                >
                  <PlusCircle className="w-4 h-4" />
                  Добавить сервер
                </button>
              </div>

              {settingsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-slate-600 border-t-blue-600 rounded-full animate-spin"></div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Форма редактирования сервера */}
                  {editingServer && (
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault()
                        onHandleSaveServer()
                      }}
                      className="p-6 bg-slate-800 rounded-lg border border-slate-700"
                    >
                      <h3 className="text-lg font-semibold text-slate-200 mb-4">
                        {editingServer.id && servers.find(s => s.id === editingServer.id) ? 'Редактирование сервера' : 'Новый сервер'}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor={`server-${editingServer.id || 'new'}-name`} className="block text-slate-300 text-sm font-medium mb-2">Название сервера *</label>
                          <input
                            id={`server-${editingServer.id || 'new'}-name`}
                            name="server-name"
                            type="text"
                            value={editingServer.name || ''}
                            onChange={onHandleServerNameChange}
                            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      <div className="flex justify-end gap-2 mt-4">
                        <button
                          type="submit"
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors flex items-center gap-2"
                        >
                          <Save className="w-4 h-4" />
                          Сохранить
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            newServerIdRef.current = null
                            onSetEditingServer(null)
                          }}
                          className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded transition-colors flex items-center gap-2"
                        >
                          <X className="w-4 h-4" />
                          Отмена
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Список серверов */}
                  {servers.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Серверы не добавлены</p>
                      <p className="text-sm mt-2">Нажмите "Добавить сервер" для создания</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {servers.map((server) => {
                        const isTesting = testingServerId === server.id
                        const protocol = server.serverPort === 443 ? 'https' : 'http'
                        const serverURL = `${protocol}://${server.serverIP}:${server.serverPort}${server.randompath || ''}`
                        
                        return (
                          <div key={server.id} className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h4 className="text-lg font-semibold text-slate-200">{server.name}</h4>
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
                                <div className="space-y-1 text-sm text-slate-400">
                                  <p><strong className="text-slate-300">URL:</strong> <code className="font-mono">{serverURL}</code></p>
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
                              <div className="flex items-center gap-2 ml-4">
                                <button
                                  onClick={() => onHandleTestServerSession(server)}
                                  disabled={isTesting}
                                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded text-sm transition-colors flex items-center gap-2"
                                  title="Получить данные сессии и сохранить cookies"
                                >
                                  {isTesting ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      <span>Получение...</span>
                                    </>
                                  ) : (
                                    <>
                                      <TestTube className="w-4 h-4" />
                                      <span>Получить данные</span>
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
                                  className="px-3 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded text-sm transition-colors flex items-center gap-1"
                                >
                                  <Edit2 className="w-4 h-4" />
                                  Редактировать
                                </button>
                                <button
                                  onClick={() => onHandleDeleteServer(server.id)}
                                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors flex items-center gap-1"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Удалить
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

              {/* Кнопка сохранения всех настроек */}
              <div className="flex justify-end pt-4 border-t border-slate-800 mt-6">
                <button
                  onClick={onHandleSaveSettings}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Сохранить все настройки
                </button>
              </div>
            </div>
          </div>
        )}

        {adminTab === 'tariffs' && (
          <div className="bg-slate-900 rounded-lg shadow-xl border border-slate-800 p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-200 mb-2">Тарифы и цены</h2>
                <p className="text-slate-400 text-sm">Управление тарифными планами SUPER и MULTI</p>
              </div>
            </div>

            {editingTariff && (
              <div className="mb-6 p-6 bg-slate-800 rounded-lg border border-slate-700">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">
                  {editingTariff.id && !editingTariff.id.startsWith('default-') ? 'Редактирование тарифа' : 'Новый тариф'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor={`tariff-${editingTariff.id || 'new'}-name`} className="block text-slate-300 text-sm font-medium mb-2">Название</label>
                    <input
                      id={`tariff-${editingTariff.id || 'new'}-name`}
                      name="tariff-name"
                      type="text"
                      value={editingTariff.name || ''}
                      onChange={onHandleTariffNameChange}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={() => onHandleSaveTariff(editingTariff)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Сохранить
                  </button>
                  <button
                    onClick={() => onSetEditingTariff(null)}
                    className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded transition-colors flex items-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Отмена
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Название</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">План</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Цена</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Устройства</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Трафик</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Длительность</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Статус</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {tariffs.map((tariff) => (
                    <tr key={tariff.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-slate-200">{tariff.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-400 font-mono text-sm">{tariff.plan}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-200">{tariff.price} ₽</td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-200">{tariff.devices}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-200">
                        {tariff.trafficGB === 0 ? 'Безлимит' : `${tariff.trafficGB} GB`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-200">{tariff.durationDays} дн.</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          tariff.active ? 'bg-green-900/30 text-green-400' : 'bg-slate-700 text-slate-400'
                        }`}>
                          {tariff.active ? 'Активен' : 'Неактивен'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onSetEditingTariff({ ...tariff })}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors flex items-center gap-1"
                          >
                            <Edit2 className="w-3 h-3" />
                            Редактировать
                          </button>
                          {(() => {
                            const plan = tariff.plan?.toLowerCase()
                            const name = tariff.name?.toLowerCase()
                            const isSuperOrMulti = plan === 'super' || plan === 'multi' || name === 'super' || name === 'multi'
                            
                            if (!isSuperOrMulti && !tariff.id?.startsWith('default-')) {
                              return (
                                <button
                                  onClick={() => onHandleDeleteTariff(tariff.id)}
                                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors flex items-center gap-1"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Удалить
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
        )}

        {success && (
          <div className="mt-4 p-3 bg-green-900/30 border border-green-800 rounded text-green-300 text-sm">
            {success}
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>
      {showLogger && <LoggerPanel onClose={() => onSetShowLogger(false)} />}
    </div>
  )
}

export default AdminPanel

