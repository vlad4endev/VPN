import React, { useState, useEffect } from 'react'
import {
  isStandalone,
  isMobileDevice,
  isIOS,
  isInstallDismissed,
  isInEmbeddedWebView,
  setInstallDismissed,
  getDeferredInstallPrompt,
  clearDeferredInstallPrompt,
} from '../services/pwaService.js'
import { Smartphone, Share2, X } from 'lucide-react'

const SHOW_DELAY_MS = 4000

/**
 * Баннер с предложением установить PWA на домашний экран.
 * Показывается только на мобильных, в браузере (не в standalone), если не отклонили.
 */
export default function PwaInstallBanner() {
  const [visible, setVisible] = useState(false)
  const [installable, setInstallable] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (!isMobileDevice() || isStandalone() || isInstallDismissed() || isInEmbeddedWebView()) return

    const checkInstallable = () => {
      if (getDeferredInstallPrompt()) setInstallable(true)
    }

    window.addEventListener('pwa-install-available', checkInstallable)
    checkInstallable() // уже мог прийти до монтирования

    const t = setTimeout(() => {
      setVisible(true)
    }, SHOW_DELAY_MS)

    return () => {
      clearTimeout(t)
      window.removeEventListener('pwa-install-available', checkInstallable)
    }
  }, [])

  const handleDismiss = () => {
    setInstallDismissed()
    setVisible(false)
  }

  const handleInstall = async () => {
    const prompt = getDeferredInstallPrompt()
    if (!prompt) return
    setInstalling(true)
    try {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') {
        clearDeferredInstallPrompt()
        setVisible(false)
      }
    } catch {
      // пользователь отменил или ошибка
    } finally {
      setInstalling(false)
    }
  }

  if (!visible) return null

  const ios = isIOS()

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9998] safe-area-pb flex flex-col items-center p-3 sm:p-4 bg-slate-900/95 backdrop-blur border-t border-slate-700 shadow-lg"
      role="banner"
      aria-label="Установить приложение"
    >
      <div className="w-full max-w-md flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
          <Smartphone className="w-5 h-5 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-slate-200 font-medium text-sm">
            {ios ? 'Добавить SKYFLOW на экран' : 'Установить приложение'}
          </p>
          <p className="text-slate-400 text-xs mt-0.5">
            {ios
              ? 'Быстрый доступ без браузера'
              : 'Быстрый доступ и уведомления'}
          </p>
          <div className="flex items-center gap-2 mt-3">
            {ios ? (
              <p className="text-slate-500 text-xs flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5" />
                Поделиться → На экран «Домой»
              </p>
            ) : installable ? (
              <button
                type="button"
                onClick={handleInstall}
                disabled={installing}
                className="min-h-[36px] px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold text-sm rounded-xl transition-colors touch-manipulation"
              >
                {installing ? 'Установка…' : 'Установить'}
              </button>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-shrink-0 p-1.5 -m-1.5 rounded-lg text-slate-400 hover:text-slate-300 hover:bg-slate-800 transition-colors touch-manipulation"
          aria-label="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
