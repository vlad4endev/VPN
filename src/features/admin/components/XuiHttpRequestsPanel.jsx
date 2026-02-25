/**
 * Панель «HTTP запросы» в настройках, подраздел 3x-ui.
 * Отображает все запросы к API 3x-ui по методам, позволяет админу редактировать path/body
 * и подставлять переменные из настроек сервера и пользователя.
 */

import { useState, useMemo, useCallback } from 'react'
import {
  Send,
  ChevronDown,
  ChevronRight,
  Edit2,
  Loader2,
  Copy,
  Check,
  AlertCircle,
  Server,
} from 'lucide-react'
import axios from 'axios'

// Список запросов 3x-ui API (метод, путь-шаблон, описание, тело по умолчанию для POST)
const DEFAULT_REQUESTS = [
  { id: 'login', method: 'POST', path: '/login', description: 'Авторизация в панели', bodyTemplate: { username: '{{xuiUsername}}', password: '{{xuiPassword}}' } },
  { id: 'inbounds-list', method: 'GET', path: '/panel/api/inbounds/list', description: 'Список инбаундов' },
  { id: 'inbounds', method: 'GET', path: '/panel/api/inbounds', description: 'Список инбаундов (альт.)' },
  { id: 'inbound-get', method: 'GET', path: '/panel/api/inbounds/get/{{inboundId}}', description: 'Получить инбаунд по ID' },
  { id: 'client-traffics', method: 'GET', path: '/panel/api/inbounds/getClientTraffics/{{email}}', description: 'Трафик клиента по email' },
  { id: 'client-traffics-by-id', method: 'GET', path: '/panel/api/inbounds/getClientTrafficsById/{{uuid}}', description: 'Трафик клиента по UUID' },
  { id: 'add-client', method: 'POST', path: '/panel/api/inbounds/addClient', description: 'Добавить клиента', bodyTemplate: { id: '{{inboundId}}', settings: '{"clients":[{"id":"{{uuid}}","email":"{{email}}","flow":"xtls-rprx-vision","limitIp":1,"totalGB":0,"expiryTime":0,"enable":true,"tgId":"","subId":"","reset":0,"up":0,"down":0}]}' } },
  { id: 'update-client', method: 'POST', path: '/panel/api/inbounds/updateClient/{{clientId}}', description: 'Обновить клиента', bodyTemplate: { id: '{{inboundId}}', settings: '{}' } },
  { id: 'del-client', method: 'POST', path: '/panel/api/inbounds/{{inboundId}}/delClient/{{clientId}}', description: 'Удалить клиента по clientId' },
  { id: 'del-client-by-email', method: 'POST', path: '/panel/api/inbounds/{{inboundId}}/delClientByEmail/{{email}}', description: 'Удалить клиента по email' },
  { id: 'client-stats', method: 'GET', path: '/panel/api/clients/{{clientId}}/stats', description: 'Статистика клиента по UUID' },
  { id: 'server-status', method: 'GET', path: '/panel/api/server/status', description: 'Статус сервера' },
  { id: 'get-new-uuid', method: 'GET', path: '/panel/api/server/getNewUUID', description: 'Получить новый UUID' },
  { id: 'xray-version', method: 'GET', path: '/panel/api/server/getXrayVersion', description: 'Версия Xray' },
  { id: 'restart-xray', method: 'POST', path: '/panel/api/server/restartXrayService', description: 'Перезапуск Xray' },
  { id: 'reset-traffic', method: 'POST', path: '/panel/api/inbounds/{{inboundId}}/resetClientTraffic/{{email}}', description: 'Сброс трафика клиента' },
]

// Ключи, значения которых при подстановке в path нужно кодировать для URL (согласно документации 3x-ui)
const PATH_ENCODE_KEYS = ['email', 'uuid', 'clientId']

function substituteVars(str, vars, options = {}) {
  if (str == null || typeof str !== 'string') return str
  const encodePath = options.encodePath === true
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key]
    if (val == null || val === '') return `{{${key}}}`
    const strVal = String(val)
    if (encodePath && PATH_ENCODE_KEYS.includes(key)) return encodeURIComponent(strVal)
    return strVal
  })
}

function substituteInObject(obj, vars) {
  if (obj == null) return obj
  if (typeof obj === 'string') return substituteVars(obj, vars, { encodePath: false })
  if (Array.isArray(obj)) return obj.map(item => substituteInObject(item, vars))
  if (typeof obj === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      out[substituteVars(k, vars)] = substituteInObject(v, vars)
    }
    return out
  }
  return obj
}

function getBaseUrlFromServer(server) {
  if (!server?.serverIP || !server?.serverPort) return ''
  const protocol = (server.protocol || (server.serverPort === 443 ? 'https' : 'http')).replace(/\/+$/, '')
  const pathPart = server.randompath ? `/${String(server.randompath).replace(/^\/+|\/+$/g, '')}` : ''
  return `${protocol}://${server.serverIP}:${server.serverPort}${pathPart}`.replace(/\/+$/, '')
}

export default function XuiHttpRequestsPanel({ servers = [], settings, selectedUserForVars = null }) {
  const [selectedServerId, setSelectedServerId] = useState('')
  const [expandedMethod, setExpandedMethod] = useState('GET')
  const [overrides, setOverrides] = useState({}) // { requestId: { path?, body? } }
  const [testVars, setTestVars] = useState({ email: '', uuid: '', clientId: '', inboundId: '' })
  const [loadingId, setLoadingId] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  const selectedServer = useMemo(() => {
    if (!selectedServerId) return null
    return servers.find(s => s.id === selectedServerId) || null
  }, [servers, selectedServerId])

  const vars = useMemo(() => {
    const v = {}
    if (selectedServer) {
      v.serverIP = selectedServer.serverIP
      v.serverPort = selectedServer.serverPort
      v.protocol = selectedServer.protocol || (selectedServer.serverPort === 443 ? 'https' : 'http')
      v.randompath = selectedServer.randompath || ''
      v.xuiUsername = (selectedServer.xuiUsername || '').trim().replace(/^["']|["']$/g, '')
      v.xuiPassword = selectedServer.xuiPassword || ''
      v.xuiInboundId = selectedServer.xuiInboundId || ''
      v.inboundId = selectedServer.xuiInboundId || testVars.inboundId
    }
    v.email = testVars.email || selectedUserForVars?.email || ''
    v.uuid = testVars.uuid || selectedUserForVars?.subId || selectedUserForVars?.uuid || ''
    v.clientId = testVars.clientId || v.uuid
    if (testVars.inboundId) v.inboundId = testVars.inboundId
    return v
  }, [selectedServer, testVars, selectedUserForVars])

  const requestsByMethod = useMemo(() => {
    const byMethod = {}
    DEFAULT_REQUESTS.forEach(r => {
      const method = r.method.toUpperCase()
      if (!byMethod[method]) byMethod[method] = []
      byMethod[method].push(r)
    })
    return byMethod
  }, [])

  const resolvePath = useCallback((req) => {
    const pathOverride = overrides[req.id]?.path
    const path = pathOverride != null ? pathOverride : req.path
    return substituteVars(path, vars, { encodePath: true })
  }, [overrides, vars])

  const resolveBody = useCallback((req) => {
    const bodyOverride = overrides[req.id]?.body
    let body = bodyOverride != null ? bodyOverride : req.bodyTemplate
    if (typeof body === 'string') {
      try {
        body = JSON.parse(substituteVars(body, vars, { encodePath: false }))
      } catch {
        return body
      }
    } else if (body && typeof body === 'object') {
      body = substituteInObject(JSON.parse(JSON.stringify(body)), vars)
    }
    // Согласно документации 3x-ui: id в addClient/updateClient — число
    if (body && typeof body === 'object' && body.id != null && typeof body.id === 'string' && /^\d+$/.test(body.id)) {
      body = { ...body, id: Number(body.id) }
    }
    return body
  }, [overrides, vars])

  const handleExecute = useCallback(async (req) => {
    const path = resolvePath(req)
    const method = req.method.toUpperCase()

    if (!selectedServer && !path.startsWith('/login')) {
      setError('Выберите сервер в настройках 3x-ui')
      return
    }

    setLoadingId(req.id)
    setError(null)
    setResult(null)

    const serverPayload = selectedServer
      ? {
          serverIP: selectedServer.serverIP,
          serverPort: selectedServer.serverPort,
          protocol: selectedServer.protocol || (selectedServer.serverPort === 443 ? 'https' : 'http'),
          randompath: selectedServer.randompath || '',
          xuiUsername: (selectedServer.xuiUsername || '').trim().replace(/^["']|["']$/g, ''),
          xuiPassword: selectedServer.xuiPassword || '',
          xuiInboundId: selectedServer.xuiInboundId || '',
        }
      : undefined

    const payload = {
      server: serverPayload,
      method,
      path,
    }
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        payload.body = resolveBody(req)
      } catch (e) {
        setError('Неверный JSON в теле запроса: ' + e.message)
        setLoadingId(null)
        return
      }
    }

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    try {
      const res = await axios.post(`${baseUrl}/api/xui-request`, payload, {
        timeout: 30000,
        validateStatus: () => true,
      })
      setResult({ status: res.status, data: res.data })
      if (res.status >= 400) setError(res.data?.msg || res.data?.message || `HTTP ${res.status}`)
    } catch (err) {
      setError(err.message || 'Ошибка запроса')
      setResult({ status: 0, data: null })
    } finally {
      setLoadingId(null)
    }
  }, [selectedServer, resolvePath, resolveBody])

  const setOverride = useCallback((requestId, field, value) => {
    setOverrides(prev => ({
      ...prev,
      [requestId]: { ...prev[requestId], [field]: value }
    }))
  }, [])

  const copyResult = useCallback(() => {
    if (!result) return
    const text = JSON.stringify(result.data, null, 2)
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [result])

  const methodOrder = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

  return (
    <div className="space-y-4">
      {/* Сервер и переменные */}
      <div className="p-4 bg-slate-800 rounded-xl border border-slate-700 space-y-4">
        <h3 className="text-slate-200 font-semibold flex items-center gap-2">
          <Server className="w-4 h-4" />
          Сервер и переменные
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-400 text-sm mb-1">Сервер 3x-ui</label>
            <select
              value={selectedServerId}
              onChange={(e) => setSelectedServerId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Выберите сервер —</option>
              {servers.filter(s => s.active !== false).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {['email', 'uuid', 'clientId', 'inboundId'].map(key => (
            <div key={key}>
              <label className="block text-slate-500 text-xs mb-0.5">{key}</label>
              <input
                type="text"
                value={testVars[key] ?? ''}
                onChange={(e) => setTestVars(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={key === 'inboundId' ? (vars.xuiInboundId || '') : ''}
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-200 text-sm font-mono"
              />
            </div>
          ))}
        </div>
        <div className="text-xs text-slate-500">
          В пути и теле запроса можно использовать: {' '}
          <code className="bg-slate-900 px-1 rounded">serverIP</code>,{' '}
          <code className="bg-slate-900 px-1 rounded">serverPort</code>,{' '}
          <code className="bg-slate-900 px-1 rounded">protocol</code>,{' '}
          <code className="bg-slate-900 px-1 rounded">randompath</code>,{' '}
          <code className="bg-slate-900 px-1 rounded">xuiUsername</code>,{' '}
          <code className="bg-slate-900 px-1 rounded">xuiInboundId</code>,{' '}
          <code className="bg-slate-900 px-1 rounded">inboundId</code>,{' '}
          <code className="bg-slate-900 px-1 rounded">email</code>,{' '}
          <code className="bg-slate-900 px-1 rounded">uuid</code>,{' '}
          <code className="bg-slate-900 px-1 rounded">clientId</code> — в формате {'{{'}name{'}}'}.
        </div>
      </div>

      {/* Запросы по методам */}
      <div className="space-y-3">
        {methodOrder.filter(m => requestsByMethod[m]?.length).map(method => (
          <div key={method} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedMethod(prev => prev === method ? null : method)}
              className="w-full flex items-center justify-between px-4 py-3 text-left text-slate-200 font-medium hover:bg-slate-700/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                {expandedMethod === method ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                {method}
              </span>
              <span className="text-slate-500 text-sm">{requestsByMethod[method].length} запросов</span>
            </button>
            {expandedMethod === method && (
              <div className="border-t border-slate-700 divide-y divide-slate-700">
                {requestsByMethod[method].map(req => (
                  <div key={req.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-slate-400 text-sm">{req.description}</span>
                      <button
                        type="button"
                        onClick={() => handleExecute(req)}
                        disabled={!!loadingId}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white text-sm rounded-lg transition-colors"
                      >
                        {loadingId === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Выполнить
                      </button>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <label className="block text-slate-500 text-xs mb-0.5">Path</label>
                        <input
                          type="text"
                          value={overrides[req.id]?.path ?? req.path}
                          onChange={(e) => setOverride(req.id, 'path', e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-200 text-sm font-mono"
                          placeholder={req.path}
                        />
                        <p className="text-slate-500 text-xs mt-0.5 font-mono break-all">
                          → {resolvePath(req)}
                        </p>
                      </div>
                    </div>
                    {['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase()) && (
                      <div>
                        <label className="block text-slate-500 text-xs mb-0.5">Body (JSON)</label>
                        <textarea
                          value={
                            overrides[req.id]?.body ??
                            (typeof req.bodyTemplate === 'object' ? JSON.stringify(req.bodyTemplate, null, 2) : (req.bodyTemplate || '{}'))
                          }
                          onChange={(e) => {
                            try {
                              JSON.parse(e.target.value)
                              setOverride(req.id, 'body', e.target.value)
                            } catch {
                              setOverride(req.id, 'body', e.target.value)
                            }
                          }}
                          rows={4}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-200 text-xs font-mono"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Ошибка */}
      {error && (
        <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Результат */}
      {result && (
        <div className="p-4 bg-slate-800 rounded-xl border border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-300 font-medium">
              Ответ: HTTP {result.status}
            </span>
            <button
              type="button"
              onClick={copyResult}
              className="flex items-center gap-1 text-slate-400 hover:text-slate-200 text-sm"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
          <pre className="p-3 bg-slate-900 rounded-lg text-slate-300 text-xs overflow-auto max-h-64">
            {JSON.stringify(result.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
