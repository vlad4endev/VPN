# AI-воронка аналитики VPN-сервиса

Модуль для определения приоритетных клиентов, прогноза оттока и стратегии возврата.

## Структура

- **analytics.model.js** — модель UserMetrics, сегменты (new, active, risk, churning, lost).
- **metrics.service.js** — сбор и агрегация метрик (lastActiveAt, сессии, оплаты, LTV).
- **ai.engine.js** — расчёт churnScore (0–100), priorityScore, сегмента и стратегии возврата.
- **analytics.service.js** — воронка, кэш Redis, ответы API.
- **analytics.controller.js** — обработчики запросов.
- **analytics.routes.js** — роуты (все под admin).

## Модель UserMetrics (Firestore: `artifacts/{appId}/public/data/user_metrics`)

Поля: `userId`, `telegramId`, `registeredAt`, `lastActiveAt`, `totalSessions`, `avgSessionDurationMinutes`, `subscriptionExpiresAt`, `totalPayments`, `lifetimeValue`, `supportTicketsCount`, `trafficUsedBytes`, `planType`.

## API (все требуют заголовок admin)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/analytics/funnel` | Количество по сегментам, топ 20 по priorityScore, средний churnScore, прогноз оттока |
| GET | `/api/analytics/user/:id` | Сегмент, churnScore, LTV, рекомендованная стратегия возврата (?refresh=true — пересчёт) |
| POST | `/api/analytics/refresh-metrics` | Пересобрать метрики по всем пользователям (body: `{ "limit": 2000 }`) |
| POST | `/api/analytics/send-churn-offer/:id` | Отправить персональный оффер в Telegram (если churnScore > 80 и есть telegramId) |

Для авторизованных пользователей (не админ):

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/analytics/heartbeat` | Обновить lastActiveAt (Bearer token) |

## Кэширование

- Воронка: Redis `analytics:funnel`, TTL 120 с.
- Пользователь: Redis `analytics:user:{userId}`, TTL 60 с.

## Расширяемость под ML

В `ai.engine.js` функция `scoreUser(metrics)` возвращает объект с `churnScore`, `segment`, `priorityScore`, `recommendedAction`, `offerType`, `messageTone`. Логику можно заменить вызовом внешней ML-модели (например `predictChurn(userId, metrics)`), сохранив тот же контракт ответа.

## Первый запуск

1. Вызвать `POST /api/analytics/refresh-metrics` (от имени админа), чтобы заполнить коллекцию `user_metrics` из `users_v4`, `payments`, `tickets`.
2. Фронт может вызывать `POST /api/analytics/heartbeat` при входе в приложение или после подключения VPN для обновления lastActiveAt.
