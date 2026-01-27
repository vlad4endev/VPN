import { FixedSizeList } from 'react-window'
import { useMemo, useState, useEffect } from 'react'
import React from 'react'
import { Edit2, Trash2, Copy, CheckCircle2, XCircle, AlertCircle, Save, X, User, Mail, Calendar } from 'lucide-react'
import { getUserStatus } from '../../../shared/utils/userStatus.js'
import { USER_ROLE_OPTIONS, getRoleLabel, getRoleBadgeClass } from '../../../shared/constants/admin.js'

/**
 * Виртуализированная таблица пользователей
 * Оптимизирована для работы с большими списками (100+ пользователей)
 * Адаптивная версия: карточки на мобильных, таблица на десктопе
 * 
 * @param {Array} users - Список пользователей
 * @param {Object} editingUser - Редактируемый пользователь
 * @param {Function} onSetEditingUser - Установить редактируемого пользователя
 * @param {Function} onHandleUpdateUser - Обработчик обновления пользователя
 * @param {Function} onHandleDeleteUser - Обработчик удаления пользователя
 * @param {Function} onHandleCopy - Обработчик копирования
 * @param {Object} currentUser - Текущий пользователь
 * @param {Function} formatDate - Функция форматирования даты
 * @param {Function} handleUserRoleChange - Обработчик изменения роли
 * @param {Function} handleUserPlanChange - Обработчик изменения плана
 * @param {Function} handleUserDevicesChange - Обработчик изменения устройств
 * @param {Function} handleUserExpiresAtChange - Обработчик изменения даты истечения
 */
const VirtualizedUserTable = ({
  users = [],
  editingUser,
  onSetEditingUser,
  onHandleUpdateUser,
  onHandleDeleteUser,
  onHandleCopy,
  currentUser,
  formatDate,
  handleUserRoleChange,
  handleUserPlanChange,
  handleUserDevicesChange,
  handleUserExpiresAtChange,
  onUserRowClick,
}) => {
  // Высота строки таблицы (в пикселях)
  const ROW_HEIGHT = 80
  const CARD_HEIGHT = 125 // Высота карточки на мобильных с учетом переносов текста
  
  // Определяем, мобильный ли экран
  const [isMobile, setIsMobile] = useState(false)
  const [containerHeight, setContainerHeight] = useState(600)
  const [tableWidth, setTableWidth] = useState(1200)
  
  useEffect(() => {
    const updateDimensions = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      setContainerHeight(mobile ? 400 : 600)
      // Для десктопа используем минимальную ширину 900px или ширину контейнера
      setTableWidth(mobile ? window.innerWidth : Math.max(900, window.innerWidth))
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Мемоизация данных для передачи в виртуализированный список
  const itemData = useMemo(() => ({
    users,
    editingUser,
    onSetEditingUser,
    onHandleUpdateUser,
    onHandleDeleteUser,
    onHandleCopy,
    currentUser,
    formatDate,
    handleUserRoleChange,
    handleUserPlanChange,
    handleUserDevicesChange,
    handleUserExpiresAtChange,
    onUserRowClick,
    isMobile,
  }), [
    users,
    editingUser,
    onSetEditingUser,
    onHandleUpdateUser,
    onHandleDeleteUser,
    onHandleCopy,
    currentUser,
    formatDate,
    handleUserRoleChange,
    handleUserPlanChange,
    handleUserDevicesChange,
    handleUserExpiresAtChange,
    onUserRowClick,
    isMobile,
  ])

  // Компонент карточки пользователя для мобильных
  const MobileCard = ({ index, style, data }) => {
    const user = data.users[index]
    if (!user) return null

    const userStatus = getUserStatus(user)
    const isEditing = data.editingUser?.id === user.id

    return (
      <div
        style={style}
        className="px-2 sm:px-3 py-1.5"
      >
        <div 
          className="bg-slate-800 rounded-lg border border-slate-700 p-2.5 sm:p-3 hover:bg-slate-750 transition-colors cursor-pointer"
          onClick={() => {
            if (data.onUserRowClick && !isEditing) {
              data.onUserRowClick(user)
            }
          }}
        >
          {/* Заголовок карточки - компактный */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0 pr-2">
              <h3 className="text-white font-semibold text-sm break-words mb-0.5 leading-tight">
                {user.name || user.email || 'Без имени'}
              </h3>
              {user.name && user.email && (
                <p className="text-slate-400 text-[11px] break-all leading-tight">
                  {user.email}
                </p>
              )}
            </div>
            
            {/* Статус - компактный */}
            <div className="flex-shrink-0 mt-0.5">
              <div className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium whitespace-nowrap ${
                userStatus.status === 'active' ? 'bg-green-900/30 text-green-400' :
                userStatus.status === 'expired' ? 'bg-red-900/30 text-red-400' :
                userStatus.status === 'unpaid' ? 'bg-red-900/30 text-red-400' :
                userStatus.status === 'test_period' ? 'bg-yellow-900/30 text-yellow-400' :
                userStatus.status === 'inactive' ? 'bg-orange-900/30 text-orange-400' :
                userStatus.status === 'no-subscription' ? 'bg-slate-700 text-slate-400' :
                'bg-slate-700 text-slate-400'
              }`}>
                {userStatus.status === 'active' && <CheckCircle2 className="w-2.5 h-2.5 flex-shrink-0" />}
                {(userStatus.status === 'expired' || userStatus.status === 'unpaid') && <XCircle className="w-2.5 h-2.5 flex-shrink-0" />}
                {(userStatus.status === 'no-key' || userStatus.status === 'no-subscription') && <AlertCircle className="w-2.5 h-2.5 flex-shrink-0" />}
                {userStatus.status === 'test_period' && <AlertCircle className="w-2.5 h-2.5 flex-shrink-0" />}
                {userStatus.status === 'inactive' && <AlertCircle className="w-2.5 h-2.5 flex-shrink-0" />}
                <span className="whitespace-nowrap">{userStatus.label}</span>
              </div>
            </div>
          </div>

          {/* Детали - компактная сетка */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="min-w-0">
              <p className="text-slate-500 text-[9px] uppercase tracking-wide mb-0.5">Роль</p>
              {isEditing ? (
                <select
                  value={data.editingUser.role === 'бухгалтер' ? 'accountant' : (data.editingUser.role || 'user')}
                  onChange={data.handleUserRoleChange}
                  className="w-full px-1.5 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200 text-[11px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {USER_ROLE_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              ) : (
                <p className={`text-[11px] font-medium inline-block px-1.5 py-0.5 rounded break-words ${getRoleBadgeClass(user.role)}`}>
                  {getRoleLabel(user.role)}
                </p>
              )}
            </div>
            
            <div className="min-w-0">
              <p className="text-slate-500 text-[9px] uppercase tracking-wide mb-0.5">Срок действия</p>
              {isEditing ? (
                <input
                  type="datetime-local"
                  value={data.editingUser.expiresAt ? new Date(data.editingUser.expiresAt).toISOString().slice(0, 16) : ''}
                  onChange={data.handleUserExpiresAtChange}
                  className="w-full px-1.5 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200 text-[11px]"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <p className="text-slate-300 text-[11px] break-words leading-tight">
                  {user.expiresAt ? data.formatDate(user.expiresAt) : '—'}
                </p>
              )}
            </div>
          </div>

          {/* Действия - компактные иконки на мобильных, текст на десктопе */}
          <div className="flex items-center gap-1 pt-1.5 border-t border-slate-700" onClick={(e) => e.stopPropagation()}>
            {isEditing ? (
              <>
                <button
                  onClick={() => data.onHandleUpdateUser(user.id, data.editingUser)}
                  className="flex-1 sm:flex-initial min-h-[28px] min-w-[28px] px-1.5 sm:px-2 py-0.5 sm:py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1 sm:gap-1.5 text-[11px] font-medium"
                  title="Сохранить"
                  aria-label="Сохранить"
                >
                  <Save className="w-3 h-3 sm:w-3 sm:h-3 flex-shrink-0" />
                  <span className="hidden sm:inline">Сохранить</span>
                </button>
                <button
                  onClick={() => data.onSetEditingUser(null)}
                  className="flex-1 sm:flex-initial min-h-[28px] min-w-[28px] px-1.5 sm:px-2 py-0.5 sm:py-1 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1 sm:gap-1.5 text-[11px] font-medium"
                  title="Отмена"
                  aria-label="Отмена"
                >
                  <X className="w-3 h-3 sm:w-3 sm:h-3 flex-shrink-0" />
                  <span className="hidden sm:inline">Отмена</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (data.onUserRowClick) {
                      data.onUserRowClick(user)
                    }
                  }}
                  className="flex-1 sm:flex-initial min-h-[28px] min-w-[28px] px-1.5 sm:px-2 py-0.5 sm:py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1 sm:gap-1.5 text-[11px] font-medium"
                  title="Открыть"
                  aria-label="Открыть"
                >
                  <Edit2 className="w-3 h-3 sm:w-3 sm:h-3 flex-shrink-0" />
                  <span className="hidden sm:inline">Открыть</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    data.onHandleDeleteUser(user.id)
                  }}
                  disabled={user.id === data.currentUser?.id}
                  className="flex-1 sm:flex-initial min-h-[28px] min-w-[28px] px-1.5 sm:px-2 py-0.5 sm:py-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-1 sm:gap-1.5 text-[11px] font-medium"
                  title="Удалить"
                  aria-label="Удалить"
                >
                  <Trash2 className="w-3 h-3 sm:w-3 sm:h-3 flex-shrink-0" />
                  <span className="hidden sm:inline">Удалить</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Компонент строки таблицы для десктопа
  const DesktopRow = ({ index, style, data }) => {
    const user = data.users[index]
    if (!user) return null

    const userStatus = getUserStatus(user)
    const isEditing = data.editingUser?.id === user.id

    return (
      <div
        style={style}
        className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors cursor-pointer"
        onClick={() => {
          if (data.onUserRowClick && !isEditing) {
            data.onUserRowClick(user)
          }
        }}
      >
        <div className="grid grid-cols-5 gap-3 sm:gap-4 px-4 sm:px-6 py-3 items-center min-h-[80px]">
          {/* Имя пользователя */}
          <div className="min-w-0">
            <div className="text-slate-200 font-medium text-sm truncate" title={user.name || user.email}>
              {user.name || user.email || '—'}
            </div>
            {user.name && user.email && (
              <div className="text-slate-500 text-xs truncate mt-0.5">
                {user.email}
              </div>
            )}
          </div>

          {/* Роль */}
          <div>
            {isEditing ? (
              <select
                value={data.editingUser.role === 'бухгалтер' ? 'accountant' : (data.editingUser.role || 'user')}
                onChange={data.handleUserRoleChange}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={(e) => e.stopPropagation()}
              >
                {USER_ROLE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            ) : (
              <span className={`px-2.5 py-1 rounded-lg text-xs font-medium inline-block ${getRoleBadgeClass(user.role)}`}>
                {getRoleLabel(user.role)}
              </span>
            )}
          </div>

          {/* Статус */}
          <div>
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              userStatus.status === 'active' ? 'bg-green-900/30 text-green-400' :
              userStatus.status === 'expired' ? 'bg-red-900/30 text-red-400' :
              userStatus.status === 'unpaid' ? 'bg-red-900/30 text-red-400' :
              userStatus.status === 'test_period' ? 'bg-yellow-900/30 text-yellow-400' :
              userStatus.status === 'inactive' ? 'bg-orange-900/30 text-orange-400' :
              userStatus.status === 'no-subscription' ? 'bg-slate-700 text-slate-400' :
              'bg-slate-700 text-slate-400'
            }`}>
              {userStatus.status === 'active' && <CheckCircle2 className="w-3.5 h-3.5" />}
              {(userStatus.status === 'expired' || userStatus.status === 'unpaid') && <XCircle className="w-3.5 h-3.5" />}
              {(userStatus.status === 'no-key' || userStatus.status === 'no-subscription') && <AlertCircle className="w-3.5 h-3.5" />}
              {userStatus.status === 'test_period' && <AlertCircle className="w-3.5 h-3.5" />}
              {userStatus.status === 'inactive' && <AlertCircle className="w-3.5 h-3.5" />}
              <span>{userStatus.label}</span>
            </div>
          </div>

          {/* Срок действия */}
          <div className="min-w-0">
            {isEditing ? (
              <input
                type="datetime-local"
                value={data.editingUser.expiresAt ? new Date(data.editingUser.expiresAt).toISOString().slice(0, 16) : ''}
                onChange={data.handleUserExpiresAtChange}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="text-slate-400 text-sm">
                {user.expiresAt ? data.formatDate(user.expiresAt) : '—'}
              </span>
            )}
          </div>

          {/* Действия */}
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {isEditing ? (
              <>
                <button
                  onClick={() => data.onHandleUpdateUser(user.id, data.editingUser)}
                  className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center justify-center"
                  title="Сохранить"
                >
                  <Save className="w-4 h-4" />
                </button>
                <button
                  onClick={() => data.onSetEditingUser(null)}
                  className="p-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center justify-center"
                  title="Отмена"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (data.onUserRowClick) {
                      data.onUserRowClick(user)
                    }
                  }}
                  className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center"
                  title="Открыть"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    data.onHandleDeleteUser(user.id)
                  }}
                  disabled={user.id === data.currentUser?.id}
                  className="p-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center"
                  title="Удалить"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Если пользователей нет, показываем пустое состояние
  if (users.length === 0) {
    return (
      <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 p-6">
        <div className="text-center py-12 text-slate-400">
          <User className="w-12 h-12 mx-auto mb-4 text-slate-600" />
          <p className="text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">Пользователи не найдены</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 overflow-hidden">
      {/* Заголовок - компактный */}
      <div className="p-3 sm:p-4 md:p-5 border-b border-slate-800">
        <h2 className="text-base sm:text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200">Управление пользователями</h2>
        <p className="text-slate-400 text-xs sm:text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] mt-0.5">
          Всего пользователей: <span className="text-blue-400 font-semibold">{users.length}</span>
        </p>
      </div>

      {/* Мобильная версия - карточки */}
      {isMobile ? (
        <div className="overflow-y-auto" style={{ height: containerHeight }}>
          <FixedSizeList
            height={containerHeight}
            itemCount={users.length}
            itemSize={CARD_HEIGHT}
            width="100%"
            itemData={itemData}
            overscanCount={3}
            className="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900"
          >
            {MobileCard}
          </FixedSizeList>
        </div>
      ) : (
        <>
          {/* Заголовок таблицы для десктопа */}
          <div className="bg-slate-800/50 grid grid-cols-5 gap-3 sm:gap-4 px-4 sm:px-6 py-3 border-b border-slate-700">
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Пользователь</div>
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Роль</div>
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Статус</div>
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Срок действия</div>
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Действия</div>
          </div>

          {/* Виртуализированный список для десктопа */}
          <div className="overflow-x-auto">
            <FixedSizeList
              height={containerHeight}
              itemCount={users.length}
              itemSize={ROW_HEIGHT}
              width={tableWidth}
              itemData={itemData}
              overscanCount={5}
              className="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900"
            >
              {DesktopRow}
            </FixedSizeList>
          </div>
        </>
      )}
    </div>
  )
}

export default VirtualizedUserTable
