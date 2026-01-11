import { FixedSizeList } from 'react-window'
import { useMemo, useState, useEffect } from 'react'
import React from 'react'
import { Edit2, Trash2, Copy, CheckCircle2, XCircle, AlertCircle, Save, X } from 'lucide-react'
import { getUserStatus } from '../../../shared/utils/userStatus.js'

/**
 * Виртуализированная таблица пользователей
 * Оптимизирована для работы с большими списками (100+ пользователей)
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
  onUserRowClick, // Новый обработчик клика на строку
}) => {
  // Высота строки таблицы (в пикселях)
  const ROW_HEIGHT = 80
  
  // Высота контейнера и ширина (можно сделать динамической, уменьшаем на мобильных)
  // Используем useState и useEffect для правильной обработки resize
  const [containerHeight, setContainerHeight] = useState(600)
  const [tableWidth, setTableWidth] = useState(1200)
  
  useEffect(() => {
    const updateDimensions = () => {
      setContainerHeight(window.innerWidth < 768 ? 400 : 600)
      // Минимальная ширина таблицы 1200px, но на мобильных используем фактическую ширину для правильного скролла
      setTableWidth(Math.max(1200, window.innerWidth))
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
  ])

  // Компонент строки таблицы
  const Row = ({ index, style, data }) => {
    const user = data.users[index]
    if (!user) return null

    const userStatus = getUserStatus(user)
    const isEditing = data.editingUser?.id === user.id

    return (
      <div
        style={style}
        className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors cursor-pointer"
        onClick={() => {
          // Открываем карточку пользователя при клике на строку (но не на кнопки)
          if (data.onUserRowClick && !isEditing) {
            data.onUserRowClick(user)
          }
        }}
      >
        <div className="grid grid-cols-8 gap-2 sm:gap-4 px-3 sm:px-6 py-4 items-center min-h-[80px] min-w-[1200px]">
          {/* Email */}
          <div className="text-slate-200 truncate" title={user.email}>
            {user.email}
          </div>

          {/* UUID */}
          <div className="flex items-center gap-2">
            {user.uuid ? (
              <>
                <span
                  className="text-slate-400 font-mono text-xs max-w-[180px] sm:max-w-[220px] truncate"
                  title={user.uuid}
                >
                  {user.uuid}
                </span>
                <button
                  onClick={() => data.onHandleCopy(user.uuid)}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex-shrink-0"
                  title="Копировать UUID"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </>
            ) : (
              <span className="text-slate-500 text-xs">—</span>
            )}
          </div>

          {/* Роль */}
          <div>
            {isEditing ? (
              <select
                value={data.editingUser.role}
                onChange={data.handleUserRoleChange}
                className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm w-full"
              >
                <option value="user">Пользователь</option>
                <option value="admin">Админ</option>
              </select>
            ) : (
              <span className={`px-2 py-1 rounded text-xs font-medium inline-block ${
                user.role === 'admin' ? 'bg-purple-900/30 text-purple-300' : 'bg-slate-700 text-slate-300'
              }`}>
                {user.role === 'admin' ? 'Админ' : 'Пользователь'}
              </span>
            )}
          </div>

          {/* План */}
          <div>
            {isEditing ? (
              <select
                value={data.editingUser.plan}
                onChange={data.handleUserPlanChange}
                className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm w-full"
              >
                <option value="free">Бесплатный</option>
                <option value="premium">Премиум</option>
              </select>
            ) : (
              <span className="text-slate-200">
                {user.plan === 'premium' ? 'Премиум' : 'Бесплатный'}
              </span>
            )}
          </div>

          {/* Устройства */}
          <div>
            {isEditing ? (
              <input
                type="number"
                min="1"
                value={data.editingUser.devices || 1}
                onChange={data.handleUserDevicesChange}
                className="w-20 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm"
              />
            ) : (
              <span className="text-slate-200">{user.devices || 1}</span>
            )}
          </div>

          {/* Статус */}
          <div>
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
              userStatus.status === 'active' ? 'bg-green-900/30 text-green-400' :
              userStatus.status === 'expired' ? 'bg-red-900/30 text-red-400' :
              'bg-slate-700 text-slate-400'
            }`}>
              {userStatus.status === 'active' && <CheckCircle2 className="w-3 h-3" />}
              {userStatus.status === 'expired' && <XCircle className="w-3 h-3" />}
              {userStatus.status === 'no-key' && <AlertCircle className="w-3 h-3" />}
              {userStatus.label}
            </div>
          </div>

          {/* Истекает */}
          <div>
            {isEditing ? (
              <input
                type="datetime-local"
                value={data.editingUser.expiresAt ? new Date(data.editingUser.expiresAt).toISOString().slice(0, 16) : ''}
                onChange={data.handleUserExpiresAtChange}
                className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm w-full"
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
                  className="p-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors flex items-center justify-center"
                  title="Сохранить"
                >
                  <Save className="w-4 h-4" />
                </button>
                <button
                  onClick={() => data.onSetEditingUser(null)}
                  className="p-2 bg-slate-600 hover:bg-slate-700 text-white rounded transition-colors flex items-center justify-center"
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
                  className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center justify-center"
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
                  className="p-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded transition-colors flex items-center justify-center"
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
      <div className="bg-slate-900 rounded-lg shadow-xl border border-slate-800 p-6">
        <div className="text-center py-12 text-slate-400">
          <p>Пользователи не найдены</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 overflow-hidden">
      <div className="p-3 sm:p-4 md:p-6 border-b border-slate-800">
        <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200">Управление пользователями</h2>
        <p className="text-slate-400 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] mt-1">
          Всего пользователей: {users.length}
        </p>
      </div>

      {/* Заголовок таблицы */}
      <div className="bg-slate-800 grid grid-cols-8 gap-2 sm:gap-4 px-3 sm:px-6 py-3 border-b border-slate-700 min-w-[1200px]">
        <div className="text-xs font-medium text-slate-300 uppercase tracking-wider">Email</div>
        <div className="text-xs font-medium text-slate-300 uppercase tracking-wider">UUID</div>
        <div className="text-xs font-medium text-slate-300 uppercase tracking-wider">Роль</div>
        <div className="text-xs font-medium text-slate-300 uppercase tracking-wider">План</div>
        <div className="text-xs font-medium text-slate-300 uppercase tracking-wider">Устройства</div>
        <div className="text-xs font-medium text-slate-300 uppercase tracking-wider">Статус</div>
        <div className="text-xs font-medium text-slate-300 uppercase tracking-wider">Истекает</div>
        <div className="text-xs font-medium text-slate-300 uppercase tracking-wider">Действия</div>
      </div>

      {/* Виртуализированный список - обернут в overflow-x-auto для мобильных */}
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <FixedSizeList
          height={containerHeight}
          itemCount={users.length}
          itemSize={ROW_HEIGHT}
          width={tableWidth} // Динамическая ширина с минимальным значением 1200px
          itemData={itemData}
          overscanCount={5} // Буфер: рендерим 5 элементов сверху/снизу для плавного скролла
          className="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900"
        >
          {Row}
        </FixedSizeList>
      </div>
    </div>
  )
}

export default VirtualizedUserTable

