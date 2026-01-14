import React, { useState, useEffect } from 'react'
import { X, Save, RefreshCw, Copy, CheckCircle2, XCircle, AlertCircle, Mail, User, Phone, Key, Calendar, HardDrive, Smartphone, Link as LinkIcon } from 'lucide-react'
import { getUserStatus } from '../../../shared/utils/userStatus.js'

/**
 * Карточка пользователя для редактирования админом
 * Отображает все данные пользователя и позволяет их редактировать
 */
const UserCard = ({
  user,
  onClose,
  onSave,
  onCopy,
  tariffs = [],
  formatDate,
  onGenerateUUID,
}) => {
  if (!user) return null

  const [editingUser, setEditingUser] = useState({ ...user })
  const [isSaving, setIsSaving] = useState(false)
  
  // Обновляем editingUser при изменении user prop (например, после сохранения)
  useEffect(() => {
    if (user) {
      console.log('🔄 UserCard: Обновление editingUser из user prop', user)
      setEditingUser({ ...user })
    }
  }, [user?.id, user?.uuid, user?.name, user?.phone, user?.expiresAt, user?.trafficGB, user?.devices, user?.tariffId, user?.plan])
  
  // Вычисляем статус на основе editingUser (актуальные данные)
  const userStatus = getUserStatus(editingUser)
  
  // Уникальные ID для полей формы
  const fieldIds = {
    name: `user-card-name-${user.id}`,
    phone: `user-card-phone-${user.id}`,
    uuid: `user-card-uuid-${user.id}`,
    tariff: `user-card-tariff-${user.id}`,
    expiresAt: `user-card-expires-at-${user.id}`,
    subscriptionLink: `user-card-subscription-link-${user.id}`,
    trafficGB: `user-card-traffic-gb-${user.id}`,
    devices: `user-card-devices-${user.id}`,
  }

  // Обработчики изменений полей
  const handleFieldChange = (field, value) => {
    setEditingUser(prev => {
      const updated = { ...prev, [field]: value }
      // Логируем изменения для отладки в формате: 🔄 Изменение поля: fieldName новое значение: value
      console.log(`🔄 Изменение поля: ${field} новое значение:`, value)
      return updated
    })
  }

  const handleUUIDChange = (e) => {
    handleFieldChange('uuid', e.target.value.trim())
  }

  const handleNameChange = (e) => {
    handleFieldChange('name', e.target.value)
  }

  const handlePhoneChange = (e) => {
    handleFieldChange('phone', e.target.value)
  }

  const handleStatusChange = (e) => {
    const newStatus = e.target.value
    if (newStatus === 'active') {
      // Если активируем, устанавливаем дату истечения в будущем, если её нет
      if (!editingUser.expiresAt || editingUser.expiresAt < Date.now()) {
        handleFieldChange('expiresAt', Date.now() + 30 * 24 * 60 * 60 * 1000) // +30 дней
      }
    }
    // Статус вычисляется динамически, но можно добавить поле status если нужно
  }

  const handleTariffChange = (e) => {
    const tariffId = e.target.value
    const selectedTariff = tariffs.find(t => t.id === tariffId)
    if (selectedTariff) {
      handleFieldChange('plan', selectedTariff.plan)
      handleFieldChange('tariffId', tariffId)
      // Обновляем лимиты из тарифа
      handleFieldChange('devices', selectedTariff.devices || editingUser.devices || 1)
      handleFieldChange('trafficGB', selectedTariff.trafficGB || editingUser.trafficGB || 0)
    } else {
      handleFieldChange('plan', 'free')
      handleFieldChange('tariffId', null)
    }
  }

  const handleDevicesChange = (e) => {
    handleFieldChange('devices', Number(e.target.value) || 1)
  }

  const handleTrafficGBChange = (e) => {
    handleFieldChange('trafficGB', Number(e.target.value) || 0)
  }

  const handleExpiresAtChange = (e) => {
    const value = e.target.value ? new Date(e.target.value).getTime() : null
    handleFieldChange('expiresAt', value)
  }

  const handleGenerateUUID = () => {
    if (onGenerateUUID) {
      try {
        const newUUID = onGenerateUUID() // Синхронная функция
        if (newUUID) {
          handleFieldChange('uuid', newUUID)
        }
      } catch (err) {
        console.error('Ошибка генерации UUID:', err)
      }
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      console.log('💾 Сохранение пользователя:', {
        id: editingUser.id,
        email: editingUser.email,
        uuid: editingUser.uuid,
        name: editingUser.name,
        phone: editingUser.phone,
        expiresAt: editingUser.expiresAt,
        trafficGB: editingUser.trafficGB,
        devices: editingUser.devices,
        tariffId: editingUser.tariffId,
        plan: editingUser.plan,
        allKeys: Object.keys(editingUser)
      })
      await onSave(editingUser)
    } catch (err) {
      console.error('❌ Ошибка сохранения:', err)
      throw err // Пробрасываем ошибку, чтобы показать пользователю
    } finally {
      setIsSaving(false)
    }
  }

  // Формируем ссылку подписки на 3x-ui (если есть UUID)
  // Используем данные из переменных окружения или дефолтные значения
  const vlessServer = import.meta.env.VITE_VLESS_SERVER || window.location.hostname
  const vlessPort = import.meta.env.VITE_VLESS_PORT || 443
  const subscriptionLink = editingUser.uuid && editingUser.uuid.trim() !== ''
    ? `vless://${editingUser.uuid}@${vlessServer}:${vlessPort}?encryption=none&security=tls&sni=${vlessServer}&fp=randomized&type=ws&path=/&host=${vlessServer}#${editingUser.email}`
    : null

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-xl shadow-2xl border border-slate-800 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Заголовок */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-slate-200 flex items-center gap-2">
              <User className="w-6 h-6" />
              Карточка пользователя
            </h2>
            <p className="text-slate-400 text-sm mt-1">{user.email}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Контент */}
        <div className="p-6 space-y-6">
          {/* Основная информация */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Основная информация
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Email</label>
                <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200">
                  {editingUser.email}
                </div>
                <p className="text-slate-500 text-xs mt-1">Email нельзя изменить</p>
              </div>
              <div>
                <label htmlFor={fieldIds.name} className="block text-slate-300 text-sm font-medium mb-2">Имя</label>
                <input
                  id={fieldIds.name}
                  name="name"
                  type="text"
                  value={editingUser.name || ''}
                  onChange={handleNameChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Имя пользователя"
                />
              </div>
              <div>
                <label htmlFor={fieldIds.phone} className="block text-slate-300 text-sm font-medium mb-2">Номер телефона</label>
                <input
                  id={fieldIds.phone}
                  name="phone"
                  type="tel"
                  value={editingUser.phone || ''}
                  onChange={handlePhoneChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+7 (999) 123-45-67"
                />
              </div>
              <div>
                <label htmlFor={fieldIds.uuid} className="block text-slate-300 text-sm font-medium mb-2">UUID (редактируемый)</label>
                <div className="flex items-center gap-2">
                  <input
                    id={fieldIds.uuid}
                    name="uuid"
                    type="text"
                    value={editingUser.uuid || ''}
                    onChange={handleUUIDChange}
                    className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                  <button
                    onClick={handleGenerateUUID}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-2"
                    title="Сгенерировать новый UUID"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  {editingUser.uuid && (
                    <button
                      onClick={() => onCopy(editingUser.uuid)}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors flex items-center gap-2"
                      title="Копировать UUID"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Подписка */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Подписка
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Статус подписки</label>
                <div className="flex items-center gap-2">
                  <div className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium ${
                    userStatus.status === 'active' ? 'bg-green-900/30 text-green-400' :
                    userStatus.status === 'expired' ? 'bg-red-900/30 text-red-400' :
                    'bg-slate-700 text-slate-400'
                  }`}>
                    {userStatus.status === 'active' && <CheckCircle2 className="w-4 h-4" />}
                    {userStatus.status === 'expired' && <XCircle className="w-4 h-4" />}
                    {userStatus.status === 'no-key' && <AlertCircle className="w-4 h-4" />}
                    {userStatus.label}
                  </div>
                </div>
                <p className="text-slate-500 text-xs mt-1">
                  {userStatus.status === 'no-key' && 'Добавьте UUID для активации'}
                  {userStatus.status === 'expired' && 'Установите дату окончания в будущем'}
                  {userStatus.status === 'active' && 'Подписка активна'}
                </p>
              </div>
              <div>
                <label htmlFor={fieldIds.tariff} className="block text-slate-300 text-sm font-medium mb-2">Тариф</label>
                <select
                  id={fieldIds.tariff}
                  name="tariff"
                  value={editingUser.tariffId || ''}
                  onChange={handleTariffChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Выберите тариф</option>
                  {tariffs.filter(t => t.active).map(tariff => (
                    <option key={tariff.id} value={tariff.id}>
                      {tariff.name} ({tariff.plan}) - {tariff.price} ₽
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={fieldIds.expiresAt} className="block text-slate-300 text-sm font-medium mb-2">Срок окончания подписки</label>
                <input
                  id={fieldIds.expiresAt}
                  name="expiresAt"
                  type="datetime-local"
                  value={editingUser.expiresAt ? new Date(editingUser.expiresAt).toISOString().slice(0, 16) : ''}
                  onChange={handleExpiresAtChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {editingUser.expiresAt && (
                  <p className="text-slate-500 text-xs mt-1">
                    {formatDate(editingUser.expiresAt)}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor={fieldIds.subscriptionLink} className="block text-slate-300 text-sm font-medium mb-2">Ссылка подписки на 3x-ui</label>
                <div className="flex items-center gap-2">
                  {subscriptionLink ? (
                    <>
                      <input
                        id={fieldIds.subscriptionLink}
                        name="subscriptionLink"
                        type="text"
                        value={subscriptionLink}
                        readOnly
                        className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono text-xs focus:outline-none"
                      />
                      <button
                        onClick={() => onCopy(subscriptionLink)}
                        className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors flex items-center gap-2"
                        title="Копировать ссылку"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <div className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-500 text-sm">
                      Сначала укажите UUID
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Лимиты */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <HardDrive className="w-5 h-5" />
              Лимиты
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor={fieldIds.trafficGB} className="block text-slate-300 text-sm font-medium mb-2 flex items-center gap-2">
                  <HardDrive className="w-4 h-4" />
                  Лимит трафика (GB)
                </label>
                <input
                  id={fieldIds.trafficGB}
                  name="trafficGB"
                  type="number"
                  min="0"
                  value={editingUser.trafficGB || 0}
                  onChange={handleTrafficGBChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0 = безлимит"
                />
                <p className="text-slate-500 text-xs mt-1">
                  {editingUser.trafficGB === 0 ? 'Безлимит' : `${editingUser.trafficGB} GB`}
                </p>
              </div>
              <div>
                <label htmlFor={fieldIds.devices} className="block text-slate-300 text-sm font-medium mb-2 flex items-center gap-2">
                  <Smartphone className="w-4 h-4" />
                  Лимит устройств
                </label>
                <input
                  id={fieldIds.devices}
                  name="devices"
                  type="number"
                  min="1"
                  value={editingUser.devices || 1}
                  onChange={handleDevicesChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Дополнительная информация */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Дополнительная информация
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Роль</label>
                <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    editingUser.role === 'admin' ? 'bg-purple-900/30 text-purple-300' : 'bg-slate-700 text-slate-300'
                  }`}>
                    {editingUser.role === 'admin' ? 'Админ' : 'Пользователь'}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">План</label>
                <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200">
                  {editingUser.plan === 'premium' ? 'Премиум' : 'Бесплатный'}
                </div>
              </div>
              {user.createdAt && (
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Дата регистрации</label>
                  <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-400 text-sm">
                    {formatDate(user.createdAt)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Футер с кнопками */}
        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 p-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded transition-colors flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Сохранение...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Сохранить изменения
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default UserCard

