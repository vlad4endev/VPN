/**
 * Модуль для отправки HTTP-запросов к панели 3x-ui.
 * Используется на backend (proxy-server, n8n-webhook-proxy и др.).
 *
 * Примеры URL (Random Path в пути):
 *   baseUrl:  https://84.201.161.204:40919/Gxckr4KcZGtB6aOZdw
 *   login:    https://84.201.161.204:40919/Gxckr4KcZGtB6aOZdw/login
 *   inbounds: https://84.201.161.204:40919/Gxckr4KcZGtB6aOZdw/panel/api/inbounds
 *
 * Пример запроса авторизации (form):
 *   curl --location 'http://localhost:2053/randompath/login/' \
 *     --form 'username="..."' --form 'password="..."'
 *   Поддерживаются JSON и application/x-www-form-urlencoded.
 *
 * API Documentation (Postman): соответствует официальной 3x-ui API.
 * - Authentication: POST {baseUrl}/login или {baseUrl}/login/  Body: username, password (form или JSON)
 * - Inbounds: base path /panel/api/inbounds
 *   GET /list, GET /get/:id, GET /getClientTraffics/:email, GET /getClientTrafficsById/:uuid,
 *   POST /addClient, POST /:id/delClient/:clientId, POST /updateClient/:clientId,
 *   POST /:id/delClientByEmail/:email, ...
 * - clientId: VMESS/VLESS → client.id, TROJAN → client.password, Shadowsocks → client.email
 *
 * Форматы данных (см. CRITICAL_FIXES_3XUI_API.md):
 * - totalGB: в байтах (не в GB).
 * - expiryTime: в миллисекундах (Unix timestamp * 1000).
 * - email: без пробелов (пробелы заменять на _).
 */

import axios from 'axios'
import https from 'https'

const DEFAULT_TIMEOUT_MS = 30_000
/** Если 1 или true — не проверять TLS (для доступа по IP, когда сертификат выдан на домен). Использовать только в доверенной сети. */
const INSECURE_SKIP_TLS = process.env.XUI_INSECURE_SKIP_TLS === '1' || process.env.XUI_INSECURE_SKIP_TLS === 'true'
const httpsAgent = INSECURE_SKIP_TLS ? new https.Agent({ rejectUnauthorized: false }) : undefined
if (INSECURE_SKIP_TLS) {
  console.warn('⚠️ [xuiClient] XUI_INSECURE_SKIP_TLS включён: проверка TLS при подключении к 3x-ui отключена (подключение по IP с сертификатом на другое имя).')
}
const LOGIN_TIMEOUT_MS = 10_000

/**
 * Нормализация email для 3x-ui (без пробелов).
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
  return (email || '').toString().trim().replace(/\s+/g, '_')
}

/**
 * Конвертация лимита трафика: GB → байты.
 * Если уже передано в байтах (большое число), не умножать повторно.
 * @param {number} totalGB - лимит в GB или в байтах (если >= 1024*1024 считаем байтами)
 * @returns {number} байты
 */
function toBytes(totalGB) {
  if (totalGB == null || totalGB <= 0) return 0
  if (totalGB >= 1024 * 1024) return Math.floor(Number(totalGB))
  return Math.floor(Number(totalGB) * 1024 * 1024 * 1024)
}

/**
 * Создаёт клиент для работы с 3x-ui API.
 * @param {Object} [options]
 * @param {string} [options.baseUrl] - базовый URL панели (по умолчанию process.env.XUI_HOST)
 * @param {string} [options.username] - логин (по умолчанию process.env.XUI_USERNAME)
 * @param {string} [options.password] - пароль (по умолчанию process.env.XUI_PASSWORD)
 * @param {number} [options.timeout] - таймаут запросов в мс
 * @param {{ info: Function, warn: Function, error: Function }} [options.logger] - логгер
 * @returns {XuiClient}
 */
export function createXuiClient(options = {}) {
  const baseUrl = (options.baseUrl || process.env.XUI_HOST || '').toString().replace(/\/+$/, '')
  const username = options.username ?? process.env.XUI_USERNAME ?? ''
  const password = options.password ?? process.env.XUI_PASSWORD ?? ''
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS
  const logger = options.logger || {
    info: (...args) => console.log('[xuiClient]', ...args),
    warn: (...args) => console.warn('[xuiClient]', ...args),
    error: (...args) => console.error('[xuiClient]', ...args),
  }

  let sessionCookie = null

  /**
   * Authentication: POST /login.
   * Использует username и password из опций createXuiClient (из настроек сервера или env).
   * @returns {Promise<string|null>} значение cookie (например "3x-ui=...") или null
   */
  async function login() {
    if (!baseUrl || !username || !password) {
      logger.warn('XUI: логин невозможен — не заданы baseUrl, username или password')
      return null
    }
    // Поддержка URL с завершающим слэшем: /login или /login/
    const url = `${baseUrl.replace(/\/+$/, '')}/login`
    const formBody = new URLSearchParams({ username, password }).toString()
    try {
      const res = await axios.post(url, formBody, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        validateStatus: () => true,
        timeout: LOGIN_TIMEOUT_MS,
        ...(url.startsWith('https') && httpsAgent ? { httpsAgent } : {}),
      })
      if (res.headers['set-cookie']) {
        const cookies = Array.isArray(res.headers['set-cookie'])
          ? res.headers['set-cookie']
          : [res.headers['set-cookie']]
        const session = cookies.find((c) => c.includes('3x-ui='))
        if (session) {
          sessionCookie = session.split(';')[0]
          logger.info('XUI: успешный вход в панель', { url: baseUrl })
          return sessionCookie
        }
      }
      const msg = res.data?.msg || res.data?.message || `HTTP ${res.status}`
      logger.warn('XUI: вход не удался', { status: res.status, msg })
      return null
    } catch (err) {
      logger.error('XUI: ошибка входа', { message: err.message, url })
      return null
    }
  }

  /**
   * Возвращает текущую сессию; при необходимости выполняет login.
   * @returns {Promise<string|null>}
   */
  async function ensureSession() {
    if (sessionCookie) return sessionCookie
    return login()
  }

  /**
   * Низкоуровневый HTTP-запрос к 3x-ui.
   * @param {string} method - GET, POST, PUT, PATCH, DELETE
   * @param {string} path - путь относительно baseUrl (начинается с /), можно с query
   * @param {{ body?: any, cookie?: string, skipAuth?: boolean }} [opts]
   * @returns {Promise<{ data: any, status: number, headers: Object }>}
   */
  async function request(method, path, opts = {}) {
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`
    const cookie = opts.cookie ?? (opts.skipAuth ? null : await ensureSession())
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    if (cookie) headers.Cookie = cookie

    const config = {
      method,
      url,
      headers,
      validateStatus: () => true,
      timeout: opts.timeout ?? timeout,
      ...(url.startsWith('https') && httpsAgent ? { httpsAgent } : {}),
    }
    if (opts.body !== undefined && ['POST', 'PUT', 'PATCH'].includes(method)) {
      config.data = opts.body
    }

    const res = await axios(config)
    if (res.status === 401 || res.status === 403) {
      sessionCookie = null
      if (!opts.skipAuth) {
        const newCookie = await login()
        if (newCookie) return request(method, path, { ...opts, cookie: newCookie })
      }
    }
    return { data: res.data, status: res.status, headers: res.headers || {} }
  }

  return {
    get baseUrl() {
      return baseUrl
    },

    get configured() {
      return Boolean(baseUrl && username && password)
    },

    /**
     * Вход в панель (получить cookie).
     * @returns {Promise<string|null>}
     */
    login,

    /**
     * Произвольный запрос к API.
     * @param {string} method
     * @param {string} path
     * @param {{ body?: any, skipAuth?: boolean }} [opts]
     */
    async api(method, path, opts = {}) {
      const { data, status } = await request(method, path, opts)
      if (status >= 400) {
        const msg = data?.msg ?? data?.message ?? `HTTP ${status}`
        throw new Error(msg)
      }
      return data
    },

    /**
     * Запрос к 3x-ui без выброса ошибки (для прокси). Возвращает { data, status, headers }.
     * @param {string} method
     * @param {string} path - путь с query, например /panel/api/inbounds?foo=1
     * @param {{ body?: any }} [opts]
     * @returns {Promise<{ data: any, status: number, headers: Object }>}
     */
    async requestRaw(method, path, opts = {}) {
      return request(method, path, opts)
    },

    /**
     * Список инбаундов. API: GET /panel/api/inbounds/list (или /panel/api/inbounds).
     * @returns {Promise<Array>}
     */
    async getInbounds() {
      try {
        const data = await this.api('GET', '/panel/api/inbounds/list')
        const list = data?.obj ?? data
        return Array.isArray(list) ? list : []
      } catch (e) {
        const data = await this.api('GET', '/panel/api/inbounds')
        const list = data?.obj ?? data
        return Array.isArray(list) ? list : []
      }
    },

    /**
     * Один инбаунд по id. API: GET /panel/api/inbounds/get/:id
     * @param {string|number} inboundId
     * @returns {Promise<Object|null>}
     */
    async getInbound(inboundId) {
      const data = await this.api('GET', `/panel/api/inbounds/get/${inboundId}`)
      return data?.obj ?? data ?? null
    },

    /**
     * Трафик клиента по email. API: GET /panel/api/inbounds/getClientTraffics/:email
     * @param {string} email
     * @returns {Promise<Object>}
     */
    async getClientTraffics(email) {
      const enc = encodeURIComponent(normalizeEmail(email))
      const data = await this.api('GET', `/panel/api/inbounds/getClientTraffics/${enc}`)
      return data?.obj ?? data ?? {}
    },

    /**
     * Трафик клиента по UUID клиента. API: GET /panel/api/inbounds/getClientTrafficsById/{uuid}
     * @param {string} uuid - Client UUID (обязательный)
     * @returns {Promise<Object>}
     */
    async getClientTrafficsById(uuid) {
      const data = await this.api('GET', `/panel/api/inbounds/getClientTrafficsById/${encodeURIComponent(uuid)}`)
      return data?.obj ?? data ?? {}
    },

    /**
     * Добавить клиента в инбаунд.
     * totalGB передаётся в байтах (если передать число в GB — будет преобразовано, см. опции).
     * expiryTime в миллисекундах.
     * @param {string|number} inboundId
     * @param {Object} params
     * @param {string} params.email
     * @param {string} params.uuid - UUID клиента (id в 3x-ui)
     * @param {number} [params.totalGB] - лимит трафика в GB (переводится в байты) или уже в байтах (число >= 1048576)
     * @param {number} [params.expiryTime] - срок в миллисекундах (0 = без ограничений)
     * @param {number} [params.limitIp=1]
     * @param {string} [params.flow='xtls-rprx-vision']
     * @param {string} [params.tgId]
     * @param {string} [params.subId]
     * @param {boolean} [params.enable=true]
     * @returns {Promise<Object>}
     */
    async addClient(inboundId, params) {
      const email = normalizeEmail(params.email)
      // totalGB: в байтах (если число маленькое — считаем GB и конвертируем, иначе уже байты)
      const totalGBRaw = params.totalGB != null ? params.totalGB : 0
      const totalGBInBytes = toBytes(totalGBRaw)
      const expiryTime =
        params.expiryTime != null && params.expiryTime > 0
          ? Number(params.expiryTime)
          : 0

      const client = {
        id: params.uuid,
        email,
        flow: params.flow || 'xtls-rprx-vision',
        limitIp: params.limitIp ?? 1,
        totalGB: totalGBInBytes,
        expiryTime,
        enable: params.enable !== false,
        tgId: (params.tgId ?? '').toString(),
        subId: (params.subId ?? '').toString(),
        reset: 0,
        up: 0,
        down: 0,
      }

      const body = {
        id: Number(inboundId),
        settings: JSON.stringify({ clients: [client] }),
      }

      return this.api('POST', '/panel/api/inbounds/addClient', { body })
    },

    /**
     * Обновить клиента.
     * API: POST /panel/api/inbounds/updateClient/:clientId
     * Body: { id: inboundId, settings: JSON.stringify({ clients: [client] }) }
     * Пример: curl --location 'http://localhost:2053/randompath/panel/api/inbounds/updateClient/{uuid}' \
     *   --header 'Accept: application/json' --data '{"id": 6, "settings": "{\"clients\": [...]}"}'
     * @param {string|number} inboundId
     * @param {string} clientId - UUID (VLESS/VMESS), password (TROJAN) или email (Shadowsocks)
     * @param {Object} updates - поля для обновления (totalGB в байтах, expiryTime в мс)
     * @returns {Promise<Object>}
     */
    async updateClient(inboundId, clientId, updates) {
      const inbound = await this.getInbound(inboundId)
      if (!inbound?.clients) throw new Error(`Инбаунд ${inboundId} не найден`)
      const client = inbound.clients.find((c) => c.id === clientId)
      if (!client) throw new Error(`Клиент ${clientId} не найден в инбаунде ${inboundId}`)

      const merged = {
        ...client,
        ...updates,
        id: client.id,
        email: updates.email != null ? normalizeEmail(updates.email) : client.email,
      }
      if (updates.totalGB != null) merged.totalGB = toBytes(updates.totalGB)
      if (updates.expiryTime != null) merged.expiryTime = Number(updates.expiryTime)

      const body = {
        id: Number(inboundId),
        settings: JSON.stringify({ clients: [merged] }),
      }
      return this.api('POST', `/panel/api/inbounds/updateClient/${clientId}`, { body })
    },

    /**
     * Удалить клиента по clientId. API: POST /panel/api/inbounds/:id/delClient/:clientId
     * clientId: VMESS/VLESS → client.id, TROJAN → client.password, Shadowsocks → client.email
     * @param {string|number} inboundId
     * @param {string} clientId - UUID (VLESS/VMESS), password (TROJAN) или email (Shadowsocks)
     * @returns {Promise<Object>}
     */
    async delClient(inboundId, clientId) {
      return this.api('POST', `/panel/api/inbounds/${inboundId}/delClient/${clientId}`)
    },

    /**
     * Удалить клиента по email. API: POST /panel/api/inbounds/:id/delClientByEmail/:email
     * @param {string|number} inboundId
     * @param {string} email
     * @returns {Promise<Object>}
     */
    async delClientByEmail(inboundId, email) {
      const enc = encodeURIComponent(normalizeEmail(email))
      return this.api('POST', `/panel/api/inbounds/${inboundId}/delClientByEmail/${enc}`)
    },

    /**
     * Статистика клиента по UUID (panel API clients).
     * @param {string} clientId - UUID клиента (VLESS/VMESS)
     * @returns {Promise<{ up?: number, down?: number, total?: number, expiryTime?: number }>}
     */
    async getClientStats(clientId) {
      const data = await this.api('GET', `/panel/api/clients/${clientId}/stats`)
      return data?.obj ?? data ?? {}
    },

    /**
     * Найти клиента по email среди всех инбаундов.
     * @param {string} email
     * @returns {Promise<{ client: Object, inbound: Object }|null>}
     */
    async findClientByEmail(email) {
      const norm = normalizeEmail(email)
      const inbounds = await this.getInbounds()
      for (const inbound of inbounds) {
        const client = (inbound.clients || []).find((c) => normalizeEmail(c.email) === norm)
        if (client) return { client, inbound }
      }
      return null
    },

    /**
     * Сбросить сохранённую сессию (при следующем запросе будет повторный login).
     */
    clearSession() {
      sessionCookie = null
    },

    // ---------- Server API (base path /panel/api/server) ----------

    /**
     * Статус сервера. API: GET /panel/api/server/status
     * @returns {Promise<Object>}
     */
    async getServerStatus() {
      const data = await this.api('GET', '/panel/api/server/status')
      return data?.obj ?? data ?? {}
    },

    /**
     * Сгенерировать новый UUID. API: GET /panel/api/server/getNewUUID
     * @returns {Promise<string>}
     */
    async getNewUUID() {
      const data = await this.api('GET', '/panel/api/server/getNewUUID')
      return data?.obj ?? data ?? ''
    },

    /**
     * Версия Xray. API: GET /panel/api/server/getXrayVersion
     * @returns {Promise<Object>}
     */
    async getXrayVersion() {
      const data = await this.api('GET', '/panel/api/server/getXrayVersion')
      return data?.obj ?? data ?? {}
    },

    /**
     * Перезапуск Xray. API: POST /panel/api/server/restartXrayService
     * @returns {Promise<Object>}
     */
    async restartXrayService() {
      return this.api('POST', '/panel/api/server/restartXrayService')
    },

    /**
     * Последние N строк логов X-Ray. API: POST /panel/api/server/xraylogs/:count
     * @param {number} count - количество строк
     * @returns {Promise<{ obj?: string }>}
     */
    async getXrayLogs(count = 100) {
      const data = await this.api('POST', `/panel/api/server/xraylogs/${Number(count) || 100}`, { body: {} })
      return data?.obj ?? data ?? {}
    },

    /**
     * Импорт БД. API: POST /panel/api/server/importDB
     * @param {Object} [body] - тело по документации панели (часто {})
     * @returns {Promise<Object>}
     */
    async importDB(body = {}) {
      return this.api('POST', '/panel/api/server/importDB', { body })
    },

    /**
     * Получить новый ECH-сертификат. API: POST /panel/api/server/getNewEchCert
     * @param {Object} [body] - тело по документации (часто {})
     * @returns {Promise<Object>}
     */
    async getNewEchCert(body = {}) {
      return this.api('POST', '/panel/api/server/getNewEchCert', { body })
    },

    /**
     * Сброс трафика клиента по email. API: POST /panel/api/inbounds/:id/resetClientTraffic/:email
     * @param {string|number} inboundId
     * @param {string} email
     * @returns {Promise<Object>}
     */
    async resetClientTraffic(inboundId, email) {
      const enc = encodeURIComponent(normalizeEmail(email))
      return this.api('POST', `/panel/api/inbounds/${inboundId}/resetClientTraffic/${enc}`)
    },
  }
}

let defaultInstance = null

/**
 * Возвращает общий экземпляр клиента (singleton), созданный из process.env.
 * @param {{ baseUrl?: string, username?: string, password?: string, logger?: Object }} [overrides]
 * @returns {ReturnType<createXuiClient>}
 */
export function getXuiClient(overrides = {}) {
  if (!defaultInstance) {
    defaultInstance = createXuiClient(overrides)
  }
  return defaultInstance
}

export default createXuiClient
