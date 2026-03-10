/**
 * PWA: регистрация Service Worker и обработка обновлений.
 * SW регистрируется сразу при загрузке приложения для кэширования и офлайн-режима.
 */

const SW_URL = '/sw.js'
const SW_SCOPE = '/'

/**
 * Регистрирует Service Worker для кэширования и офлайн.
 * Вызывается при старте приложения.
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null
  }
  try {
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE })
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing
      if (!newWorker) return
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          onUpdateAvailable(reg)
        }
      })
    })
    return reg
  } catch (err) {
    console.warn('[PWA] Регистрация SW:', err.message)
    return null
  }
}

let onUpdateAvailableCallback = null

/**
 * Устанавливает callback при наличии новой версии PWA.
 * @param {(reg: ServiceWorkerRegistration) => void} callback
 */
export function setOnUpdateAvailable(callback) {
  onUpdateAvailableCallback = callback
}

function onUpdateAvailable(reg) {
  if (typeof onUpdateAvailableCallback === 'function') {
    onUpdateAvailableCallback(reg)
  }
}

/**
 * Применить обновление: активирует новый SW и перезагружает страницу.
 * @param {ServiceWorkerRegistration} reg
 */
export async function applyUpdate(reg) {
  if (!reg || !reg.waiting) return
  reg.waiting.postMessage({ type: 'SKIP_WAITING' })
}

// --- Install Prompt ---

const PWA_INSTALL_DISMISSED = 'pwa_install_dismissed'
const PWA_INSTALL_DISMISS_DAYS = 14

export function isInstallDismissed() {
  try {
    const v = localStorage.getItem(PWA_INSTALL_DISMISSED)
    if (!v) return false
    const t = parseInt(v, 10)
    if (isNaN(t)) return false
    return Date.now() - t < PWA_INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

export function setInstallDismissed() {
  try {
    localStorage.setItem(PWA_INSTALL_DISMISSED, String(Date.now()))
  } catch {}
}

export function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  )
}

export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0 && window.innerWidth < 1024)
  )
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isInEmbeddedWebView() {
  if (typeof window === 'undefined') return false
  return !!(window.Telegram?.WebApp || window.__TELEGRAM_WEBVIEW__)
}

let deferredInstallPrompt = null

export function getDeferredInstallPrompt() {
  return deferredInstallPrompt
}

export function clearDeferredInstallPrompt() {
  deferredInstallPrompt = null
}

/**
 * Настраивает слушатель beforeinstallprompt. Вызвать при старте приложения.
 */
export function setupInstallPrompt() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredInstallPrompt = e
    window.dispatchEvent(new CustomEvent('pwa-install-available', { detail: e }))
  })
}
