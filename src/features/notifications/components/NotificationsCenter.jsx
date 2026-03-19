import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Bell, ChevronDown, X, Sparkles, CreditCard, Megaphone, MessageCircle, ExternalLink } from 'lucide-react'
import { useNotifications } from '../hooks/useNotifications.js'
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS } from '../constants.js'
import { formatDate } from '../../../shared/utils/formatDate.js'

const DROPDOWN_WIDTH = 380
const GAP = 8
const PADDING = 16

const ICON_BY_TYPE = {
  [NOTIFICATION_TYPES.admin_broadcast]: Megaphone,
  [NOTIFICATION_TYPES.subscription]: CreditCard,
  [NOTIFICATION_TYPES.subscription_reminder]: CreditCard,
  [NOTIFICATION_TYPES.feature]: Sparkles,
  [NOTIFICATION_TYPES.interaction]: MessageCircle,
}

/**
 * Центр уведомлений: иконка с бейджем, выпадающий список, детальный просмотр с обзором для типа «новая функция».
 */
export default function NotificationsCenter({ userId, className = '' }) {
  const [open, setOpen] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [dropdownPosition, setDropdownPosition] = useState(null)
  const buttonRef = useRef(null)
  const dropdownRef = useRef(null)
  const { list, unreadCount, loading, markAsRead } = useNotifications(userId)

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const place = () => {
      const rect = buttonRef.current.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      let left = rect.left
      if (left + DROPDOWN_WIDTH + PADDING > vw) left = vw - DROPDOWN_WIDTH - PADDING
      if (left < PADDING) left = PADDING
      let top = rect.bottom + GAP
      const maxH = vh - PADDING - top
      if (maxH < 200 && rect.top > 120) {
        top = rect.top - 320
        if (top < PADDING) top = PADDING
      }
      setDropdownPosition({ top, left })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(document.documentElement)
    window.addEventListener('scroll', place, true)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setDropdownPosition(null)
      return
    }
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [open])

  const detail = detailId ? list.find((n) => n.id === detailId) : null
  const hasOverview = detail?.type === NOTIFICATION_TYPES.feature && detail?.overview

  const handleItemClick = (n) => {
    if (!n.read) markAsRead(n.id)
    setDetailId(n.id)
  }

  const closeDetail = () => setDetailId(null)

  if (!userId) return null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative p-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors ${className}`}
        aria-label="Уведомления"
        aria-expanded={open}
      >
        <Bell size={20} className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open &&
        dropdownPosition != null &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed w-[min(380px,calc(100vw-2rem))] bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-[9999] overflow-hidden flex flex-col max-h-[min(420px,calc(100vh-2rem))]"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
            }}
          >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <h3 className="font-semibold text-white">Уведомления</h3>
            {detailId ? (
              <button
                type="button"
                onClick={closeDetail}
                className="p-1 rounded text-slate-400 hover:text-white"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            ) : null}
          </div>

          {detail ? (
            <div className="p-4 overflow-y-auto flex-1">
              <div className="flex items-start gap-2 mb-3">
                {(() => {
                  const Icon = ICON_BY_TYPE[detail.type] || Bell
                  return <Icon size={20} className="text-sky-400 flex-shrink-0 mt-0.5" />
                })()}
                <div>
                  <span className="text-xs text-slate-500">
                    {NOTIFICATION_TYPE_LABELS[detail.type] || detail.type}
                  </span>
                  <h4 className="font-medium text-white mt-0.5">{detail.title}</h4>
                  <p className="text-slate-300 text-sm mt-1">{detail.body}</p>
                  {detail.createdAt && (
                    <p className="text-slate-500 text-xs mt-2">
                      {formatDate(detail.createdAt)}
                    </p>
                  )}
                </div>
              </div>
              {hasOverview && (
                <div className="mt-3 pt-3 border-t border-slate-700">
                  <p className="text-xs font-medium text-slate-400 mb-1">Обзор</p>
                  <div className="text-slate-300 text-sm whitespace-pre-line break-words">
                    {String(detail.overview || '')}
                  </div>
                </div>
              )}
              {detail.data?.buttons && Array.isArray(detail.data.buttons) && detail.data.buttons.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-700 flex flex-wrap gap-2">
                  {detail.data.buttons.map((btn, i) => (
                    btn.url ? (
                      <a
                        key={i}
                        href={btn.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium"
                      >
                        {btn.label || 'Ссылка'}
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <span key={i} className="inline-flex items-center px-3 py-2 rounded-lg bg-slate-700 text-slate-300 text-sm">
                        {btn.label || ''}
                      </span>
                    )
                  ))}
                </div>
              )}
            </div>
          ) : (
            <ul className="overflow-y-auto flex-1 divide-y divide-slate-700">
              {loading && list.length === 0 ? (
                <li className="px-4 py-6 text-center text-slate-500 text-sm">
                  Загрузка…
                </li>
              ) : list.length === 0 ? (
                <li className="px-4 py-6 text-center text-slate-500 text-sm">
                  Нет уведомлений
                </li>
              ) : (
                list.map((n) => {
                  const Icon = ICON_BY_TYPE[n.type] || Bell
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleItemClick(n)}
                        className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-slate-700/50 transition-colors ${!n.read ? 'bg-sky-500/5' : ''}`}
                      >
                        <Icon
                          size={18}
                          className={`flex-shrink-0 mt-0.5 ${!n.read ? 'text-sky-400' : 'text-slate-500'}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm truncate ${n.read ? 'text-slate-400' : 'text-white font-medium'}`}
                          >
                            {n.title}
                          </p>
                          <p className="text-xs text-slate-500 truncate">{n.body}</p>
                          {n.createdAt && (
                            <p className="text-xs text-slate-600 mt-0.5">
                              {formatDate(n.createdAt)}
                            </p>
                          )}
                        </div>
                        {n.type === NOTIFICATION_TYPES.feature && n.overview && (
                          <ChevronDown
                            size={16}
                            className="flex-shrink-0 text-slate-500 rotate-[-90deg]"
                          />
                        )}
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
