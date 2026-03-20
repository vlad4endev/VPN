/**
 * VPN для Telegram-бота: ссылка на подписку (sub), при необходимости — клиент в 3x-ui.
 * Логика согласована с веб-приложением (tariff.subscriptionLink, settings.servers).
 */

import { randomUUID } from 'crypto'
import { createXuiClient, getXuiClient } from '../lib/xuiClient.js'
import { generateUniqueSubId } from '../lib/generateUniqueSubId.js'

function buildServerConnection(s) {
  if (!s || !s.serverIP || !s.serverPort) return null
  const protocol = (s.protocol || (s.serverPort === 443 || s.serverPort === 40919 ? 'https' : 'http'))
    .toLowerCase()
    .replace(/[:/]/g, '')
  const rp = (s.randompath || '').toString().trim()
  const pathSegment = rp && !rp.startsWith('/') ? `/${rp}` : rp
  const baseUrl = `${protocol === 'https' ? 'https' : 'http'}://${s.serverIP}:${s.serverPort}${pathSegment}`.replace(/\/+$/, '')
  return { ...s, protocol: protocol === 'https' ? 'https' : 'http', baseUrl }
}

function getServerByTariffId(tariffId, settings) {
  if (!tariffId) return null
  const servers = settings?.servers || []
  const s = servers.find((server) => (server.tariffIds || []).includes(tariffId))
  return s ? buildServerConnection(s) : null
}

function getServerByServerId(serverId, settings) {
  if (!serverId) return null
  const servers = settings?.servers || []
  const s = servers.find((server) => server.id === serverId)
  return s ? buildServerConnection(s) : null
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} appId
 */
async function loadSettings(db, appId) {
  try {
    const snap = await db.doc(`artifacts/${appId}/public/settings`).get()
    return snap.exists ? snap.data() : {}
  } catch {
    return {}
  }
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} appId
 * @param {string} tariffId
 */
async function loadTariff(db, appId, tariffId) {
  if (!tariffId) return null
  try {
    const snap = await db.doc(`artifacts/${appId}/public/data/tariffs/${tariffId}`).get()
    return snap.exists ? snap.data() : null
  } catch {
    return null
  }
}

/**
 * База URL подписки без завершающего слэша + subId в конце.
 */
export async function resolveSubscriptionBaseUrl(db, appId, user, settings, tariff) {
  const envBase = (process.env.VPN_SUBSCRIPTION_BASE_URL || '').toString().trim().replace(/\/+$/, '')
  if (envBase) return envBase

  if (tariff?.subscriptionLink && String(tariff.subscriptionLink).trim()) {
    return String(tariff.subscriptionLink).trim().replace(/\/+$/, '')
  }

  if (settings?.defaultSubscriptionLink && String(settings.defaultSubscriptionLink).trim()) {
    return String(settings.defaultSubscriptionLink).trim().replace(/\/+$/, '')
  }

  if (user?.subscriptionLink && String(user.subscriptionLink).trim()) {
    const u = String(user.subscriptionLink).trim()
    const idx = u.lastIndexOf('/')
    if (idx > 8) return u.slice(0, idx).replace(/\/+$/, '')
  }

  return 'https://subs.skypath.fun:3458/vk198'
}

function parseExpiresToMs(user) {
  const raw = user?.expiresAt
  if (raw == null) return 0
  if (typeof raw === 'number' && raw > 1e12) return Math.floor(raw)
  if (typeof raw === 'number' && raw > 1e9) return Math.floor(raw * 1000)
  const d = new Date(raw)
  const t = d.getTime()
  return Number.isFinite(t) && t > 0 ? t : 0
}

function defaultTotalGbForBot() {
  const v = process.env.TELEGRAM_BOT_DEFAULT_TOTAL_GB
  if (v === undefined || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Подобрать xui и inbound для пользователя (как в n8n-webhook-proxy getXuiAndInboundForRequest).
 */
async function getXuiAndInboundForUser(user, settings) {
  const tariffId = user?.tariffId ? String(user.tariffId).trim() : ''
  const serverId = user?.serverId ? String(user.serverId).trim() : ''
  let server = null
  if (tariffId) server = getServerByTariffId(tariffId, settings)
  if (!server && serverId) server = getServerByServerId(serverId, settings)
  if (server) {
    const xui = createXuiClient({
      baseUrl: server.baseUrl,
      username: server.xuiUsername ?? process.env.XUI_USERNAME,
      password: server.xuiPassword ?? process.env.XUI_PASSWORD,
    })
    const inboundId =
      server.xuiInboundId != null && server.xuiInboundId !== ''
        ? server.xuiInboundId
        : (process.env.XUI_INBOUND_ID ?? 1)
    return { xui, inboundId }
  }
  const xui = getXuiClient()
  if (!xui.configured) return { xui: null, inboundId: process.env.XUI_INBOUND_ID ?? 1 }
  return { xui, inboundId: process.env.XUI_INBOUND_ID ?? 1 }
}

/**
 * Обеспечить subId, uuid, ссылку подписки и по возможности клиента в 3x-ui.
 *
 * @param {{ db: import('firebase-admin/firestore').Firestore, appId: string, user: object }} params
 */
export async function ensureVpnAccessForUser({ db, appId, user }) {
  const userRef = db.doc(`artifacts/${appId}/public/data/users_v4/${user.id}`)
  let subId = user.subId && String(user.subId).trim() ? String(user.subId).trim() : ''
  let uuid = user.uuid && String(user.uuid).trim() ? String(user.uuid).trim() : ''
  const updates = {}
  let userUpdated = false

  if (!subId) {
    subId = await generateUniqueSubId(db, appId)
    updates.subId = subId
    userUpdated = true
  }
  if (!uuid) {
    uuid = randomUUID()
    updates.uuid = uuid
    userUpdated = true
  }
  if (userUpdated) {
    updates.updatedAt = new Date().toISOString()
    await userRef.update(updates)
    Object.assign(user, updates)
  }

  const settings = await loadSettings(db, appId)
  const tariff = await loadTariff(db, appId, user.tariffId)
  const baseUrl = await resolveSubscriptionBaseUrl(db, appId, user, settings, tariff)
  const subscriptionLink = `${baseUrl.replace(/\/+$/, '')}/${subId}`

  if (user.subscriptionLink !== subscriptionLink || user.vpnLink !== subscriptionLink) {
    try {
      await userRef.update({
        subscriptionLink,
        vpnLink: subscriptionLink,
        updatedAt: new Date().toISOString(),
      })
    } catch (_) {}
  }

  const { xui, inboundId } = await getXuiAndInboundForUser(user, settings)
  let xuiProvisioned = false
  let xuiError = null

  if (xui?.configured) {
    const email = (user.email || `${user.login || `tg_${user.tgId}`}@telegram.local`).toString().trim()
    const tgId = user.tgId != null ? String(user.tgId) : ''
    const expiryTime = parseExpiresToMs(user)
    const totalGB = defaultTotalGbForBot()

    try {
      const found = await xui.findClientByEmail(email)
      if (found?.client) {
        xuiProvisioned = true
        try {
          await xui.updateClient(found.inbound.id, found.client.id, {
            subId,
            tgId,
            expiryTime: expiryTime || found.client.expiryTime,
          })
        } catch (e) {
          console.warn('[telegramVpnService] updateClient:', e?.message)
        }
      } else {
        await xui.addClient(inboundId, {
          email,
          uuid,
          subId,
          tgId,
          totalGB,
          expiryTime,
          limitIp: user.limitIp != null ? Number(user.limitIp) : 1,
        })
        xuiProvisioned = true
      }
    } catch (err) {
      xuiError = err?.message || String(err)
      console.error('[telegramVpnService] xui:', xuiError)
    }
  }

  return {
    subscriptionLink,
    subId,
    uuid,
    xuiProvisioned,
    xuiError,
    userUpdated,
  }
}

/**
 * Статус VPN: срок, план, при наличии — трафик из панели.
 */
export async function getVpnStatusForUser({ db, appId, user }) {
  const settings = await loadSettings(db, appId)
  const { xui } = await getXuiAndInboundForUser(user, settings)
  const email = (user.email || `${user.login || `tg_${user.tgId}`}@telegram.local`).toString().trim()
  let traffic = null
  if (xui?.configured) {
    try {
      const found = await xui.findClientByEmail(email)
      if (found?.client?.id) {
        traffic = await xui.getClientTrafficsById(found.client.id)
      }
    } catch (_) {}
  }
  const expMs = parseExpiresToMs(user)
  const expStr = expMs ? new Date(expMs).toLocaleString('ru-RU') : 'без ограничения по дате'
  return {
    plan: (user.plan || 'free').toString(),
    tariffName: (user.tariffName || '').toString(),
    expiresAtLabel: expStr,
    hasExpiry: !!expMs,
    traffic,
    xuiConfigured: !!xui?.configured,
  }
}

export function formatVpnKeyMessage(result) {
  const link = escapeHtml(result.subscriptionLink)
  let body = `🔑 <b>Ваша ссылка на подписку VPN</b>\n\n<code>${link}</code>\n\n`
  body += 'Скопируйте ссылку и вставьте в приложение: <b>Happ</b>, <b>v2rayNG</b>, <b>Hiddify</b> или другое с поддержкой подписок.\n\n'
  if (result.xuiProvisioned) {
    body += '✅ Доступ на сервере активирован.\n'
  } else if (result.xuiError) {
    body += `⚠️ Не удалось синхронизировать панель: ${escapeHtml(result.xuiError.slice(0, 200))}\nСсылка всё равно может работать, если клиент уже создан.\n`
  } else {
    body += 'ℹ️ Панель 3x-ui не настроена на сервере — используйте ссылку, если подписка заведена вручную.\n'
  }
  return body
}

export function formatVpnStatusMessage(status) {
  const plan = escapeHtml(status.plan)
  const tariff = status.tariffName ? `\nТариф: ${escapeHtml(status.tariffName)}` : ''
  const tr = status.traffic
  let trafficLine = ''
  if (tr && (tr.up != null || tr.down != null)) {
    const up = Number(tr.up || 0)
    const down = Number(tr.down || 0)
    trafficLine = `\nТрафик ↑ ${formatBytes(up)} / ↓ ${formatBytes(down)}`
  }
  const panel = status.xuiConfigured ? 'подключена' : 'не настроена (env XUI_HOST / сервер в настройках)'
  return `📊 <b>Статус VPN</b>\n\nПлан: ${plan}${tariff}\nОкончание: ${escapeHtml(status.expiresAtLabel)}${trafficLine}\n\nПанель: ${panel}`
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
