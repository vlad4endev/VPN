import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit2, Trash2, Tag, Save, X, Loader2 } from 'lucide-react'
import { adminService } from '../services/adminService.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Панель управления промокодами и скидками
 */
const PromocodesPanel = ({ currentUserId }) => {
  const [promocodes, setPromocodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [editingPromo, setEditingPromo] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const loadPromocodes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await adminService.loadPromocodes()
      setPromocodes(list)
    } catch (err) {
      logger.error('Admin', 'Ошибка загрузки промокодов', null, err)
      setError(err.message || 'Ошибка загрузки промокодов')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPromocodes()
  }, [loadPromocodes])

  const handleCreate = () => {
    setEditingPromo({
      code: '',
      type: 'percent',
      value: 10,
      tariffIds: null,
      active: true,
      maxUsages: null,
      validFrom: '',
      validUntil: '',
      description: ''
    })
    setShowForm(true)
    setError(null)
    setSuccess(null)
  }

  const handleEdit = (promo) => {
    setEditingPromo({
      ...promo,
      validFrom: promo.validFrom ? promo.validFrom.slice(0, 16) : '',
      validUntil: promo.validUntil ? promo.validUntil.slice(0, 16) : ''
    })
    setShowForm(true)
    setError(null)
    setSuccess(null)
  }

  const handleSave = async () => {
    if (!editingPromo || !editingPromo.code?.trim()) {
      setError('Введите код промокода')
      return
    }
    const val = Number(editingPromo.value)
    if (editingPromo.type === 'percent' && (val < 1 || val > 100)) {
      setError('Процент скидки от 1 до 100')
      return
    }
    if (editingPromo.type === 'fixed' && val < 0) {
      setError('Фиксированная скидка не может быть отрицательной')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      if (editingPromo.id) {
        await adminService.updatePromocode(editingPromo.id, {
          code: editingPromo.code,
          type: editingPromo.type,
          value: val,
          tariffIds: editingPromo.tariffIds && editingPromo.tariffIds.length ? editingPromo.tariffIds : null,
          active: editingPromo.active,
          maxUsages: editingPromo.maxUsages ? Number(editingPromo.maxUsages) : null,
          validFrom: editingPromo.validFrom || null,
          validUntil: editingPromo.validUntil || null,
          description: editingPromo.description || null
        })
        setSuccess('Промокод обновлён')
      } else {
        await adminService.createPromocode({
          code: editingPromo.code,
          type: editingPromo.type,
          value: val,
          tariffIds: editingPromo.tariffIds && editingPromo.tariffIds.length ? editingPromo.tariffIds : null,
          active: editingPromo.active,
          maxUsages: editingPromo.maxUsages ? Number(editingPromo.maxUsages) : null,
          validFrom: editingPromo.validFrom || null,
          validUntil: editingPromo.validUntil || null,
          description: editingPromo.description || null
        }, currentUserId)
        setSuccess('Промокод создан')
      }
      setEditingPromo(null)
      setShowForm(false)
      await loadPromocodes()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err.message || 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (promo) => {
    if (!window.confirm(`Удалить промокод "${promo.code}"?`)) return
    setSaving(true)
    setError(null)
    try {
      await adminService.deletePromocode(promo.id)
      setSuccess('Промокод удалён')
      setShowForm(false)
      setEditingPromo(null)
      await loadPromocodes()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err.message || 'Ошибка удаления')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full min-h-[44px] px-3 sm:px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
  const labelClass = 'block text-slate-300 text-sm font-medium mb-1.5'

  return (
    <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 section-spacing-sm">
      <div className="mb-4 sm:mb-5 md:mb-6">
        <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200 mb-1.5">
          Промокоды и скидки
        </h2>
        <p className="text-slate-400 text-sm">
          Создавайте промокоды для применения скидок при оплате тарифов
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-900/30 border border-green-800 rounded-lg text-green-400 text-sm">
          {success}
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={handleCreate}
          className="min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2"
        >
          <Plus size={18} />
          <span>Создать промокод</span>
        </button>
      </div>

      {showForm && editingPromo && (
        <div className="mb-6 p-4 sm:p-5 bg-slate-800 rounded-xl border border-slate-700">
          <h3 className="text-lg font-semibold text-slate-200 mb-4">
            {editingPromo.id ? 'Редактирование' : 'Новый промокод'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Код промокода</label>
              <input
                type="text"
                value={editingPromo.code}
                onChange={(e) => setEditingPromo({ ...editingPromo, code: e.target.value.toUpperCase() })}
                placeholder="SUMMER2025"
                className={inputClass}
                maxLength={50}
              />
            </div>
            <div>
              <label className={labelClass}>Тип скидки</label>
              <select
                value={editingPromo.type}
                onChange={(e) => setEditingPromo({ ...editingPromo, type: e.target.value })}
                className={inputClass}
              >
                <option value="percent">Процент (%)</option>
                <option value="fixed">Фиксированная сумма (₽)</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>
                {editingPromo.type === 'percent' ? 'Процент скидки' : 'Сумма скидки (₽)'}
              </label>
              <input
                type="number"
                min={editingPromo.type === 'percent' ? 1 : 0}
                max={editingPromo.type === 'percent' ? 100 : undefined}
                value={editingPromo.value}
                onChange={(e) => setEditingPromo({ ...editingPromo, value: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Макс. использований (пусто = без лимита)</label>
              <input
                type="number"
                min={1}
                value={editingPromo.maxUsages ?? ''}
                onChange={(e) => setEditingPromo({ ...editingPromo, maxUsages: e.target.value || null })}
                placeholder="Без лимита"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Действует с (необязательно)</label>
              <input
                type="datetime-local"
                value={editingPromo.validFrom}
                onChange={(e) => setEditingPromo({ ...editingPromo, validFrom: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Действует до (необязательно)</label>
              <input
                type="datetime-local"
                value={editingPromo.validUntil}
                onChange={(e) => setEditingPromo({ ...editingPromo, validUntil: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Описание (необязательно)</label>
              <input
                type="text"
                value={editingPromo.description ?? ''}
                onChange={(e) => setEditingPromo({ ...editingPromo, description: e.target.value })}
                placeholder="Акция лето 2025"
                className={inputClass}
              />
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingPromo.active}
                  onChange={(e) => setEditingPromo({ ...editingPromo, active: e.target.checked })}
                  className="rounded border-slate-600"
                />
                <span>Активен</span>
              </label>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium flex items-center gap-2"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              <span>Сохранить</span>
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingPromo(null) }}
              disabled={saving}
              className="min-h-[44px] px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium flex items-center gap-2"
            >
              <X size={18} />
              <span>Отмена</span>
            </button>
            {editingPromo.id && (
              <button
                type="button"
                onClick={() => handleDelete(editingPromo)}
                disabled={saving}
                className="min-h-[44px] px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-medium flex items-center gap-2 ml-auto"
              >
                <Trash2 size={18} />
                <span>Удалить</span>
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={32} className="animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="py-3 px-2 text-slate-400 font-medium text-sm">Код</th>
                <th className="py-3 px-2 text-slate-400 font-medium text-sm">Тип</th>
                <th className="py-3 px-2 text-slate-400 font-medium text-sm">Скидка</th>
                <th className="py-3 px-2 text-slate-400 font-medium text-sm">Использовано</th>
                <th className="py-3 px-2 text-slate-400 font-medium text-sm">Статус</th>
                <th className="py-3 px-2 text-slate-400 font-medium text-sm">Действует до</th>
                <th className="py-3 px-2 text-slate-400 font-medium text-sm"></th>
              </tr>
            </thead>
            <tbody>
              {promocodes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Нет промокодов. Создайте первый.
                  </td>
                </tr>
              ) : (
                promocodes.map((promo) => (
                  <tr key={promo.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="py-3 px-2">
                      <span className="font-mono font-semibold text-slate-200">{promo.code}</span>
                    </td>
                    <td className="py-3 px-2 text-slate-400 text-sm">
                      {promo.type === 'percent' ? 'Процент' : 'Фикс.'}
                    </td>
                    <td className="py-3 px-2 text-slate-300">
                      {promo.type === 'percent' ? `${promo.value}%` : `${promo.value} ₽`}
                    </td>
                    <td className="py-3 px-2 text-slate-400">
                      {promo.currentUsages ?? 0}
                      {promo.maxUsages != null && ` / ${promo.maxUsages}`}
                    </td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${promo.active ? 'bg-green-900/30 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                        {promo.active ? 'Активен' : 'Неактивен'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-slate-400 text-sm">
                      {promo.validUntil ? new Date(promo.validUntil).toLocaleDateString('ru-RU') : '—'}
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(promo)}
                          className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-blue-400"
                          aria-label="Редактировать"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(promo)}
                          className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-400"
                          aria-label="Удалить"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-slate-500 text-xs">
        Промокоды применяются при оплате тарифа. Пользователь вводит код в окне выбора тарифа.
      </p>
    </div>
  )
}

export default PromocodesPanel
