# Production Ready — Backend

Операционный чеклист для деплоя и инцидентов.

---

## 1. Обязательные переменные окружения

### proxy-server (XUI Proxy)

| Переменная | Описание | Пример |
|------------|----------|--------|
| `XUI_HOST` | URL панели 3x-ui | `http://localhost:2053` |
| `XUI_USERNAME` | Логин 3x-ui | — |
| `XUI_PASSWORD` | Пароль 3x-ui | — |
| `XUI_INBOUND_ID` | ID инбаунда | `1` |
| `NODE_ENV` | `production` / `development` | `production` |
| `PROXY_PORT` | Порт сервера | `3001` |
| `PROXY_HOST` | Хост (0.0.0.0 для всех интерфейсов) | `0.0.0.0` |
| `ALLOWED_ORIGINS` | CORS (через запятую) | `https://skypath.fun` |
| `FRONTEND_URL` | URL фронтенда | `https://skypath.fun` |

### n8n-webhook-proxy

| Переменная | Описание | Пример |
|------------|----------|--------|
| `NODE_ENV` | Окружение | `production` |
| `PORT` | Порт | `3001` |
| `HOST` | Хост | `0.0.0.0` |
| `N8N_BASE_URL` | Базовый URL n8n | `https://n8n.skypath.fun` |
| `N8N_WEBHOOK_URL` или `N8N_WEBHOOK_*` | URL webhook (только env) | — |
| `ALLOWED_ORIGINS` | CORS для не-webhook | — |
| `FIREBASE_PROJECT_ID` | Firebase (если нужен Firestore) | — |
| `LOG_LEVEL` | Уровень логов (опционально) | `info` |

---

## 2. Команды запуска

### Локально (из корня проекта)

```bash
# XUI Proxy (прокси к 3x-ui)
cd server && node proxy-server.js

# n8n Webhook Proxy
cd server && node n8n-webhook-proxy.js
```

### С PM2

```bash
cd server
pm2 start proxy-server.js --name xui-proxy
pm2 start n8n-webhook-proxy.js --name n8n-webhook-proxy
```

### Docker

```bash
docker build -t skypath-flow:latest .
docker run -p 3001:3001 --env-file .env skypath-flow:latest
```

---

## 3. Health и метрики

### Endpoints (без auth)

| Endpoint | Сервис | Назначение |
|----------|--------|------------|
| `GET /health` | Оба | Readiness/Liveness probe |
| `GET /metrics` | Оба | Метрики (JSON) |

### Формат /health

```json
{
  "status": "ok",
  "service": "xui-proxy",
  "version": "1.0.0",
  "uptime": 3600,
  "timestamp": "2025-01-29T12:00:00.000Z"
}
```

### Формат /metrics (JSON)

```json
{
  "requests": 1000,
  "status4xx": 10,
  "status5xx": 0,
  "avgResponseTimeMs": 45,
  "timeoutsCount": 0,
  "retriesCount": 0,
  "circuitOpenCount": 0,
  "activeRequestsCount": 2,
  "latencyAvgPerRoute": { "/api/xui/panel/api/inbounds": 120, "/health": 1 },
  "latencyP95PerRoute": { "/api/xui/panel/api/inbounds": 450, "/health": 2 },
  "error5xxCountPerRoute": { "/api/xui/panel/api/inbounds": 1 },
  "metricsWebhook": { "requestCount": 50, "errorCount": 0 },
  "uptimeSeconds": 3600
}
```

- `timeoutsCount` — число запросов, завершённых по глобальному таймауту (504).
- `retriesCount` — число повторных попыток к внешним API (exponential backoff).
- `circuitOpenCount` — число отказов из-за открытого circuit breaker (503).
- `activeRequestsCount` — число запросов в обработке.
- `latencyAvgPerRoute` / `latencyP95PerRoute` — средняя и p95 задержка по маршруту; **webhook-пути исключены** из расчёта.
- `error5xxCountPerRoute` — число 5xx по маршруту (только не-webhook).
- `metricsWebhook` — отдельная секция для webhook: `requestCount`, `errorCount`.
- Запросы по таймауту и aborted не участвуют в расчёте `avgResponseTimeMs`.

### Проверка из консоли

```bash
curl -s http://localhost:3001/health | jq .
curl -s http://localhost:3001/metrics | jq .
```

---

## 4. Порядок деплоя

1. Собрать образ: `docker build -t skypath-flow:latest .`
2. Остановить старый контейнер: `docker stop skypath-flow` (или через orchestrator).
3. Запустить новый с тем же `--env-file` и портами.
4. Проверить: `curl http://<host>:3001/health`
5. Убедиться, что фронт и n8n webhook работают.

---

## 5. Timeouts, Retry, Circuit Breaker (P2 Stability)

### Timeouts

- **Глобальный timeout запроса**: 30 с. При превышении — ответ 504, один warning в логах с `requestId`, метрика `timeoutsCount`.
- **proxy-server**: таймаут применяется ко всем запросам; на HTTP-сервере установлены `setTimeout(30_000)` и `keepAliveTimeout` 35 с.
- **n8n-webhook-proxy**: таймаут 30 с применяется **только к не-webhook путям**. Пути `/api/payment/webhook` и `/api/payment/n8n-payment-confirmed` **не** ограничиваются по времени (чтобы не обрывать входящие webhook от n8n/YooMoney).
- **Исходящие HTTP-запросы** к внешним сервисам (3x-ui, n8n и т.д.) имеют свой `timeout` (например 30 с в proxy-server).

### Retry (только для внешних API)

- **Где**: только исходящие вызовы к внешним API (например 3x-ui в proxy-server).
- **Параметры**: до 3 попыток, exponential backoff (300 ms, 600 ms, 1200 ms).
- **Retry при**: сетевых ошибках (ECONNABORTED, ETIMEDOUT, ECONNREFUSED, ENOTFOUND) и при ответах 5xx.
- **Без retry**: 4xx, webhook-пути (в n8n-webhook-proxy вызовы из webhook-обработчиков не оборачиваются в retry).
- Логирование retry — на уровне info (requestId, attempt, maxAttempts, delayMs), без спама.

### Circuit Breaker (минималистичный)

- **Где**: только исходящие вызовы к внешним API (например 3x-ui в proxy-server). **Webhook-пути полностью исключены.**
- **Параметры**: порог N ошибок подряд (по умолчанию 5), после чего состояние OPEN; через `openTimeout` (30 с) — переход в HALF_OPEN, один тестовый запрос; при успехе — CLOSED.
- **В состоянии OPEN**: внешний запрос не выполняется, сразу возвращается ошибка (503, код `UPSTREAM_UNAVAILABLE`), метрика `circuitOpenCount`.

### Что НЕ применяется к webhook

- К **входящим** запросам на `/api/payment/webhook` и `/api/payment/n8n-payment-confirmed`:
  - не применяется глобальный request timeout (30 с);
  - не меняются URL, метод, auth, cookies, Origin, headers;
  - не добавляются retry/timeout/circuit breaker для исходящих вызовов, инициируемых этими webhook-обработчиками.

---

## 6. Failure scenarios

| Сценарий | Поведение | Ответ клиенту | Логи |
|----------|-----------|----------------|------|
| Запрос висит > 30 с | Глобальный timeout (только не-webhook в n8n) | 504, `{ "error": { "code": "UPSTREAM_TIMEOUT", "message": "Service temporarily unavailable" } }` | Один warning с requestId |
| Внешний API не отвечает / 5xx после retry | Retry до 3 попыток, затем ошибка | 503, `{ "error": { "code": "UPSTREAM_UNAVAILABLE", "message": "Service temporarily unavailable" } }` | failureType: retry_exhausted, requestId |
| Circuit breaker OPEN | Запрос не уходит во внешний сервис | 503, `{ "error": { "code": "UPSTREAM_UNAVAILABLE", "message": "Service temporarily unavailable" } }` | failureType: circuit_open, requestId |
| Любая 5xx/upstream ошибка | Централизованный errorHandler | Только code + message, без stack trace и внутренних деталей | requestId, path, statusCode, failureType (если есть) |

---

## 7. P3 Observability & Alerts

### Метрики по маршрутам

- Для каждого HTTP-запроса считаются: `startTime`/`endTime`, `route` (req.path), `statusCode`.
- Рассчитываются **avg** и **p95** latency по маршруту.
- **Webhook-пути исключены** из `latencyAvgPerRoute` и `latencyP95PerRoute`; для них используется только секция `metricsWebhook` (requestCount, errorCount).

### Расширенные поля /metrics

| Поле | Описание |
|------|----------|
| `latencyAvgPerRoute` | Средняя задержка по маршруту (мс), без webhook |
| `latencyP95PerRoute` | p95 задержка по маршруту (мс), без webhook |
| `activeRequestsCount` | Число запросов в обработке |
| `error5xxCountPerRoute` | Число 5xx по маршруту, без webhook |
| `metricsWebhook` | requestCount, errorCount для webhook-путей |

### Alerting (pino/console)

- **Условия**: за последнюю минуту по каждому не-webhook маршруту:
  - если доля 5xx > 5% → алерт в лог;
  - если средняя задержка по маршруту > 2 с → алерт в лог.
- **Webhook-пути исключены** из проверок алертов.
- **Cooldown**: не чаще одного алерта одного типа по маршруту раз в 30 с.
- Формат лога алерта (JSON): `route`, `status` (5xx_high / latency_high), `total`, `errors` или `avgLatencyMs`, `thresholdMs`.

### Логирование запросов

- Структурированные JSON-логи (pino).
- Поля: `route`, `method`, `statusCode`, `latencyMs`, `requestId`.
- Не логируются: body, query, headers, секреты.

### Что исключено для webhook

- Webhook-пути **не** участвуют в расчёте latency per route и p95.
- Алерты по 5xx и latency **не** считаются для webhook-маршрутов.
- Webhook учитываются только в `metricsWebhook.requestCount` и `metricsWebhook.errorCount`.

---

## 8. Rollback

1. Остановить текущий контейнер/процесс.
2. Запустить предыдущий образ/релиз с теми же env и портами.
3. Проверить `/health` и базовые сценарии (логин, webhook).

---

## 9. Инцидент — что проверить

1. **Сервис не отвечает**
   - `curl http://localhost:3001/health` — доступность.
   - Логи (JSON): уровень `error`, `requestId`, `path`, `statusCode`.
   - Метрики: `GET /metrics` — рост 5xx, время ответа.

2. **Ошибки 5xx**
   - В логах искать по `level: "error"` и `requestId`.
   - Ответ клиенту — только `{ error: { code, message } }`, без внутренних деталей.

3. **n8n webhook не срабатывает**
   - Убедиться, что URL и метод не менялись.
   - Проверить rate limit (1000 req/min на webhook paths).
   - Не требовать auth/cookies/Origin для webhook.

4. **Высокая задержка**
   - Смотреть `avgResponseTimeMs` в `/metrics`.
   - Логи — время ответа не логируется в body; при необходимости добавить только duration в безопасном виде.

5. **Graceful shutdown**
   - При SIGTERM/SIGINT сервер закрывает приём новых запросов и завершает активные, затем процесс выходит.
   - В логах: `Shutdown signal received`, затем `Server closed`.

---

## 10. Логи (структурированные, без секретов)

- Формат: JSON (pino).
- Поля: `level`, `msg`, `service`, `requestId`, `path`, `statusCode` (если есть).
- Не логируются: body, query, headers (кроме при необходимости user-agent), пароли, токены, секреты.

Пример (sanitized):

```json
{"level":30,"msg":"GET /health 200","service":"xui-proxy","requestId":"a1b2c3d4-...","path":"/health","statusCode":200}
{"level":50,"msg":"Proxy error","service":"xui-proxy","requestId":"e5f6g7h8-...","path":"/api/xui/panel/api/inbounds","statusCode":502}
```
