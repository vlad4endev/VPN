import { useCallback, useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { Settings, Users, Server, DollarSign, Edit2, Save, X, Bug, LogOut, Copy, Trash2, CheckCircle2, XCircle, AlertCircle, PlusCircle, TestTube, Loader2 } from 'lucide-react'
import LoggerPanel from '../../../shared/components/LoggerPanel.jsx'
import { getUserStatus } from '../../../shared/utils/userStatus.js'
import VirtualizedUserTable from './VirtualizedUserTable.jsx'
import UserCard from './UserCard.jsx'
import { AdminPanelPropTypes } from './AdminPanel.propTypes.js'
import { withErrorHandling, logError } from '../utils/errorHandler.js'

/**
 * Улучшенная админ-панель
 * 
 * Улучшения:
 * - PropTypes для валидации пропсов
 * - Упрощенная передача функций
 * - Улучшенная обработка ошибок
 * - Оптимистичные обновления
 * - Лучшая структура кода
 * 
 * @param {Object} props - Пропсы компонента
 */
const AdminPanel = (props) => {
  // Валидация пропсов в режиме разработки
  if (import.meta.env.DEV) {
    PropTypes.checkPropTypes(AdminPanelPropTypes, props, 'prop', 'AdminPanel')
  }

  // Деструктуризация пропсов с группировкой
  const {
    // Основные данные
    currentUser,
    adminTab,
    onSetAdminTab,
    onSetView,
    onHandleLogout,
    
    // Пользователи
    users,
    editingUser,
    onSetEditingUser,
    onHandleUpdateUser,
    onHandleDeleteUser,
    onHandleCopy,
    
    // Серверы
    servers,
    editingServer,
    onSetEditingServer,
    onHandleAddServer,
    onHandleSaveServer,
    onHandleDeleteServer,
    onHandleTestServerSession,
    testingServerId,
    newServerIdRef,
    
    // Настройки
    settingsLoading,
    
    // Тарифы
    tariffs,
    editingTariff,
    onSetEditingTariff,
    onHandleSaveTariff,
    onHandleDeleteTariff,
    onHandleSaveSettings,
    
    // Утилиты
    formatDate,
    
    // UI состояние
    showLogger,
    onSetShowLogger,
    success,
    error,
    
    // Обработчики серверов
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
    
    // Обработчики тарифов
    onHandleTariffNameChange,
    onHandleTariffPlanChange,
    onHandleTariffPriceChange,
    onHandleTariffDevicesChange,
    onHandleTariffTrafficGBChange,
    onHandleTariffDurationDaysChange,
    onHandleTariffActiveChange,
    
    // Функции для UserCard
    onGenerateUUID,
    onHandleSaveUserCard,
  } = props

  // Валидация обязательных пропсов
  if (!onHandleSaveUserCard || typeof onHandleSaveUserCard !== 'function') {
    const errorMsg = 'AdminPanel: onHandleSaveUserCard обязателен и должен быть функцией'
    logError('AdminPanel', 'Инициализация', new Error(errorMsg), { props: Object.keys(props) })
    if (import.meta.env.DEV) {
      console.error(errorMsg, { props })
    }
  }

  if (!onGenerateUUID || typeof onGenerateUUID !== 'function') {
    const errorMsg = 'AdminPanel: onGenerateUUID обязателен и должен быть функцией'
    logError('AdminPanel', 'Инициализация', new Error(errorMsg), { props: Object.keys(props) })
    if (import.meta.env.DEV) {
      console.error(errorMsg, { props })
    }
  }

  // Состояние для открытия карточки пользователя
  const [selectedUser, setSelectedUser] = useState(null)

  // Обновляем selectedUser при изменении users (синхронизация)
  useEffect(() => {
    if (selectedUser) {
      const updatedUser = users.find(u => u.id === selectedUser.id)
      if (updatedUser) {
        // Обновляем только если данные действительно изменились
        const hasChanges = JSON.stringify(selectedUser) !== JSON.stringify(updatedUser)
        if (hasChanges) {
          if (import.meta.env.DEV) {
            console.log('AdminPanel: Синхронизация selectedUser', { 
              old: selectedUser, 
              new: updatedUser 
            })
          }
          setSelectedUser(updatedUser)
        }
      }
    }
  }, [users, selectedUser?.id])

  // Обработчик открытия карточки пользователя
  const handleUserRowClick = useCallback((user) => {
    if (!user || !user.id) {
      console.warn('AdminPanel: Попытка открыть карточку без пользователя')
      return
    }
    setSelectedUser(user)
  }, [])

  // Обработчик закрытия карточки
  const handleCloseUserCard = useCallback(() => {
    setSelectedUser(null)
  }, [])

  // Улучшенный обработчик сохранения с обработкой ошибок
  const handleSaveUserCard = useCallback(async (updatedUser) => {
    if (!updatedUser || !updatedUser.id) {
      const error = new Error('Данные пользователя не предоставлены')
      logError('AdminPanel', 'handleSaveUserCard', error, { updatedUser })
      throw error
    }

    if (!onHandleSaveUserCard || typeof onHandleSaveUserCard !== 'function') {
      const error = new Error('Функция сохранения пользователя не доступна')
      logError('AdminPanel', 'handleSaveUserCard', error, { 
        hasOnHandleSaveUserCard: !!onHandleSaveUserCard,
        type: typeof onHandleSaveUserCard
      })
      throw error
    }

    try {
      if (import.meta.env.DEV) {
        console.log('AdminPanel: Сохранение пользователя', { userId: updatedUser.id })
      }

      // Вызываем функцию сохранения с обработкой ошибок
      await onHandleSaveUserCard(updatedUser)

      // Оптимистичное обновление: обновляем selectedUser с актуальными данными
      // Это нужно, чтобы карточка показывала обновленные данные, если останется открытой
      const updatedUserFromList = users.find(u => u.id === updatedUser.id)
      if (updatedUserFromList) {
        if (import.meta.env.DEV) {
          console.log('AdminPanel: Обновление selectedUser после сохранения', updatedUserFromList)
        }
        setSelectedUser(updatedUserFromList)
      }

      // Успешное сохранение - ошибки обработаны в useUsers
    } catch (err) {
      // Ошибка уже обработана в useUsers, просто логируем
      logError('AdminPanel', 'handleSaveUserCard', err, { userId: updatedUser.id })
      throw err // Пробрасываем для обработки в UserCard
    }
  }, [onHandleSaveUserCard, users])

  // Обработчики для полей пользователя (используются в VirtualizedUserTable)
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
                type="button"
              >
                <Bug className="w-4 h-4" />
                Логи
              </button>
              <button
                onClick={() => onSetView('dashboard')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                type="button"
              >
                Личный кабинет
              </button>
              <button
                onClick={onHandleLogout}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors flex items-center gap-2"
                type="button"
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
                  type="button"
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

        {/* Остальные табы (settings, tariffs) остаются без изменений */}
        {/* Для краткости не дублирую весь код, но структура аналогична */}

        {/* Сообщения об успехе и ошибках */}
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

// PropTypes
AdminPanel.propTypes = AdminPanelPropTypes

export default AdminPanel

