import { FixedSizeList } from 'react-window'
import { useMemo, useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import React from 'react'
import { Edit2, Trash2, Copy, CheckCircle2, XCircle, AlertCircle, Save, X, User, Mail, Calendar, Search, Filter, XCircle as ClearIcon } from 'lucide-react'
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
  selectedUserIds = [],
  onToggleUserSelection,
  onToggleAllFilteredUsers,
}) => {
  // Высота строки: на десктопе — просторная таблица, на мобильных — карточки
  const ROW_HEIGHT_DESKTOP = 84 // высокие строки на десктопе для удобства
  const CARD_HEIGHT = 200 // Высота карточки на мобильных
  
  // Фильтры
  const [searchText, setSearchText] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [tariffFilter, setTariffFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')

  // Определяем, мобильный ли экран
  const [isMobile, setIsMobile] = useState(false)
  const [containerHeight, setContainerHeight] = useState(600)
  const [listAreaHeight, setListAreaHeight] = useState(600) // реальная высота области списка (подстраивается под контейнер; 600 — дефолт для десктопа)
  const listAreaRef = useRef(null)
  const [tableWidth, setTableWidth] = useState(1200)
  const [filtersExpanded, setFiltersExpanded] = useState(false)

  // Уникальные значения для селектов (тарифы из списка пользователей)
  const tariffOptions = useMemo(() => {
    const set = new Set()
    users.forEach((u) => {
      const t = (u.tariffName || u.tariffId || '').toString().trim()
      if (t) set.add(t)
    })
    return Array.from(set).sort((a, b) => String(a).localeCompare(b))
  }, [users])

  // Отфильтрованный список
  const filteredUsers = useMemo(() => {
    let list = users
    const search = (searchText || '').trim().toLowerCase()
    if (search) {
      list = list.filter((u) => {
        const name = (u.name || '').toLowerCase()
        const email = (u.email || '').toLowerCase()
        const login = (u.login || '').toLowerCase()
        const phone = (u.phone || '').toLowerCase()
        return name.includes(search) || email.includes(search) || login.includes(search) || phone.includes(search)
      })
    }
    if (roleFilter) list = list.filter((u) => (u.role || '').toLowerCase() === roleFilter.toLowerCase())
    if (planFilter) list = list.filter((u) => (u.plan || '').toLowerCase() === planFilter.toLowerCase())
    if (tariffFilter) {
      list = list.filter((u) => {
        const t = (u.tariffName || u.tariffId || '').toString().trim()
        return t === tariffFilter
      })
    }
    if (paymentFilter) list = list.filter((u) => (u.paymentStatus || '').toLowerCase() === paymentFilter.toLowerCase())
    return list
  }, [users, searchText, roleFilter, planFilter, tariffFilter, paymentFilter])

  const hasActiveFilters = !!(searchText.trim() || roleFilter || planFilter || tariffFilter || paymentFilter)
  const clearFilters = useCallback(() => {
    setSearchText('')
    setRoleFilter('')
    setPlanFilter('')
    setTariffFilter('')
    setPaymentFilter('')
  }, [])

  useEffect(() => {
    const updateDimensions = () => {
      const mobile = window.innerWidth < 768
      const fallbackHeight = mobile ? 400 : 600
      setIsMobile(mobile)
      setContainerHeight(fallbackHeight)
      setTableWidth(mobile ? window.innerWidth : Math.max(1100, window.innerWidth))
      setListAreaHeight((prev) => (prev < 100 ? fallbackHeight : prev))
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Высота области списка: замер после layout и при изменении размера
  // Debounce + порог изменения: ResizeObserver срабатывает при появлении/скрытии скроллбара при прокрутке,
  // что вызывало постоянные setState и «живую свою жизнью» таблицы
  const lastHeightRef = useRef(600)
  const HEIGHT_CHANGE_THRESHOLD = 5 // не обновлять при микроколебаниях < 5px

  const measureListHeight = useCallback(() => {
    const el = listAreaRef.current
    if (!el) return
    const h = Math.round(el.getBoundingClientRect().height)
    if (h > 0 && Math.abs(h - lastHeightRef.current) >= HEIGHT_CHANGE_THRESHOLD) {
      lastHeightRef.current = h
      setListAreaHeight(h)
    }
  }, [])

  useLayoutEffect(() => {
    const el = listAreaRef.current
    if (!el) return
    measureListHeight()
    // Измеряем один раз при монтировании / смене layout-флагов, не подписываемся на resize,
    // чтобы не сбрасывать позицию скролла при появлении/скрытии скроллбара.
  }, [isMobile, filtersExpanded, measureListHeight])

  // Мемоизация данных для передачи в виртуализированный список (используем отфильтрованный список)
  const itemData = useMemo(() => ({
    users: filteredUsers,
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
    selectedUserIds,
    onToggleUserSelection,
  }), [
    filteredUsers,
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
    selectedUserIds,
    onToggleUserSelection,
  ])

  // Компонент карточки пользователя для мобильных
  const MobileCard = ({ index, style, data }) => {
    const user = data.users[index]
    if (!user) return null

    const userStatus = getUserStatus(user)
    const isEditing = data.editingUser?.id === user.id
    const isSelected = data.selectedUserIds.includes(user.id)

    return (
      <div
        style={{ ...style, overflow: 'hidden', minHeight: style.height }}
        className="px-2 sm:px-3 py-1.5 box-border"
      >
        <div
          role="button"
          aria-label={`Открыть карточку ${user.name || user.email || 'пользователя'}`}
          className="bg-slate-800 rounded-lg border border-slate-700 p-2.5 sm:p-3 hover:bg-slate-750 active:bg-slate-700 transition-colors cursor-pointer min-h-0 overflow-hidden flex flex-col touch-manipulation select-none"
          onClick={() => {
            if (data.onUserRowClick && !isEditing) {
              data.onUserRowClick(user)
            }
          }}
        >
          {/* Заголовок карточки - компактный */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0 pr-2">
              <label className="flex items-center gap-2 mb-1 text-slate-400 text-xs" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => data.onToggleUserSelection?.(user.id)}
                  className="rounded border-slate-600 text-sky-500"
                />
                В рассылку
              </label>
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
            <div className="min-w-0 col-span-2">
              <p className="text-slate-500 text-[9px] uppercase tracking-wide mb-0.5">Начало использования</p>
              <p className="text-slate-300 text-[11px] break-words leading-tight">
                {user.serviceStartDate ? data.formatDate(user.serviceStartDate) : '—'}
              </p>
            </div>
          </div>

          {/* Действия - компактные иконки на мобильных, текст на десктопе */}
          <div className="flex items-center gap-1 pt-1.5 border-t border-slate-700" onClick={(e) => e.stopPropagation()}>
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => data.onHandleUpdateUser(user.id, data.editingUser)}
                  className="flex-1 sm:flex-initial min-h-[44px] min-w-[44px] px-2 py-1.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 text-[11px] font-medium touch-manipulation"
                  title="Сохранить"
                  aria-label="Сохранить"
                >
                  <Save className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Сохранить</span>
                </button>
                <button
                  type="button"
                  onClick={() => data.onSetEditingUser(null)}
                  className="flex-1 sm:flex-initial min-h-[44px] min-w-[44px] px-2 py-1.5 bg-slate-600 hover:bg-slate-700 active:bg-slate-800 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 text-[11px] font-medium touch-manipulation"
                  title="Отмена"
                  aria-label="Отмена"
                >
                  <X className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Отмена</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (data.onUserRowClick) {
                      data.onUserRowClick(user)
                    }
                  }}
                  className="flex-1 sm:flex-initial min-h-[44px] min-w-[44px] px-2 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 text-[11px] font-medium touch-manipulation"
                  title="Открыть"
                  aria-label="Открыть карточку"
                >
                  <Edit2 className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Открыть</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    data.onHandleDeleteUser(user.id)
                  }}
                  disabled={user.id === data.currentUser?.id}
                  className="flex-1 sm:flex-initial min-h-[44px] min-w-[44px] px-2 py-1.5 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 text-[11px] font-medium touch-manipulation"
                  title="Удалить"
                  aria-label="Удалить пользователя"
                >
                  <Trash2 className="w-4 h-4 flex-shrink-0" />
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
    const isSelected = data.selectedUserIds.includes(user.id)

    const openCard = () => {
      if (data.onUserRowClick && !isEditing) {
        data.onUserRowClick(user)
      }
    }

    return (
      <div
        style={{ ...style, overflow: 'hidden', minHeight: style.height }}
        className="border-b border-slate-800 hover:bg-slate-800/50 active:bg-slate-800/70 transition-colors cursor-pointer box-border select-none"
        onClick={openCard}
        role="button"
        aria-label={`Открыть карточку ${user.name || user.email || 'пользователя'}`}
      >
        <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_1fr] gap-4 md:gap-5 px-5 md:px-6 py-4 items-center min-h-[76px] max-h-full overflow-hidden">
          <div onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => data.onToggleUserSelection?.(user.id)}
              className="rounded border-slate-600 text-sky-500"
              aria-label={`Выбрать ${user.name || user.email || 'пользователя'} для рассылки`}
            />
          </div>
          {/* Имя пользователя */}
          <div className="min-w-0">
            <div className="text-slate-200 font-medium text-base truncate" title={user.name || user.email}>
              {user.name || user.email || '—'}
            </div>
            {user.name && user.email && (
              <div className="text-slate-500 text-sm truncate mt-0.5">
                {user.email}
              </div>
            )}
          </div>

          {/* Роль */}
          <div onClick={(e) => e.stopPropagation()}>
            {isEditing ? (
              <select
                value={data.editingUser.role === 'бухгалтер' ? 'accountant' : (data.editingUser.role || 'user')}
                onChange={data.handleUserRoleChange}
                className="w-full min-w-[120px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={(e) => e.stopPropagation()}
              >
                {USER_ROLE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            ) : (
              <span className={`px-3 py-1.5 rounded-lg text-sm font-medium inline-block ${getRoleBadgeClass(user.role)}`}>
                {getRoleLabel(user.role)}
              </span>
            )}
          </div>

          {/* Статус */}
          <div>
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
              userStatus.status === 'active' ? 'bg-green-900/30 text-green-400' :
              userStatus.status === 'expired' ? 'bg-red-900/30 text-red-400' :
              userStatus.status === 'unpaid' ? 'bg-red-900/30 text-red-400' :
              userStatus.status === 'test_period' ? 'bg-yellow-900/30 text-yellow-400' :
              userStatus.status === 'inactive' ? 'bg-orange-900/30 text-orange-400' :
              userStatus.status === 'no-subscription' ? 'bg-slate-700 text-slate-400' :
              'bg-slate-700 text-slate-400'
            }`}>
              {userStatus.status === 'active' && <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
              {(userStatus.status === 'expired' || userStatus.status === 'unpaid') && <XCircle className="w-4 h-4 flex-shrink-0" />}
              {(userStatus.status === 'no-key' || userStatus.status === 'no-subscription') && <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              {userStatus.status === 'test_period' && <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              {userStatus.status === 'inactive' && <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              <span>{userStatus.label}</span>
            </div>
          </div>

          {/* Начало использования (дата создания строки / новичок) */}
          <div className="min-w-0">
            <span className="text-slate-400 text-sm" title="Дата начала использования сервиса">
              {user.serviceStartDate ? data.formatDate(user.serviceStartDate) : '—'}
            </span>
          </div>

          {/* Срок действия */}
          <div className="min-w-0">
            {isEditing ? (
              <input
                type="datetime-local"
                value={data.editingUser.expiresAt ? new Date(data.editingUser.expiresAt).toISOString().slice(0, 16) : ''}
                onChange={data.handleUserExpiresAtChange}
                className="w-full min-w-[160px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="text-slate-400 text-sm">
                {user.expiresAt ? data.formatDate(user.expiresAt) : '—'}
              </span>
            )}
          </div>

          {/* Действия */}
          <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => data.onHandleUpdateUser(user.id, data.editingUser)}
                  className="p-2.5 min-w-[44px] min-h-[44px] bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-lg transition-colors flex items-center justify-center touch-manipulation"
                  title="Сохранить"
                  aria-label="Сохранить изменения"
                >
                  <Save className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => data.onSetEditingUser(null)}
                  className="p-2.5 min-w-[44px] min-h-[44px] bg-slate-600 hover:bg-slate-700 active:bg-slate-800 text-white rounded-lg transition-colors flex items-center justify-center touch-manipulation"
                  title="Отмена"
                  aria-label="Отменить редактирование"
                >
                  <X className="w-5 h-5" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (data.onUserRowClick) {
                      data.onUserRowClick(user)
                    }
                  }}
                  className="p-2.5 min-w-[44px] min-h-[44px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition-colors flex items-center justify-center touch-manipulation"
                  title="Открыть"
                  aria-label="Открыть карточку пользователя"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    data.onHandleDeleteUser(user.id)
                  }}
                  disabled={user.id === data.currentUser?.id}
                  className="p-2.5 min-w-[44px] min-h-[44px] bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center touch-manipulation"
                  title="Удалить"
                  aria-label="Удалить пользователя"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Если пользователей нет (всего или после фильтра)
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
    <div className="bg-slate-900 rounded-xl sm:rounded-xl shadow-xl border border-slate-800 overflow-hidden flex flex-col flex-1 min-h-0">
      {/* Заголовок и счётчик — компактно на мобильных (не сжимается) */}
      <div className="flex-shrink-0 p-3 sm:p-4 md:p-5 border-b border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-base md:text-lg font-bold text-slate-200 truncate">Управление пользователями</h2>
            <p className="text-slate-400 text-xs sm:text-sm mt-0.5 tabular-nums">
              {hasActiveFilters ? (
                <>Показано: <span className="text-blue-400 font-semibold">{filteredUsers.length}</span> из {users.length}</>
              ) : (
                <>Всего: <span className="text-blue-400 font-semibold">{users.length}</span></>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFiltersExpanded((v) => !v)}
            className="flex-shrink-0 inline-flex items-center gap-1.5 sm:gap-2 min-h-[44px] px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-slate-100 text-xs sm:text-sm font-medium transition-colors touch-manipulation border border-slate-700/50"
            aria-expanded={filtersExpanded}
          >
            <Filter className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">{filtersExpanded ? 'Скрыть фильтры' : 'Показать фильтры'}</span>
            <span className="sm:hidden">{filtersExpanded ? 'Скрыть' : 'Фильтры'}</span>
          </button>
        </div>

        {filteredUsers.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={filteredUsers.every((u) => selectedUserIds.includes(u.id))}
                onChange={(e) => onToggleAllFilteredUsers?.(filteredUsers.map((u) => u.id).filter(Boolean), e.target.checked)}
                className="rounded border-slate-600 text-sky-500"
              />
              Выбрать всех в текущем фильтре ({filteredUsers.length})
            </label>
            <span className="text-slate-500">Выбрано для рассылки: {selectedUserIds.length}</span>
          </div>
        )}

        {/* Панель фильтров — сетка на мобильных, ряд на десктопе */}
        {filtersExpanded && (
          <div className="mt-3 pt-3 border-t border-slate-700/50">
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-3 sm:gap-2">
              <div className="relative w-full sm:flex-1 sm:min-w-[160px] sm:max-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Поиск по имени, email..."
                  className="w-full pl-9 pr-3 min-h-[44px] py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 touch-manipulation"
                  aria-label="Поиск"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:contents">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="min-h-[44px] px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-200 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 touch-manipulation sm:min-w-[120px]"
                  aria-label="Роль"
                >
                  <option value="">Все роли</option>
                  {USER_ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <select
                  value={planFilter}
                  onChange={(e) => setPlanFilter(e.target.value)}
                  className="min-h-[44px] px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-200 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 touch-manipulation sm:min-w-[100px]"
                  aria-label="План"
                >
                  <option value="">Все планы</option>
                  <option value="free">free</option>
                  <option value="super">super</option>
                  <option value="multi">multi</option>
                </select>
                <select
                  value={tariffFilter}
                  onChange={(e) => setTariffFilter(e.target.value)}
                  className="min-h-[44px] px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-200 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 touch-manipulation sm:min-w-[100px]"
                  aria-label="Тариф"
                >
                  <option value="">Все тарифы</option>
                  {tariffOptions.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="min-h-[44px] px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-200 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 touch-manipulation sm:min-w-[100px]"
                  aria-label="Оплата"
                >
                  <option value="">Оплата</option>
                  <option value="paid">Оплачено</option>
                  <option value="test_period">Тест</option>
                  <option value="unpaid">Не оплачено</option>
                </select>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-700/80 border border-slate-600/50 text-sm font-medium touch-manipulation sm:order-last"
                  title="Сбросить фильтры"
                  aria-label="Сбросить фильтры"
                >
                  <ClearIcon className="w-4 h-4 flex-shrink-0" />
                  Сбросить
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Мобильная версия - карточки */}
      {filteredUsers.length === 0 ? (
        <div className="p-6 text-center text-slate-400">
          <Filter className="w-10 h-10 mx-auto mb-2 text-slate-600" />
          <p className="text-sm">Нет пользователей по выбранным фильтрам</p>
          <button type="button" onClick={clearFilters} className="mt-2 text-blue-400 hover:underline text-sm">Сбросить фильтры</button>
        </div>
      ) : isMobile ? (
        <div
          ref={listAreaRef}
          className="flex-1 min-h-0 overflow-hidden flex flex-col"
          style={{ minHeight: isMobile ? 'clamp(260px, 58dvh, 720px)' : 200 }}
        >
          <FixedSizeList
            height={listAreaHeight}
            itemCount={filteredUsers.length}
            itemSize={CARD_HEIGHT}
            width="100%"
            itemData={itemData}
            overscanCount={3}
            className="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900 flex-1"
          >
            {MobileCard}
          </FixedSizeList>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Заголовок таблицы для десктопа — крупнее для удобства */}
          <div className="flex-shrink-0 bg-slate-800/50 grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_1fr] gap-4 md:gap-5 px-5 md:px-6 py-4 border-b border-slate-700">
            <div className="text-sm font-semibold text-slate-300 uppercase tracking-wider">✓</div>
            <div className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Пользователь</div>
            <div className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Роль</div>
            <div className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Статус</div>
            <div className="text-sm font-semibold text-slate-300 uppercase tracking-wider" title="Дата начала использования сервиса">Начало</div>
            <div className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Срок действия</div>
            <div className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Действия</div>
          </div>

          {/* Виртуализированный список для десктопа */}
          <div ref={listAreaRef} className="flex-1 min-h-0 overflow-x-auto" style={{ minHeight: 200 }}>
            <FixedSizeList
              height={listAreaHeight}
              itemCount={filteredUsers.length}
              itemSize={ROW_HEIGHT_DESKTOP}
              width={tableWidth}
              itemData={itemData}
              overscanCount={5}
              className="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900"
            >
              {DesktopRow}
            </FixedSizeList>
          </div>
        </div>
      )}
    </div>
  )
}

export default VirtualizedUserTable
