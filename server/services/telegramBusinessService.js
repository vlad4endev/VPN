/**
 * Бизнес-логика Telegram-бота: команды, привязка, callback_query (processUserAction), web_app_data.
 * Вызывается из telegram.service после определения пользователя (userService).
 */

import {
  ensureVpnAccessForUser,
  formatVpnKeyMessage,
  getVpnStatusForUser,
  formatVpnStatusMessage,
} from './telegramVpnService.js'

/**
 * Обработать действие пользователя по callback_data (PROFILE, HELP, menu, open_panel и т.д.).
 * Вызывает answerCallbackQuery и editMessageText для ответа в чате.
 *
 * @param {{ user: { id: string, [key: string]: any } | null, action: string, source: string }} params
 * @param {Object} context — botToken, callbackQuery, answerCallbackQuery, editMessageText, buildMainKeyboard
 * @returns {Promise<void>}
 */
export async function processUserAction({ user, action, source }, context) {
  const {
    botToken,
    callbackQuery,
    answerCallbackQuery: answerCb,
    editMessageText: editText,
    buildMainKeyboard,
    sendTelegramMessage,
    db,
    APP_ID,
  } = context

  if (!callbackQuery?.id || !callbackQuery?.message) return
  const chatId = callbackQuery.message.chat?.id
  const messageId = callbackQuery.message?.message_id
  const callbackQueryId = callbackQuery.id

  await answerCb(botToken, callbackQueryId, { text: 'Ок' })

  const appUrl = context.getBaseUrlForTelegram ? context.getBaseUrlForTelegram() : null
  const keyboardPromise = buildMainKeyboard ? buildMainKeyboard(appUrl) : null
  const keyboard = keyboardPromise != null ? await Promise.resolve(keyboardPromise) : null

  const scenario = context.getScenario ? await context.getScenario() : null
  const responses = scenario?.callbackResponses || {}

  const actionName = (action || '').trim().toUpperCase()

  const defaultProfileText = () => {
    const name = (user?.name || user?.login || user?.email || 'Гость').toString()
    const plan = (user?.plan || 'free').toString()
    return `👤 <b>Мой профиль</b>\n\nИмя: ${escapeHtml(name)}\nПлан: ${escapeHtml(plan)}\n\nОткройте приложение для полного профиля.`
  }
  const defaultHelpText =
    '❓ <b>Помощь</b>\n\n• <b>Ключ VPN:</b> кнопка «🔑 Мой ключ VPN» или команды /key, /vpn.\n• Привязка веб-аккаунта: Личный кабинет → Профиль → Telegram → «Привязать».\n• Оплата и тарифы: кнопка «Открыть приложение».\n• Поддержка: раздел «Поддержка» в приложении.'
  const defaultMenuText =
    '🚀 <b>VPN</b>\n\n• <b>🔑 Мой ключ VPN</b> — ссылка на подписку для Happ / v2rayNG / Hiddify\n• <b>📊 Статус</b> — план и трафик\n• <b>Открыть приложение</b> — полный личный кабинет'

  switch (actionName) {
    case 'VPN_KEY': {
      if (!sendTelegramMessage || !db || !user?.id) break
      try {
        const result = await ensureVpnAccessForUser({ db, appId: APP_ID, user })
        const text = formatVpnKeyMessage(result)
        const custom = responses.VPN_KEY && String(responses.VPN_KEY).trim()
        await sendTelegramMessage(botToken, chatId, custom ? `${custom}\n\n${text}` : text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        })
      } catch (err) {
        console.error('❌ VPN_KEY callback:', err.message)
        await sendTelegramMessage(botToken, chatId, `Не удалось выдать ключ: ${err.message || 'ошибка'}`)
      }
      break
    }
    case 'VPN_STATUS': {
      if (!editText || !db || !user?.id) break
      try {
        const status = await getVpnStatusForUser({ db, appId: APP_ID, user })
        const text = (responses.VPN_STATUS && String(responses.VPN_STATUS).trim())
          ? `${String(responses.VPN_STATUS).trim()}\n\n${formatVpnStatusMessage(status)}`
          : formatVpnStatusMessage(status)
        await editText(botToken, chatId, messageId, text, { reply_markup: keyboard, parse_mode: 'HTML' })
      } catch (err) {
        console.error('❌ VPN_STATUS callback:', err.message)
        await sendTelegramMessage(botToken, chatId, `Не удалось загрузить статус: ${err.message || 'ошибка'}`)
      }
      break
    }
    case 'PROFILE': {
      const text = (responses.PROFILE && String(responses.PROFILE).trim()) ? responses.PROFILE.trim() : defaultProfileText()
      await editText(botToken, chatId, messageId, text, { reply_markup: keyboard })
      break
    }
    case 'HELP': {
      const text = (responses.HELP && String(responses.HELP).trim()) ? responses.HELP.trim() : defaultHelpText
      await editText(botToken, chatId, messageId, text, { reply_markup: keyboard })
      break
    }
    case 'OPEN_PANEL':
    case 'MENU':
    default: {
      const menuText = (responses.MENU && String(responses.MENU).trim()) ? responses.MENU.trim() : defaultMenuText
      await editText(botToken, chatId, messageId, menuText, { reply_markup: keyboard })
      break
    }
  }
}

function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Обработать обновление: callback_query (→ processUserAction), сообщения (/start, /menu, привязка по токену, web_app_data).
 *
 * @param {Object} update — update от Telegram (message?, callback_query?, edited_message?)
 * @param {{ id: string, [key: string]: any } | null} user — пользователь из userService.findOrCreateByTelegramId (может быть null для callback до создания)
 * @param {Object} context — контекст: botToken, db, APP_ID, sendTelegramMessage, sendMainMenu, handleMiniAppData, answerCallbackQuery, editMessageText, buildMainKeyboard, getBaseUrlForTelegram?
 */
export async function handleUpdate(update, user, context) {
  const {
    botToken,
    db,
    APP_ID,
    sendTelegramMessage,
    sendMainMenu,
    handleMiniAppData,
  } = context

  if (update.callback_query) {
    await processUserAction(
      { user, action: update.callback_query.data || '', source: 'telegram' },
      { ...context, callbackQuery: update.callback_query }
    )
    return
  }

  const message = update.message || update.edited_message
  if (!message || !message.from) return

  const chatId = message.chat?.id
  const text = (message.text || '').trim()

  if (message.web_app_data) {
    await handleMiniAppData(botToken, message)
    return
  }

  if (text.startsWith('/start ')) {
    const token = text.slice(7).trim()
    if (!token) return
    try {
      const bindRef = db.doc(`artifacts/${APP_ID}/public/data/telegram_binds/${token}`)
      const snap = await bindRef.get()
      if (!snap.exists) {
        await sendTelegramMessage(botToken, chatId, 'Ссылка привязки недействительна или истекла. Получите новую в личном кабинете.')
        return
      }
      const { userId, expiresAt } = snap.data()
      if (expiresAt && Date.now() > expiresAt) {
        await bindRef.delete()
        await sendTelegramMessage(botToken, chatId, 'Ссылка привязки истекла. Получите новую в личном кабинете.')
        return
      }
      const telegramId = String(message.from.id)
      const userRef = db.doc(`artifacts/${APP_ID}/public/data/users_v4/${userId}`)
      await userRef.update({ tgId: telegramId, updatedAt: new Date().toISOString() })
      await bindRef.delete()
      await sendTelegramMessage(botToken, chatId, '✅ Аккаунт успешно привязан к Telegram. Вы будете получать уведомления об оплате и напоминания о продлении подписки.')
      console.log('✅ Telegram: пользователь привязан', { userId, tgId: telegramId })
    } catch (err) {
      console.error('❌ Telegram webhook bind:', err.message)
      await sendTelegramMessage(botToken, chatId, 'Ошибка привязки. Попробуйте позже или обратитесь в поддержку.')
    }
    return
  }

  if (text === '/start') {
    await sendMainMenu(botToken, chatId)
    const scenario = context.getScenario ? await context.getScenario() : null
    const welcomeMessage =
      (scenario?.welcomeMessage && String(scenario.welcomeMessage).trim()) ||
      'Добро пожаловать! Нажмите «🔑 Мой ключ VPN», чтобы получить ссылку подписки для Happ, v2rayNG или Hiddify. Полный кабинет — кнопка «Открыть приложение». Привязка веб-аккаунта: Профиль → Telegram в приложении.'
    await sendTelegramMessage(botToken, chatId, welcomeMessage)
    return
  }

  if (text === '/menu') {
    await sendMainMenu(botToken, chatId)
    return
  }

  const keyCommands = ['/key', '/vpn', '/subscription']
  if (keyCommands.includes(text.toLowerCase())) {
    if (!user?.id) {
      await sendTelegramMessage(botToken, chatId, 'Нажмите /start для регистрации.')
      return
    }
    try {
      const result = await ensureVpnAccessForUser({ db, appId: APP_ID, user })
      await sendTelegramMessage(botToken, chatId, formatVpnKeyMessage(result), {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      })
    } catch (err) {
      console.error('❌ /key:', err.message)
      await sendTelegramMessage(botToken, chatId, `Ошибка: ${err.message || 'попробуйте позже'}`)
    }
    return
  }

  if (text === '/status' || text === '/vpn_status') {
    if (!user?.id) {
      await sendTelegramMessage(botToken, chatId, 'Нажмите /start для регистрации.')
      return
    }
    try {
      const status = await getVpnStatusForUser({ db, appId: APP_ID, user })
      await sendTelegramMessage(botToken, chatId, formatVpnStatusMessage(status), { parse_mode: 'HTML' })
    } catch (err) {
      await sendTelegramMessage(botToken, chatId, `Ошибка: ${err.message || 'попробуйте позже'}`)
    }
    return
  }
}
