/**
 * Контроллер эндпоинтов аналитики. Все маршруты требуют админ-права.
 */

import * as analyticsService from './analytics.service.js'
import { getPaymentAndTicketHistory } from './metrics.service.js'

/**
 * Загрузить глобальный контекст для ИИ: тарифы (условия, цены, описания) и серверы без чувствительных данных (без IP/портов/логинов).
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} appId
 * @returns {Promise<{ tariffsText: string, serversText: string }>}
 */
async function loadGlobalContextForAi(db, appId) {
  if (!db || !appId) return { tariffsText: '—', serversText: '—' }
  try {
    const [tariffsSnap, settingsSnap] = await Promise.all([
      db.collection(`artifacts/${appId}/public/data/tariffs`).limit(100).get(),
      db.doc(`artifacts/${appId}/public/settings`).get(),
    ])
    const tariffs = tariffsSnap.docs.map((d) => {
      const x = d.data() || {}
      return {
        id: d.id,
        name: x.name ?? d.id,
        plan: x.plan ?? '-',
        price: x.price ?? '-',
        durationDays: x.durationDays ?? '-',
        trafficGB: x.trafficGB ?? '-',
        devices: x.devices ?? '-',
        active: x.active !== false,
        description: (x.description || '').toString().trim().slice(0, 300) || null,
      }
    })
    const tariffsText =
      tariffs.length === 0
        ? 'Нет тарифов.'
        : tariffs
            .map(
              (t) =>
                `- ${t.name} (план: ${t.plan}): цена ${t.price}, срок ${t.durationDays} дн., трафик ${t.trafficGB} ГБ, устройств ${t.devices}, активен: ${t.active}${t.description ? `; описание: ${t.description}` : ''}`
            )
            .join('\n')

    const servers = (settingsSnap.exists && settingsSnap.data()?.servers) || []
    const safeServers = servers.map((s, i) => ({
      index: i + 1,
      name: (s.serverName || s.name || `Сервер ${i + 1}`).toString().trim(),
      location: (s.location || s.serverLocation || '-').toString().trim(),
      active: s.active !== false,
    }))
    const serversText =
      safeServers.length === 0
        ? 'Нет серверов в настройках.'
        : safeServers.map((s) => `- ${s.name}: регион ${s.location}, активен: ${s.active}`).join('\n')

    return { tariffsText, serversText }
  } catch (err) {
    console.warn('loadGlobalContextForAi:', err.message)
    return { tariffsText: '—', serversText: '—' }
  }
}

/**
 * Загрузить сводку метрик и последние события для отчётности (по требованию админа).
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} appId
 * @param {(key: string) => Promise<string|null>} redisGet
 * @param {(key: string, value: string, ttl?: number) => Promise<void>} redisSet
 * @returns {Promise<string>}
 */
async function loadMetricsSummaryForAi(db, appId, redisGet, redisSet) {
  if (!db || !appId) return '—'
  try {
    const [funnel, eventsSnap] = await Promise.all([
      analyticsService.getFunnel(db, appId, redisGet, redisSet),
      db.collection(`artifacts/${appId}/public/data/n8n_events`).orderBy('createdAt', 'desc').limit(30).get(),
    ])
    const lines = []
    if (funnel) {
      lines.push(
        `Воронка: всего пользователей в метриках ${funnel.totalUsers ?? 0}; сегменты: ${JSON.stringify(funnel.segments || {})}; прогноз оттока: ${funnel.churnForecast?.estimatedChurnRate ?? 0}%, пользователей в зоне риска: ${funnel.churnForecast?.atRiskUsers ?? 0}; средний churn score: ${funnel.avgChurnScore ?? '-'}.`
      )
    }
    if (eventsSnap && !eventsSnap.empty) {
      const events = eventsSnap.docs.slice(0, 15).map((d) => {
        const e = d.data() || {}
        return { type: e.eventType || e.type || '-', level: e.level || '-', message: (e.message || '').toString().slice(0, 120), createdAt: e.createdAt || '-' }
      })
      lines.push('Последние события (логи): ' + JSON.stringify(events))
    }
    return lines.length ? lines.join('\n') : 'Нет данных.'
  } catch (err) {
    console.warn('loadMetricsSummaryForAi:', err.message)
    return '—'
  }
}

/** Вспомогательный вызов ИИ-стратегии (использует deps, переданные в req). */
async function runAiStrategy(req, res) {
  const db = req.db
  const appId = req.APP_ID || process.env.APP_ID || 'skyputh'
  const getActiveAiConfig = req.getActiveAiConfig
  const unifiedChat = req.unifiedChat
  const getTelegramToken = req.getTelegramToken
  const sendTelegramMessage = req.sendTelegramMessage
  const redisGet = req.redisGet || (() => Promise.resolve(null))
  const redisSet = req.redisSet || (() => Promise.resolve())

  if (!getActiveAiConfig || !unifiedChat) {
    return res.status(503).json({ success: false, error: 'ИИ не подключён к роутеру аналитики' })
  }
  const config = await getActiveAiConfig()
  if (!config?.apiKey) {
    return res.status(503).json({ success: false, error: 'ИИ не настроен: задайте API-ключ в разделе «Интеграции → ИИ»' })
  }
  const userId = (req.body?.userId ?? '').toString().trim()
  const sendToTelegram = req.body?.sendToTelegram === true
  const includeMetricsSummary = req.body?.includeMetricsSummary === true
  if (!userId) return res.status(400).json({ success: false, error: 'Укажите userId' })
  if (!db) return res.status(503).json({ success: false, error: 'Сервис недоступен' })

  try {
    const [userSnap, analytics, globalContext] = await Promise.all([
      db.doc(`artifacts/${appId}/public/data/users_v4/${userId}`).get(),
      analyticsService.getUserAnalytics(db, appId, userId, redisGet, redisSet, { forceRefresh: false }),
      loadGlobalContextForAi(db, appId),
    ])
    const userProfile = userSnap.exists ? userSnap.data() : null

    const profileText = userProfile
      ? `Имя: ${userProfile.name ?? '-'}, Email: ${userProfile.email ?? '-'}, План: ${userProfile.plan ?? '-'}, Тариф: ${userProfile.tariffName ?? userProfile.tariffId ?? '-'}, Окончание подписки: ${userProfile.expiresAt ?? 'нет'}, Обращений в поддержку: ${analytics?.metrics?.supportTicketsCount ?? 0}, LTV: ${analytics?.lifetimeValue ?? 0}`
      : 'Данные пользователя не найдены.'
    const analyticsText = analytics
      ? `Сегмент: ${analytics.segment}, Churn score: ${analytics.churnScore}, Приоритет: ${analytics.priorityScore}, Рекомендация системы: ${analytics.recommendedAction}, Тип оффера: ${analytics.offerType}, Тон: ${analytics.messageTone}`
      : 'Аналитика по пользователю не найдена (обновите метрики).'

    let globalBlock = `\n\nГлобальный контекст сервиса (тарифы и серверы — только для анализа, без чувствительных данных):\nТарифы:\n${globalContext.tariffsText}\n\nСерверы (название и регион, без IP/портов):\n${globalContext.serversText}`
    if (includeMetricsSummary) {
      const metricsSummary = await loadMetricsSummaryForAi(db, appId, redisGet, redisSet)
      globalBlock += `\n\nСводка метрик и логов для отчётности:\n${metricsSummary}`
    }

    const systemPrompt = `Ты — эксперт по удержанию клиентов VPN-сервиса. На основе данных о клиенте, воронки аналитики и глобального контекста (тарифы, серверы) сформулируй рекомендации для админа: что делать, чтобы вернуть клиента. Учитывай условия и цены тарифов при предложении офферов. Результат — шаги действий для админа, а не готовое сообщение клиенту.
Ответь строго в формате JSON, без markdown и без лишнего текста:
{"strategy":"краткое обоснование (1-2 предложения), почему клиент в зоне риска и общая стратегия","steps":["шаг 1 для админа","шаг 2","шаг 3"],"offerType":"тип оффера: скидка / персональное предложение / напоминание / win-back","suggestedOfferMessage":"короткий текст предложения для уведомления клиенту (до 300 символов, на русском), чтобы мотивировать вернуться — можно использовать в рассылке"}`

    const userMessage = `Данные клиента (userId: ${userId}):\n${profileText}\n\nАналитика воронки:\n${analyticsText}${globalBlock}\n\nПроанализируй и дай шаги действий для админа и вариант текста предложения для клиента.`

    // Таймаут 50 с — чтобы успеть ответить до типичного proxy (60 с) и вернуть JSON, а не 502 от прокси
    const chatConfig = {
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      temperature: 0.5,
      max_tokens: 1024,
      timeout: config?.timeout ?? 50,
    }
    const result = await unifiedChat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      chatConfig
    )

    if (!result.ok) {
      const isTimeout = result.code === 'TIMEOUT' || (result.error && /timeout|ETIMEDOUT|ECONNABORTED/i.test(result.error))
      const status = isTimeout ? 504 : 502
      return res.status(status).json({
        success: false,
        error: isTimeout ? 'ИИ не успел ответить. Попробуйте ещё раз.' : (result.error || 'Ошибка ИИ'),
        code: result.code,
      })
    }

    const content = result && typeof result.content === 'string' ? result.content : ''
    if (!content) {
      return res.status(502).json({ success: false, error: 'ИИ не вернул текст ответа' })
    }

    let strategy = ''
    let offerType = ''
    let steps = []
    let suggestedOfferMessage = ''
    try {
      const raw = content.replace(/```json?\s*|\s*```/g, '').trim()
      const parsed = JSON.parse(raw)
      strategy = (parsed.strategy && String(parsed.strategy).trim()) || ''
      offerType = (parsed.offerType && String(parsed.offerType).trim()) || ''
      steps = Array.isArray(parsed.steps) ? parsed.steps.map((s) => String(s).trim()).filter(Boolean) : []
      suggestedOfferMessage = (parsed.suggestedOfferMessage && String(parsed.suggestedOfferMessage).trim()) || (parsed.message && String(parsed.message).trim()) || ''
    } catch (parseErr) {
      return res.status(502).json({ success: false, error: 'ИИ вернул невалидный JSON', raw: content })
    }

    if (sendToTelegram && suggestedOfferMessage && getTelegramToken && sendTelegramMessage) {
      const telegramId = analytics?.metrics?.telegramId || userProfile?.tgId || userProfile?.telegramId
      if (telegramId) {
        const token = await getTelegramToken()
        if (token) {
          await sendTelegramMessage(token, String(telegramId), suggestedOfferMessage).catch((err) => {
            console.warn('ai-strategy sendToTelegram:', err.message)
          })
        }
      }
    }

    return res.json({
      success: true,
      strategy,
      offerType,
      steps,
      suggestedOfferMessage,
      sentToTelegram: sendToTelegram && !!suggestedOfferMessage && !!(analytics?.metrics?.telegramId || userProfile?.tgId || userProfile?.telegramId),
    })
  } catch (err) {
    console.error('POST /api/analytics/ai-strategy:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
}

/**
 * GET /api/analytics/funnel
 * Возвращает: количество по сегментам, топ 20 по priorityScore, средний churnScore, прогноз оттока.
 */
export async function getFunnel(req, res) {
  const db = req.db
  const appId = req.APP_ID || process.env.APP_ID || 'skyputh'
  const redisGet = req.redisGet || (() => Promise.resolve(null))
  const redisSet = req.redisSet || (() => Promise.resolve())

  if (!db) {
    return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  }
  try {
    const funnel = await analyticsService.getFunnel(db, appId, redisGet, redisSet)
    res.json({ success: true, ...funnel })
  } catch (err) {
    console.error('GET /api/analytics/funnel:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}

/**
 * GET /api/analytics/user/:id
 * Возвращает: сегмент, churnScore, LTV, рекомендованную стратегию возврата.
 */
export async function getUser(req, res) {
  const db = req.db
  const appId = req.APP_ID || process.env.APP_ID || 'skyputh'
  const { id: userId } = req.params
  const forceRefresh = (req.query.refresh || '').toString().toLowerCase() === 'true'
  const redisGet = req.redisGet || (() => Promise.resolve(null))
  const redisSet = req.redisSet || (() => Promise.resolve())

  if (!db || !userId) {
    return res.status(400).json({ success: false, error: 'userId обязателен' })
  }
  try {
    const data = await analyticsService.getUserAnalytics(db, appId, userId, redisGet, redisSet, { forceRefresh })
    if (!data) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден' })
    }
    res.json({ success: true, ...data })
  } catch (err) {
    console.error('GET /api/analytics/user/:id:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}

/**
 * POST /api/analytics/refresh-metrics
 * Принудительное обновление метрик по всем пользователям (или limit).
 */
export async function refreshMetrics(req, res) {
  const db = req.db
  const appId = req.APP_ID || process.env.APP_ID || 'skyputh'
  const limit = Math.min(5000, Math.max(0, parseInt(req.body?.limit || '2000', 10) || 2000))

  if (!db) {
    return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  }
  try {
    const count = await analyticsService.refreshMetrics(db, appId, { limit })
    res.json({ success: true, processed: count })
  } catch (err) {
    console.error('POST /api/analytics/refresh-metrics:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}

/**
 * POST /api/analytics/send-churn-offer/:userId
 * Отправить персональный оффер в Telegram пользователю (если churnScore > 80 и есть telegramId).
 * Опциональная интеграция с Telegram.
 */
export async function sendChurnOffer(req, res) {
  const db = req.db
  const appId = req.APP_ID || process.env.APP_ID || 'skyputh'
  const { id: userId } = req.params
  const getTelegramToken = req.getTelegramToken
  const sendTelegramMessage = req.sendTelegramMessage

  if (!db || !userId) {
    return res.status(400).json({ success: false, error: 'userId обязателен' })
  }
  if (!getTelegramToken || !sendTelegramMessage) {
    return res.status(501).json({ success: false, error: 'Telegram не настроен' })
  }
  try {
    const data = await analyticsService.getUserAnalytics(
      db,
      appId,
      userId,
      req.redisGet || (() => Promise.resolve(null)),
      req.redisSet || (() => Promise.resolve()),
      { forceRefresh: true }
    )
    if (!data) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден' })
    }
    const telegramId = data.metrics?.telegramId ?? data.telegramId
    if (data.churnScore <= 80) {
      return res.status(400).json({
        success: false,
        error: 'Оффер отправляется только при churnScore > 80',
        churnScore: data.churnScore,
      })
    }
    if (!telegramId) {
      return res.status(400).json({ success: false, error: 'У пользователя нет Telegram ID' })
    }
    const strategy = {
      offerType: data.offerType,
      messageTone: data.messageTone,
      segment: data.segment,
    }
    const text = analyticsService.buildChurnOfferMessage(strategy)
    const token = await getTelegramToken()
    if (!token) {
      return res.status(503).json({ success: false, error: 'Telegram бот не настроен' })
    }
    const getBaseUrl = req.getBaseUrlForTelegram || (() => (process.env.PUBLIC_URL || process.env.FRONTEND_URL || '').toString().trim().replace(/\/+$/, '') || null)
    const baseUrl = typeof getBaseUrl === 'function' ? getBaseUrl() : null
    const subscriptionUrl = baseUrl ? `${baseUrl}/#dashboard` : null
    const options = {}
    if (subscriptionUrl) {
      options.reply_markup = {
        inline_keyboard: [[{ text: 'Воспользоваться предложением', url: subscriptionUrl }]],
      }
    }
    await sendTelegramMessage(token, String(telegramId), text, options)
    res.json({ success: true, sent: true, message: 'Оффер отправлен в Telegram' })
  } catch (err) {
    console.error('POST /api/analytics/send-churn-offer:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}

/**
 * POST /api/analytics/ai-funnel-analysis
 * Загружает воронку, для каждого пользователя без подписки — историю платежей и тикетов, отправляет в ИИ.
 * ИИ возвращает индекс сложности (1–5), сегмент, приоритет и краткую причину. Таблица строится по этому анализу.
 */
export async function aiFunnelAnalysis(req, res) {
  const db = req.db
  const appId = req.APP_ID || process.env.APP_ID || 'skyputh'
  const getActiveAiConfig = req.getActiveAiConfig
  const unifiedChat = req.unifiedChat
  const redisGet = req.redisGet || (() => Promise.resolve(null))
  const redisSet = req.redisSet || (() => Promise.resolve())

  if (!getActiveAiConfig || !unifiedChat) {
    return res.status(503).json({ success: false, error: 'ИИ не подключён' })
  }
  const config = await getActiveAiConfig()
  if (!config?.apiKey) {
    return res.status(503).json({ success: false, error: 'ИИ не настроен: задайте API-ключ в разделе «Интеграции → ИИ»' })
  }
  if (!db) return res.status(503).json({ success: false, error: 'Сервис недоступен' })

  const limit = Math.min(35, Math.max(1, parseInt(req.body?.limit || '30', 10) || 30))

  try {
    const funnel = await analyticsService.getFunnel(db, appId, redisGet, redisSet)
    const baseRows = (funnel?.noSubscriptionOrExpired || []).slice(0, limit)
    if (baseRows.length === 0) {
      return res.json({
        success: true,
        rows: [],
        segments: funnel?.segments || {},
        totalUsers: funnel?.totalUsers ?? 0,
        churnForecast: funnel?.churnForecast || {},
        avgChurnScore: funnel?.avgChurnScore ?? 0,
        message: 'Нет пользователей без подписки или с давно истёкшей подпиской',
      })
    }

    const histories = await Promise.all(
      baseRows.map((row) => getPaymentAndTicketHistory(db, appId, row.userId, { paymentsLimit: 5, ticketsLimit: 5 }))
    )
    const summaries = baseRows.map((row, i) => {
      const h = histories[i] || { lastPayments: [], lastTickets: [] }
      return {
        userId: row.userId,
        name: (row.name || '').slice(0, 50) || '—',
        subscriptionExpiresAt: row.subscriptionExpiresAt || null,
        lastActiveAt: row.lastActiveAt || null,
        totalPayments: row.totalPayments ?? 0,
        lifetimeValue: row.lifetimeValue ?? 0,
        segment: row.segment,
        churnScore: row.churnScore,
        priorityScore: row.priorityScore,
        supportTicketsCount: row.supportTicketsCount ?? 0,
        problemTicketsCount: row.problemTicketsCount ?? 0,
        problemTicketSubjects: Array.isArray(row.problemTicketSubjects) ? row.problemTicketSubjects.slice(0, 3) : [],
        lastPayments: h.lastPayments,
        lastTickets: h.lastTickets,
      }
    })

    const globalContext = await loadGlobalContextForAi(db, appId)
    const systemPrompt = `Ты — аналитик удержания клиентов VPN-сервиса. Получаешь данные по пользователям: подписка, активность, оплаты, тикеты поддержки.
Задача: для каждого пользователя вернуть оценку сложности возврата и краткую причину.
Ответь строго в формате JSON — один массив объектов, без markdown и без текста до/после:
[{"userId":"...","complexityIndex":1,"segment":"new|active|risk|churning|lost","priorityScore":0-100,"shortReason":"одна короткая фраза на русском"}]
Правила:
- complexityIndex: 1 = легко вернуть, 5 = очень сложно вернуть (учитывай историю оплат, тикетов, давность неактивности).
- segment оставь из данных или скорректируй по смыслу.
- priorityScore: приоритет работы с клиентом 0–100 (выше = важнее вернуть первым).
- shortReason: одна фраза, почему такой индекс (например: "Не платил полгода, были жалобы в поддержку").`

    const userMessage = `Тарифы и серверы (контекст):\nТарифы:\n${globalContext.tariffsText}\n\nСерверы:\n${globalContext.serversText}\n\nДанные пользователей для анализа (${summaries.length}):\n${JSON.stringify(summaries, null, 0)}\n\nВерни массив из ${summaries.length} объектов с полями userId, complexityIndex, segment, priorityScore, shortReason.`

    const chatConfig = {
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      temperature: 0.3,
      max_tokens: 4096,
      timeout: config?.timeout ?? 90,
    }
    const result = await unifiedChat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      chatConfig
    )

    if (!result.ok) {
      const isTimeout = result.code === 'TIMEOUT' || (result.error && /timeout|ETIMEDOUT|ECONNABORTED/i.test(result.error))
      const status = isTimeout ? 504 : 502
      return res.status(status).json({
        success: false,
        error: isTimeout ? 'ИИ не успел ответить. Попробуйте ещё раз.' : (result.error || 'Ошибка ИИ'),
        code: result.code,
      })
    }

    const content = result?.content && typeof result.content === 'string' ? result.content : ''
    let aiList = []
    if (content) {
      try {
        const raw = content.replace(/```json?\s*|\s*```/g, '').trim()
        aiList = JSON.parse(raw)
        if (!Array.isArray(aiList)) aiList = []
      } catch (_) {
        console.warn('ai-funnel-analysis: не удалось распарсить JSON ответ ИИ')
      }
    }

    const aiByUserId = new Map()
    aiList.forEach((item) => {
      const id = (item.userId || item.user_id || '').toString().trim()
      if (id) aiByUserId.set(id, item)
    })

    const rows = baseRows
      .map((row) => {
        const ai = aiByUserId.get(row.userId) || {}
        const complexityIndex = Math.min(5, Math.max(1, parseInt(ai.complexityIndex || ai.complexity_index || 3, 10) || 3))
        return {
          ...row,
          complexityIndex,
          aiSegment: ai.segment || row.segment,
          aiPriorityScore: typeof ai.priorityScore === 'number' ? ai.priorityScore : (ai.priority_score != null ? Number(ai.priority_score) : row.priorityScore),
          shortReason: (ai.shortReason || ai.short_reason || '').toString().trim().slice(0, 200) || null,
        }
      })
      .sort((a, b) => (b.complexityIndex !== a.complexityIndex ? b.complexityIndex - a.complexityIndex : (b.aiPriorityScore || 0) - (a.aiPriorityScore || 0)))

    return res.json({
      success: true,
      rows,
      segments: funnel?.segments || {},
      totalUsers: funnel?.totalUsers ?? 0,
      churnForecast: funnel?.churnForecast || {},
      avgChurnScore: funnel?.avgChurnScore ?? 0,
    })
  } catch (err) {
    console.error('POST /api/analytics/ai-funnel-analysis:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
}

/**
 * POST /api/analytics/ai-strategy — DeepSeek анализирует пользователя и генерирует стратегию + сообщение.
 */
export async function aiStrategy(req, res) {
  return runAiStrategy(req, res)
}
