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
