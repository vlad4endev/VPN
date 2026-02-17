import React, { useState, useCallback } from 'react'
import { X, Database, Link2, Key, Table, Lock } from 'lucide-react'
import { useAdminContext } from '../context/AdminContext.jsx'

const ImportFromNocoDBModal = ({ onClose }) => {
  const { importFromNocoDB } = useAdminContext()

  const [form, setForm] = useState({
    baseUrl: '',
    apiToken: '',
    tableId: '',
    defaultPassword: '',
    emailColumn: '',
    nameColumn: '',
    phoneColumn: '',
    tgIdColumn: '',
  })
  const [showMapping, setShowMapping] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const handleChange = useCallback((e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (error) setError('')
    if (result) setResult(null)
  }, [error, result])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)

    const baseUrl = form.baseUrl.trim()
    const apiToken = form.apiToken.trim()
    const tableId = form.tableId.trim()
    const defaultPassword = form.defaultPassword

    if (!baseUrl || !apiToken) {
      setError('Укажите URL базы NocoDB и API-токен')
      return
    }
    if (!tableId) {
      setError('Укажите ID таблицы (из URL таблицы в NocoDB, например mxxxxxxxx)')
      return
    }
    if (!defaultPassword || defaultPassword.length < 6) {
      setError('Пароль по умолчанию для импорта — минимум 6 символов')
      return
    }

    setIsSubmitting(true)
    try {
      const params = {
        baseUrl,
        apiToken,
        tableId,
        defaultPassword,
      }
      if (form.emailColumn.trim()) params.emailColumn = form.emailColumn.trim()
      if (form.nameColumn.trim()) params.nameColumn = form.nameColumn.trim()
      if (form.phoneColumn.trim()) params.phoneColumn = form.phoneColumn.trim()
      if (form.tgIdColumn.trim()) params.tgIdColumn = form.tgIdColumn.trim()
      const res = await importFromNocoDB(params)
      setResult(res)
    } catch (err) {
      setError(err.message || 'Ошибка импорта из NocoDB')
    } finally {
      setIsSubmitting(false)
    }
  }, [form, importFromNocoDB])

  const details = result?.details

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4">
      <div className="w-full max-w-lg bg-slate-900 rounded-xl shadow-2xl border border-slate-800 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-200 flex items-center gap-2">
              <Database className="w-5 h-5" />
              Импорт из NocoDB
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Загрузить записи таблицы и создать пользователей (email, имя обязательны)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
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

        {result != null && (
          <div className="mx-4 sm:mx-6 mt-3 px-3 py-3 bg-slate-800/50 border border-slate-700 rounded text-sm text-slate-200 space-y-2">
            <p>
              <span className="text-green-400 font-medium">Создано:</span> {result.created}
            </p>
            <p>
              <span className="text-amber-400 font-medium">Пропущено:</span> {result.skipped}
              {result.emptyRows != null && result.emptyRows > 0 && (
                <span className="text-slate-500 ml-1">(пустых строк: {result.emptyRows})</span>
              )}
            </p>
            <p>
              <span className="text-red-400 font-medium">Ошибок:</span> {result.errors}
            </p>
            {result.sampleRowKeys && result.sampleRowKeys.length > 0 && (
              <p className="text-slate-400 text-xs mt-2">
                Колонки в таблице: <code className="bg-slate-800 px-1 rounded">{result.sampleRowKeys.join(', ')}</code>
                {' '}
                — если импорт пропустил строки, укажите названия колонок для email и имени ниже и повторите импорт.
              </p>
            )}
            {details?.errors?.length > 0 && (
              <div className="mt-2 text-xs text-red-300 max-h-24 overflow-y-auto">
                {details.errors.slice(0, 10).map((e, idx) => (
                  <div key={idx}>
                    Строка {e.rowIndex} ({e.email}): {e.error}
                  </div>
                ))}
                {details.errors.length > 10 && (
                  <div>… и ещё {details.errors.length - 10}</div>
                )}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-4 sm:py-5 space-y-4">
          <div className="space-y-3">
            <div>
              <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                <Link2 className="w-4 h-4" />
                URL базы NocoDB
              </label>
              <input
                type="url"
                name="baseUrl"
                value={form.baseUrl}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://app.nocodb.com или https://your-nocodb.domain"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                <Key className="w-4 h-4" />
                API-токен
              </label>
              <input
                type="password"
                name="apiToken"
                value={form.apiToken}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Токен из настроек NocoDB (Account / API Token)"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                <Table className="w-4 h-4" />
                ID таблицы
              </label>
              <input
                type="text"
                name="tableId"
                value={form.tableId}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="mxxxxxxxx (из URL таблицы)"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                <Lock className="w-4 h-4" />
                Пароль по умолчанию для импорта
              </label>
              <input
                type="password"
                name="defaultPassword"
                value={form.defaultPassword}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Минимум 6 символов"
                required
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Этот пароль будет установлен всем созданным пользователям.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowMapping((v) => !v)}
                className="text-xs sm:text-sm text-slate-300 hover:text-white underline underline-offset-4"
              >
                {showMapping ? 'Скрыть маппинг колонок' : 'Показать маппинг колонок (если автоопределение не сработало)'}
              </button>
              {showMapping && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                      Колонка Email
                    </label>
                    <input
                      type="text"
                      name="emailColumn"
                      value={form.emailColumn}
                      onChange={handleChange}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Напр. Email или clxxxxxx"
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                      Колонка Имя
                    </label>
                    <input
                      type="text"
                      name="nameColumn"
                      value={form.nameColumn}
                      onChange={handleChange}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Напр. Name или clxxxxxx"
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                      Колонка Phone (опционально)
                    </label>
                    <input
                      type="text"
                      name="phoneColumn"
                      value={form.phoneColumn}
                      onChange={handleChange}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Напр. Phone или clxxxxxx"
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                      Колонка tgId (опционально)
                    </label>
                    <input
                      type="text"
                      name="tgIdColumn"
                      value={form.tgIdColumn}
                      onChange={handleChange}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Напр. tgId или clxxxxxx"
                    />
                  </div>
                  <p className="sm:col-span-2 text-[11px] text-slate-500">
                    Подсказка: после импорта смотрите строку «Колонки в таблице: ...» и копируйте нужные названия сюда.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-sm text-white rounded-lg transition-colors"
            >
              {result != null ? 'Закрыть' : 'Отмена'}
            </button>
            {result == null && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-sm text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Импорт...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    Загрузить и создать пользователей
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export default ImportFromNocoDBModal
