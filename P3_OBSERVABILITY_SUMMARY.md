# P3 Observability & Alerts — Итог

Расширение наблюдаемости backend: метрики по маршрутам, алерты, структурированные логи. Webhook n8n не затронут.

---

## 1. Изменённые и новые файлы

| Файл | Действие |
|------|----------|
| `server/lib/metrics.js` | Расширен: per-route latency (avg, p95), activeRequests, error5xxPerRoute, metricsWebhook; middleware с opts `{ logger, isWebhookPath }` |
| `server/lib/alerting.js` | **Новый**: скользящее окно 1 мин, алерты при 5xx > 5% и latency avg > 2s, cooldown 30s, webhook исключены |
| `server/lib/logger.js` | Добавлено поле `route` в request-лог |
| `server/lib/requestTimeout.js` | При таймауте: `req._timeoutFired`, recordRequest с route/skipAvg, без двойного учёта в middleware |
| `server/proxy-server.js` | metricsMiddleware({ logger }), request log с latencyMs |
| `server/n8n-webhook-proxy.js` | metricsMiddleware({ logger, isWebhookPath }), getMetrics({ isWebhookPath }), request log с latencyMs |
| `PRODUCTION_READY.md` | Раздел 7: P3 Observability (метрики, alerting, логи, исключения для webhook); обновлён формат /metrics |

---

## 2. Ключевые фрагменты

### Метрики по маршруту и webhook

```js
// getMetrics(opts = { isWebhookPath }) — для n8n передаётся isWebhookPath
// latencyAvgPerRoute, latencyP95PerRoute, error5xxCountPerRoute — только не-webhook
// metricsWebhook: { requestCount, errorCount }
```

### Middleware с logger и isWebhookPath

```js
// proxy-server
app.use(metricsMiddleware({ logger }))

// n8n-webhook-proxy
app.use(metricsMiddleware({ logger, isWebhookPath: (path) => isWebhookPath(path) }))
```

### Лог запроса с latencyMs

```js
res.on('finish', () => {
  const latencyMs = req._startTime != null ? Date.now() - req._startTime : 0
  logger.request(req, res, { latencyMs })
})
```

### Алерты (alerting.js)

- addSample(route, statusCode, latencyMs, isWebhook)
- checkAndAlert(logger): за последнюю минуту по не-webhook маршрутам:
  - 5xx rate > 5% → logger.error('ALERT: 5xx rate exceeds 5%...', { route, status: '5xx_high', ... })
  - avg latency > 2000 ms → logger.error('ALERT: latency avg exceeds 2s...', { route, status: 'latency_high', ... })
- Cooldown 30 s на тип алерта по маршруту

---

## 3. Влияние на n8n webhook

| Элемент | Применяется к webhook? | Влияние |
|---------|------------------------|---------|
| latencyAvgPerRoute / latencyP95PerRoute | Нет (webhook исключены) | **НЕ ВЛИЯЕТ** |
| error5xxCountPerRoute | Нет | **НЕ ВЛИЯЕТ** |
| Алерты 5xx / latency | Нет (считаются только не-webhook) | **НЕ ВЛИЯЕТ** |
| metricsWebhook | Да (только requestCount, errorCount) | Учёт без ограничений |
| Логи (route, latencyMs) | Да (общий формат для всех) | Без изменения контракта |

---

## 4. Чеклист P3

- [x] Latency per route: startTime/endTime, route, statusCode, avg и p95
- [x] Webhook-пути исключены из расчёта latency
- [x] /metrics: latencyAvgPerRoute, latencyP95PerRoute, activeRequestsCount, error5xxCountPerRoute, metricsWebhook
- [x] Алерты: 5xx > 5% за минуту, latency avg > 2s, JSON-лог (route, status, msg), webhook исключены
- [x] Логи: route, method, statusCode, latencyMs, requestId (pino, без body/query/headers/секретов)
- [x] PRODUCTION_READY.md: новые метрики, alerting logic, исключения для webhook
- [x] Health/metrics/error handler не сломаны, n8n webhook не затронут
