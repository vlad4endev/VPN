import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { X, Database, Link2, Key, Table, ArrowRight, ChevronLeft } from 'lucide-react'
import { useAdminContext } from '../context/AdminContext.jsx'

/** Извлечь строковое значение из ячейки NocoDB (может быть объект { value, display_value } или примитив). */
function getCellValue(cell) {
  if (cell == null) return ''
  if (typeof cell === 'object' && cell !== null) {
    const v = cell.value ?? cell.display_value ?? cell.displayValue ?? cell.title
    return (v != null ? String(v) : '').trim()
  }
  return String(cell).trim()
}

/** Подобрать колонку по приоритетным названиям. */
function guessColumn(columns, ...names) {
  if (!Array.isArray(columns) || columns.length === 0) return ''
  const lower = names.map((n) => n.toLowerCase())
  const found = columns.find((c) => lower.includes(String(c).toLowerCase()))
  return found || (columns.length ? columns[0] : '')
}

const SERVICE_FIELDS = [
  { key: 'emailColumn', label: 'Логин (обязательно)', hint: 'Колонка для логина, в NocoDB часто «Email»', required: true },
  { key: 'nameColumn', label: 'Имя (обязательно)', hint: 'Колонка с именем', required: true },
  { key: 'phoneColumn', label: 'Телефон', hint: 'Опционально', required: false },
  { key: 'tgIdColumn', label: 'Telegram ID', hint: 'Опционально', required: false },
  { key: 'roleColumn', label: 'Роль', hint: 'user, admin и т.д.', required: false },
  { key: 'planColumn', label: 'План', hint: 'free и т.д.', required: false },
  { key: 'subIdColumn', label: 'subID / 3x-ui ключ', hint: 'Идентификатор подписки (ключ пользователя)', required: false },
  { key: 'uuidColumn', label: 'UUID', hint: 'Идентификатор пользователя (из таблицы)', required: false },
  { key: 'tariffNameColumn', label: 'Тариф', hint: 'Название тарифа (SUPER, MULTI — сверяется с name/plan в Firestore)', required: false },
  { key: 'subscriptionStatusColumn', label: 'Статус подписки', hint: 'Пробная = тестовый (test_period), активная/оплачен = paid', required: false },
  { key: 'expiresAtColumn', label: 'Действует до', hint: 'Дата окончания (ISO или ДД.ММ.ГГГГ)', required: false },
  { key: 'orderIdColumn', label: 'order_id', hint: 'ID заказа — создаётся запись платежа', required: false },
  { key: 'amountColumn', label: 'Сумма', hint: 'Сумма платежа (число)', required: false },
  { key: 'devicesColumn', label: 'Кол-во устройств', hint: 'Лимит устройств', required: false },
  { key: 'createdAtColumn', label: 'Дата создания строки', hint: 'Дата начала использования сервиса (новичок/старожил)', required: false },
]

const DEFAULT_MAPPING = {
  emailColumn: '',
  nameColumn: '',
  phoneColumn: '',
  tgIdColumn: '',
  roleColumn: '',
  planColumn: '',
  subIdColumn: '',
  uuidColumn: '',
  tariffNameColumn: '',
  subscriptionStatusColumn: '',
  expiresAtColumn: '',
  orderIdColumn: '',
  amountColumn: '',
  devicesColumn: '',
  createdAtColumn: '',
}

const STORAGE_KEY = 'admin_nocodb_import_settings'

function loadSavedSettings() {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    return {
      connectForm: data.connectForm && typeof data.connectForm === 'object'
        ? {
            baseUrl: String(data.connectForm.baseUrl ?? '').trim(),
            apiToken: String(data.connectForm.apiToken ?? '').trim(),
            tableId: String(data.connectForm.tableId ?? '').trim(),
            tableId2: String(data.connectForm.tableId2 ?? '').trim(),
          }
        : null,
      mapping: data.mapping && typeof data.mapping === 'object' ? { ...DEFAULT_MAPPING, ...data.mapping } : null,
      writeBack: data.writeBack && typeof data.writeBack === 'object'
        ? {
            enabled: data.writeBack.enabled !== false,
            loginColumn: String(data.writeBack.loginColumn ?? 'Login').trim() || 'Login',
            passwordColumn: String(data.writeBack.passwordColumn ?? 'Password').trim() || 'Password',
          }
        : null,
      updateExistingUsers: data.updateExistingUsers !== false,
    }
  } catch {
    return null
  }
}

function saveSettings(connectForm, mapping, writeBack, updateExistingUsers, writeBackLoginPasswordOnUpdate) {
  try {
    if (typeof localStorage === 'undefined') return
    const payload = {
      connectForm: connectForm ? { baseUrl: connectForm.baseUrl || '', apiToken: connectForm.apiToken || '', tableId: connectForm.tableId || '', tableId2: connectForm.tableId2 || '' } : undefined,
      mapping: mapping || undefined,
      writeBack: writeBack || undefined,
      updateExistingUsers,
      writeBackLoginPasswordOnUpdate: !!writeBackLoginPasswordOnUpdate,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (_) {}
}

const ImportFromNocoDBModal = ({ onClose }) => {
  const { fetchNocoDBPreview, importFromNocoDB, getSavedNocoDBImportConfig, saveNocoDBImportConfig } = useAdminContext()

  const [step, setStep] = useState('connect') // 'connect' | 'mapping' | 'result'
  const [connectForm, setConnectForm] = useState({ baseUrl: '', apiToken: '', tableId: '', tableId2: '' })
  const [previewData, setPreviewData] = useState(null) // { list, columns }
  const [mapping, setMapping] = useState({ ...DEFAULT_MAPPING })
  const [writeBack, setWriteBack] = useState({ enabled: true, loginColumn: 'Login', passwordColumn: 'Password' })
  const [updateExistingUsers, setUpdateExistingUsers] = useState(true)
  const [writeBackLoginPasswordOnUpdate, setWriteBackLoginPasswordOnUpdate] = useState(false)
  const [savedRestored, setSavedRestored] = useState(false)
  const [loading, setLoading] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (savedRestored) return
    const saved = loadSavedSettings()
    if (saved) {
      if (saved.connectForm) setConnectForm(saved.connectForm)
      if (saved.mapping) setMapping(saved.mapping)
      if (saved.writeBack) setWriteBack(saved.writeBack)
      if (saved.updateExistingUsers !== undefined) setUpdateExistingUsers(saved.updateExistingUsers)
      if (saved.writeBackLoginPasswordOnUpdate !== undefined) setWriteBackLoginPasswordOnUpdate(!!saved.writeBackLoginPasswordOnUpdate)
    }
    setSavedRestored(true)
  }, [savedRestored])

  const configFetchedRef = React.useRef(false)
  // Подставить сохранённый на сервере конфиг (для автозагрузки) — приоритет над localStorage
  useEffect(() => {
    if (!savedRestored || configFetchedRef.current) return
    configFetchedRef.current = true
    let cancelled = false
    getSavedNocoDBImportConfig().then(({ config }) => {
      if (cancelled || !config) return
      if (config.baseUrl) setConnectForm((prev) => ({ ...prev, baseUrl: config.baseUrl || prev.baseUrl, apiToken: config.apiToken ?? prev.apiToken, tableId: config.tableId ?? prev.tableId, tableId2: config.tableId2 ?? prev.tableId2 }))
      if (config.emailColumn || config.nameColumn) {
        setMapping((prev) => ({
          ...prev,
          emailColumn: config.emailColumn ?? prev.emailColumn,
          nameColumn: config.nameColumn ?? prev.nameColumn,
          phoneColumn: config.phoneColumn ?? prev.phoneColumn,
          tgIdColumn: config.tgIdColumn ?? prev.tgIdColumn,
          roleColumn: config.roleColumn ?? prev.roleColumn,
          planColumn: config.planColumn ?? prev.planColumn,
          subIdColumn: config.subIdColumn ?? prev.subIdColumn,
          uuidColumn: config.uuidColumn ?? prev.uuidColumn,
          tariffNameColumn: config.tariffNameColumn ?? prev.tariffNameColumn,
          expiresAtColumn: config.expiresAtColumn ?? prev.expiresAtColumn,
          orderIdColumn: config.orderIdColumn ?? prev.orderIdColumn,
          amountColumn: config.amountColumn ?? prev.amountColumn,
          devicesColumn: config.devicesColumn ?? prev.devicesColumn,
        }))
      }
      if (config.loginColumn != null || config.passwordColumn != null) {
        setWriteBack((prev) => ({
          ...prev,
          enabled: config.writeBackToNocoDB !== false,
          loginColumn: config.loginColumn ?? prev.loginColumn,
          passwordColumn: config.passwordColumn ?? prev.passwordColumn,
        }))
      }
      if (config.updateExistingUsers !== undefined) setUpdateExistingUsers(!!config.updateExistingUsers)
      if (config.writeBackLoginPasswordOnUpdate !== undefined) setWriteBackLoginPasswordOnUpdate(!!config.writeBackLoginPasswordOnUpdate)
    }).catch((err) => {
      if (import.meta.env.DEV) console.warn('ImportFromNocoDBModal:', err?.message)
    })
    return () => { cancelled = true }
  }, [savedRestored, getSavedNocoDBImportConfig])

  const columns = previewData?.columns ?? []
  const rows = previewData?.list ?? []
  const previewRowsCount = 10

  const guessedMapping = useMemo(() => {
    if (columns.length === 0) return DEFAULT_MAPPING
    return {
      emailColumn: guessColumn(columns, 'Email', 'email', 'mail', 'e-mail', 'Login', 'логин'),
      nameColumn: guessColumn(columns, 'Name', 'name', 'Имя', 'имя', 'full_name', 'fullname'),
      phoneColumn: guessColumn(columns, 'Phone', 'phone', 'телефон', 'telephone'),
      tgIdColumn: guessColumn(columns, 'tgId', 'tg_id', 'telegram_id', 'Telegram ID'),
      roleColumn: guessColumn(columns, 'Role', 'role', 'роль'),
      planColumn: guessColumn(columns, 'Plan', 'plan', 'план'),
      subIdColumn: guessColumn(columns, 'subId', 'sub_id', 'SubID', '3x-ui'),
      uuidColumn: guessColumn(columns, 'uuid', 'UUID', 'Uuid'),
      tariffNameColumn: guessColumn(columns, 'Tariff', 'tariff', 'тариф', 'TariffName', 'tariffName'),
      subscriptionStatusColumn: guessColumn(columns, 'Статус подписки', 'статус подписки', 'Status', 'status', 'Статус', 'статус', 'subscriptionStatus'),
      expiresAtColumn: guessColumn(columns, 'expiresAt', 'ExpiresAt', 'Действует до', 'действует до', 'validUntil', 'ValidUntil'),
      orderIdColumn: guessColumn(columns, 'order_id', 'orderId', 'OrderId', 'order id'),
      amountColumn: guessColumn(columns, 'amount', 'Amount', 'сумма', 'Сумма', 'price', 'Price'),
      devicesColumn: guessColumn(columns, 'devices', 'Devices', 'устройства', 'Устройства', 'devicesCount'),
      createdAtColumn: guessColumn(columns, 'CreatedAt', 'created_at', 'Дата создания', 'дата создания', 'Created Time', 'created_at'),
    }
  }, [columns])

  const applyGuessedMapping = useCallback(() => {
    setMapping(guessedMapping)
  }, [guessedMapping])

  const getMappedValue = useCallback((rawRow, columnKey) => {
    const col = mapping[columnKey] || guessedMapping[columnKey]
    if (!col) return ''
    return getCellValue(rawRow[col])
  }, [mapping, guessedMapping])

  const handleConnectSubmit = useCallback(async (e) => {
    e.preventDefault()
    setError('')
    const baseUrl = connectForm.baseUrl.trim()
    const apiToken = connectForm.apiToken.trim()
    const tableId = connectForm.tableId.trim()
    if (!baseUrl || !apiToken) {
      setError('Укажите URL базы NocoDB и API-токен')
      return
    }
    if (!tableId) {
      setError('Укажите ID таблицы (из URL таблицы в NocoDB)')
      return
    }
    setLoading(true)
    try {
      const tableId2 = (connectForm.tableId2 || '').trim()
      const data = await fetchNocoDBPreview({ baseUrl, apiToken, tableId, ...(tableId2 ? { tableId2 } : {}) })
      setPreviewData(data)
      if (data.columns?.length) {
        const cols = data.columns
        setMapping({
          emailColumn: guessColumn(cols, 'Email', 'email', 'mail', 'Login'),
          nameColumn: guessColumn(cols, 'Name', 'name', 'Имя', 'full_name'),
          phoneColumn: guessColumn(cols, 'Phone', 'phone', 'телефон'),
          tgIdColumn: guessColumn(cols, 'tgId', 'tg_id', 'telegram_id'),
          roleColumn: guessColumn(cols, 'Role', 'role', 'роль'),
          planColumn: guessColumn(cols, 'Plan', 'plan', 'план'),
          subIdColumn: guessColumn(cols, 'subId', 'sub_id', 'SubID'),
          uuidColumn: guessColumn(cols, 'uuid', 'UUID', 'Uuid'),
          tariffNameColumn: guessColumn(cols, 'Tariff', 'tariff', 'TariffName'),
          subscriptionStatusColumn: guessColumn(cols, 'Статус подписки', 'Status', 'статус'),
          expiresAtColumn: guessColumn(cols, 'expiresAt', 'ExpiresAt', 'Действует до', 'validUntil'),
          orderIdColumn: guessColumn(cols, 'order_id', 'orderId'),
          amountColumn: guessColumn(cols, 'amount', 'Amount', 'сумма'),
          devicesColumn: guessColumn(cols, 'devices', 'Devices', 'устройства', 'Устройства'),
        })
      } else {
        setMapping({ ...DEFAULT_MAPPING })
      }
      saveSettings({ baseUrl, apiToken, tableId }, null, null)
      setStep('mapping')
    } catch (err) {
      setError(err.message || 'Ошибка загрузки данных из NocoDB')
    } finally {
      setLoading(false)
    }
  }, [connectForm, fetchNocoDBPreview])

  const handleMappingBack = useCallback(() => {
    setStep('connect')
    setError('')
    setPreviewData(null)
    setMapping({ ...DEFAULT_MAPPING })
  }, [])

  const handleImportSubmit = useCallback(async (e) => {
    e.preventDefault()
    setError('')
    const loginCol = (mapping.emailColumn || '').trim()
    const nameCol = (mapping.nameColumn || '').trim()
    if (!loginCol || !nameCol) {
      setError('Укажите колонки для логина и имени')
      return
    }
    setLoading(true)
    try {
      const params = {
        baseUrl: connectForm.baseUrl.trim(),
        apiToken: connectForm.apiToken.trim(),
        tableId: connectForm.tableId.trim(),
        tableId2: (connectForm.tableId2 || '').trim(),
        emailColumn: loginCol,
        nameColumn: nameCol,
        writeBackToNocoDB: !!writeBack.enabled,
        writeBackLoginPasswordOnUpdate: !!writeBackLoginPasswordOnUpdate,
        updateExistingUsers: !!updateExistingUsers,
        loginColumn: (writeBack.loginColumn || 'Login').trim() || 'Login',
        passwordColumn: (writeBack.passwordColumn || 'Password').trim() || 'Password',
      }
      if (mapping.phoneColumn?.trim()) params.phoneColumn = mapping.phoneColumn.trim()
      if (mapping.tgIdColumn?.trim()) params.tgIdColumn = mapping.tgIdColumn.trim()
      if (mapping.roleColumn?.trim()) params.roleColumn = mapping.roleColumn.trim()
      if (mapping.planColumn?.trim()) params.planColumn = mapping.planColumn.trim()
      if (mapping.subIdColumn?.trim()) params.subIdColumn = mapping.subIdColumn.trim()
      if (mapping.uuidColumn?.trim()) params.uuidColumn = mapping.uuidColumn.trim()
      if (mapping.tariffNameColumn?.trim()) params.tariffNameColumn = mapping.tariffNameColumn.trim()
      if (mapping.subscriptionStatusColumn?.trim()) params.subscriptionStatusColumn = mapping.subscriptionStatusColumn.trim()
      if (mapping.expiresAtColumn?.trim()) params.expiresAtColumn = mapping.expiresAtColumn.trim()
      if (mapping.orderIdColumn?.trim()) params.orderIdColumn = mapping.orderIdColumn.trim()
      if (mapping.amountColumn?.trim()) params.amountColumn = mapping.amountColumn.trim()
      if (mapping.devicesColumn?.trim()) params.devicesColumn = mapping.devicesColumn.trim()
      const res = await importFromNocoDB(params)
      saveSettings(
        { baseUrl: connectForm.baseUrl.trim(), apiToken: connectForm.apiToken.trim(), tableId: connectForm.tableId.trim(), tableId2: (connectForm.tableId2 || '').trim() },
        { ...mapping },
        { ...writeBack },
        updateExistingUsers,
        writeBackLoginPasswordOnUpdate,
      )
      setResult(res)
      setStep('result')
    } catch (err) {
      setError(err.message || 'Ошибка импорта')
    } finally {
      setLoading(false)
    }
  }, [connectForm, mapping, writeBack, updateExistingUsers, writeBackLoginPasswordOnUpdate, importFromNocoDB])

  const buildImportParams = useCallback(() => {
    const loginCol = (mapping.emailColumn || '').trim()
    const nameCol = (mapping.nameColumn || '').trim()
    const params = {
      baseUrl: connectForm.baseUrl.trim(),
      apiToken: connectForm.apiToken.trim(),
      tableId: connectForm.tableId.trim(),
      tableId2: (connectForm.tableId2 || '').trim(),
      emailColumn: loginCol,
      nameColumn: nameCol,
      writeBackToNocoDB: !!writeBack.enabled,
      writeBackLoginPasswordOnUpdate: !!writeBackLoginPasswordOnUpdate,
      updateExistingUsers: !!updateExistingUsers,
      loginColumn: (writeBack.loginColumn || 'Login').trim() || 'Login',
      passwordColumn: (writeBack.passwordColumn || 'Password').trim() || 'Password',
    }
    if (mapping.phoneColumn?.trim()) params.phoneColumn = mapping.phoneColumn.trim()
    if (mapping.tgIdColumn?.trim()) params.tgIdColumn = mapping.tgIdColumn.trim()
    if (mapping.roleColumn?.trim()) params.roleColumn = mapping.roleColumn.trim()
    if (mapping.planColumn?.trim()) params.planColumn = mapping.planColumn.trim()
    if (mapping.subIdColumn?.trim()) params.subIdColumn = mapping.subIdColumn.trim()
    if (mapping.uuidColumn?.trim()) params.uuidColumn = mapping.uuidColumn.trim()
    if (mapping.tariffNameColumn?.trim()) params.tariffNameColumn = mapping.tariffNameColumn.trim()
    if (mapping.subscriptionStatusColumn?.trim()) params.subscriptionStatusColumn = mapping.subscriptionStatusColumn.trim()
    if (mapping.expiresAtColumn?.trim()) params.expiresAtColumn = mapping.expiresAtColumn.trim()
    if (mapping.orderIdColumn?.trim()) params.orderIdColumn = mapping.orderIdColumn.trim()
    if (mapping.amountColumn?.trim()) params.amountColumn = mapping.amountColumn.trim()
    if (mapping.devicesColumn?.trim()) params.devicesColumn = mapping.devicesColumn.trim()
    if (mapping.createdAtColumn?.trim()) params.createdAtColumn = mapping.createdAtColumn.trim()
    return params
  }, [connectForm, mapping, writeBack, updateExistingUsers, writeBackLoginPasswordOnUpdate])

  const handleSaveConfigForAuto = useCallback(async () => {
    const loginCol = (mapping.emailColumn || '').trim()
    const nameCol = (mapping.nameColumn || '').trim()
    if (!loginCol || !nameCol) {
      setError('Укажите колонки для логина и имени')
      return
    }
    setError('')
    setSavingConfig(true)
    try {
      await saveNocoDBImportConfig(buildImportParams())
    } catch (err) {
      setError(err.message || 'Не удалось сохранить настройки')
    } finally {
      setSavingConfig(false)
    }
  }, [mapping, buildImportParams, saveNocoDBImportConfig])

  const handleCloseOrNew = useCallback(() => {
    if (step === 'result') onClose()
    else {
      setStep('connect')
      setResult(null)
      setError('')
      setPreviewData(null)
      setMapping({ ...DEFAULT_MAPPING })
    }
  }, [step, onClose])

  const details = result?.details

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4">
      <div className="w-full max-w-2xl bg-slate-900 rounded-xl shadow-2xl border border-slate-800 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-200 flex items-center gap-2">
              <Database className="w-5 h-5" />
              Импорт из NocoDB
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              {step === 'connect' && 'Подключитесь к таблице и загрузите данные'}
              {step === 'mapping' && 'Сопоставьте колонки таблицы с полями сервиса'}
              {step === 'result' && 'Результат импорта'}
            </p>
          </div>
          <button
            type="button"
            onClick={step === 'result' ? onClose : handleCloseOrNew}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mx-4 sm:mx-6 mt-3 px-3 py-2 bg-red-900/30 border border-red-800 rounded text-xs sm:text-sm text-red-300">
            {error}
          </div>
        )}

        {step === 'connect' && (
          <form onSubmit={handleConnectSubmit} className="px-4 sm:px-6 py-4 sm:py-5 space-y-4">
            <div className="space-y-3">
              <div>
                <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                  <Link2 className="w-4 h-4" /> URL базы NocoDB
                </label>
                <input
                  type="url"
                  value={connectForm.baseUrl}
                  onChange={(e) => setConnectForm((p) => ({ ...p, baseUrl: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://app.nocodb.com или ваш домен"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                  <Key className="w-4 h-4" /> API-токен
                </label>
                <input
                  type="password"
                  value={connectForm.apiToken}
                  onChange={(e) => setConnectForm((p) => ({ ...p, apiToken: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Токен из настроек NocoDB"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                  <Table className="w-4 h-4" /> ID таблицы 1
                </label>
                <input
                  type="text"
                  value={connectForm.tableId}
                  onChange={(e) => setConnectForm((p) => ({ ...p, tableId: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="mxxxxxxxx (из URL таблицы)"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                  <Table className="w-4 h-4" /> ID таблицы 2 (необязательно)
                </label>
                <input
                  type="text"
                  value={connectForm.tableId2 || ''}
                  onChange={(e) => setConnectForm((p) => ({ ...p, tableId2: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="mxxxxxxxx — вторая таблица с той же структурой"
                />
                <p className="text-[11px] text-slate-500 mt-1">При импорте данные загрузятся из обеих таблиц. В сопоставлении колонок будут показаны колонки из обеих таблиц (например, «Устройства» из второй таблицы).</p>
              </div>
              <p className="text-[11px] text-slate-500">
                URL, токен, ID таблиц и маппинг сохраняются в браузере и подставляются при следующем открытии.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button type="button" onClick={onClose} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-sm text-white rounded-lg">
                Отмена
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-sm text-white rounded-lg flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Загрузка...
                  </>
                ) : (
                  <>
                    Загрузить данные
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {step === 'mapping' && (
          <>
            <div className="px-4 sm:px-6 py-3 border-b border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleMappingBack}
                className="text-sm text-slate-400 hover:text-white flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Назад
              </button>
              <span className="text-slate-500 text-sm">Записей: {rows.length}</span>
            </div>
            <form onSubmit={handleImportSubmit} className="px-4 sm:px-6 py-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-300">Сопоставление колонок</span>
                  <button
                    type="button"
                    onClick={applyGuessedMapping}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Подставить автоматически
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SERVICE_FIELDS.map(({ key, label, hint, required }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        {label} {required && <span className="text-amber-400">*</span>}
                      </label>
                      <select
                        value={mapping[key] || ''}
                        onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">— не использовать —</option>
                        {columns.map((col) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-700 space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                  <input
                    type="checkbox"
                    checked={updateExistingUsers}
                    onChange={(e) => setUpdateExistingUsers(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-800 text-blue-500"
                  />
                  Обновлять существующих по Telegram ID
                </label>
                <p className="text-[11px] text-slate-500">Если включено, при повторном импорте пользователь ищется по Telegram ID из строки; если найден — обновляются имя, телефон, тариф, срок действия и т.д.</p>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                  <input
                    type="checkbox"
                    checked={writeBack.enabled}
                    onChange={(e) => setWriteBack((w) => ({ ...w, enabled: e.target.checked }))}
                    className="rounded border-slate-600 bg-slate-800 text-blue-500"
                  />
                  Записывать логин и пароль обратно в NocoDB
                </label>
                <p className="text-[11px] text-slate-500">Колонки «логин» и «пароль» ниже должны совпадать с названиями в таблице NocoDB. В таблице должен быть Id записи (системное поле — включите отображение системных полей в настройках таблицы, если запись не срабатывает).</p>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                  <input
                    type="checkbox"
                    checked={writeBackLoginPasswordOnUpdate}
                    onChange={(e) => setWriteBackLoginPasswordOnUpdate(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-800 text-blue-500"
                  />
                  При повторной загрузке записывать логин и пароль в таблицу (для обновлённых по Telegram ID)
                </label>
                <p className="text-[11px] text-slate-500">Включите, если при первом импорте логин/пароль не попали в таблицу — при следующем импорте с включённой галкой они будут записаны для обновлённых записей.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Колонка для логина</label>
                    <input
                      type="text"
                      value={writeBack.loginColumn}
                      onChange={(e) => setWriteBack((w) => ({ ...w, loginColumn: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200"
                      placeholder="Login"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Колонка для пароля</label>
                    <input
                      type="text"
                      value={writeBack.passwordColumn}
                      onChange={(e) => setWriteBack((w) => ({ ...w, passwordColumn: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200"
                      placeholder="Password"
                    />
                  </div>
                </div>
              </div>

              {rows.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-slate-300">Предпросмотр (первые {previewRowsCount} строк)</span>
                  <div className="mt-2 overflow-x-auto rounded-lg border border-slate-700">
                    <table className="w-full text-xs text-slate-300">
                      <thead>
                        <tr className="bg-slate-800/80">
                          <th className="px-2 py-1.5 text-left font-medium">#</th>
                          <th className="px-2 py-1.5 text-left font-medium">Логин</th>
                          <th className="px-2 py-1.5 text-left font-medium">Имя</th>
                          <th className="px-2 py-1.5 text-left font-medium">Телефон</th>
                          <th className="px-2 py-1.5 text-left font-medium">tgId</th>
                          <th className="px-2 py-1.5 text-left font-medium">subID</th>
                          <th className="px-2 py-1.5 text-left font-medium">UUID</th>
                          <th className="px-2 py-1.5 text-left font-medium">Тариф</th>
                          <th className="px-2 py-1.5 text-left font-medium">До</th>
                          <th className="px-2 py-1.5 text-left font-medium">order_id</th>
                          <th className="px-2 py-1.5 text-left font-medium">Сумма</th>
                          <th className="px-2 py-1.5 text-left font-medium">Устр.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, previewRowsCount).map((rawRow, idx) => (
                          <tr key={idx} className="border-t border-slate-700/50">
                            <td className="px-2 py-1.5 text-slate-500">{idx + 1}</td>
                            <td className="px-2 py-1.5">{getMappedValue(rawRow, 'emailColumn') || '—'}</td>
                            <td className="px-2 py-1.5">{getMappedValue(rawRow, 'nameColumn') || '—'}</td>
                            <td className="px-2 py-1.5">{getMappedValue(rawRow, 'phoneColumn') || '—'}</td>
                            <td className="px-2 py-1.5">{getMappedValue(rawRow, 'tgIdColumn') || '—'}</td>
                            <td className="px-2 py-1.5">{getMappedValue(rawRow, 'subIdColumn') || '—'}</td>
                            <td className="px-2 py-1.5">{getMappedValue(rawRow, 'uuidColumn') || '—'}</td>
                            <td className="px-2 py-1.5">{getMappedValue(rawRow, 'tariffNameColumn') || '—'}</td>
                            <td className="px-2 py-1.5">{getMappedValue(rawRow, 'expiresAtColumn') || '—'}</td>
                            <td className="px-2 py-1.5">{getMappedValue(rawRow, 'orderIdColumn') || '—'}</td>
                            <td className="px-2 py-1.5">{getMappedValue(rawRow, 'amountColumn') || '—'}</td>
                            <td className="px-2 py-1.5">{getMappedValue(rawRow, 'devicesColumn') || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-500">
                Сохраните сопоставление на сервере — тогда его можно использовать для ежедневной автозагрузки (cron: POST /api/admin/import-from-nocodb с <code className="bg-slate-800 px-1 rounded">useSavedConfig: true</code>).
              </p>
              <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-800">
                <button type="button" onClick={handleMappingBack} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-sm text-white rounded-lg">
                  Назад
                </button>
                <button
                  type="button"
                  onClick={handleSaveConfigForAuto}
                  disabled={savingConfig || loading || !(mapping.emailColumn && mapping.nameColumn)}
                  className="px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-60 text-sm text-white rounded-lg flex items-center gap-2"
                >
                  {savingConfig ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Сохранение...
                    </>
                  ) : (
                    'Сохранить для автозагрузки'
                  )}
                </button>
                <button
                  type="submit"
                  disabled={loading || !(mapping.emailColumn && mapping.nameColumn)}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-sm text-white rounded-lg flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Создание...
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4" />
                      Создать пользователей
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}

        {step === 'result' && result != null && (
          <div className="px-4 sm:px-6 py-4">
            <div className="px-3 py-3 bg-slate-800/50 border border-slate-700 rounded text-sm text-slate-200 space-y-2">
              <p className="text-slate-400 text-xs mb-1">Тариф подтягивается из колонки «Тариф» (SUPER, MULTI и т.д.) и сопоставляется с тарифами в системе.</p>
              <p><span className="text-green-400 font-medium">Создано:</span> {result.created}</p>
              {details?.created?.length > 0 && (
                <div className="ml-3 text-xs text-slate-300 max-h-32 overflow-y-auto">
                  {details.created.slice(0, 20).map((item, i) => (
                    <div key={i}>Строка {item.rowIndex ?? i + 1}: {item.login}{item.tariffName ? ` — тариф «${item.tariffName}»` : ''}</div>
                  ))}
                  {details.created.length > 20 && <div>… и ещё {details.created.length - 20}</div>}
                </div>
              )}
              {result.updated != null && result.updated > 0 && (
                <>
                  <p><span className="text-blue-400 font-medium">Обновлено:</span> {result.updated}</p>
                  {details?.updated?.length > 0 && (
                    <div className="ml-3 text-xs text-slate-300 max-h-32 overflow-y-auto">
                      {details.updated.slice(0, 20).map((item, i) => (
                        <div key={i}>Строка {item.rowIndex ?? i + 1}: {item.login}{item.tariffName ? ` — тариф «${item.tariffName}»` : ''}</div>
                      ))}
                      {details.updated.length > 20 && <div>… и ещё {details.updated.length - 20}</div>}
                    </div>
                  )}
                </>
              )}
              <p><span className="text-amber-400 font-medium">Пропущено:</span> {result.skipped}{result.emptyRows != null && result.emptyRows > 0 && <span className="text-slate-500 ml-1">(пустых строк: {result.emptyRows})</span>}</p>
              {details?.skipped?.length > 0 && (
                <div className="ml-3 text-xs text-amber-200/90 max-h-40 overflow-y-auto border-l-2 border-amber-500/50 pl-2">
                  {details.skipped.map((item, i) => (
                    <div key={i} className="mb-1">
                      <span className="font-medium">Строка {item.rowIndex}:</span> {item.reason}
                      {item.row?.login && <span className="text-slate-500 ml-1">(логин: {item.row.login})</span>}
                    </div>
                  ))}
                </div>
              )}
              <p><span className="text-red-400 font-medium">Ошибок:</span> {result.errors}</p>
              {result.writeBackOk != null && <p><span className="text-blue-400 font-medium">Записано в NocoDB:</span> {result.writeBackOk}</p>}
              {result.writeBackErrors?.length > 0 && (
                <div className="mt-2 text-xs text-amber-300 max-h-24 overflow-y-auto">
                  Ошибки обратной записи: {result.writeBackErrors.slice(0, 5).map((e, i) => <div key={i}>Строка {e.rowIndex}: {e.error || e.status}</div>)}
                  {result.writeBackErrors.length > 5 && <div>… и ещё {result.writeBackErrors.length - 5}</div>}
                </div>
              )}
              {details?.errors?.length > 0 && (
                <div className="mt-2 text-xs text-red-300 max-h-24 overflow-y-auto">
                  {details.errors.slice(0, 10).map((e, i) => <div key={i}>Строка {e.rowIndex}: {e.error}</div>)}
                  {details.errors.length > 10 && <div>… и ещё {details.errors.length - 10}</div>}
                </div>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button type="button" onClick={onClose} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-sm text-white rounded-lg">
                Закрыть
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ImportFromNocoDBModal
