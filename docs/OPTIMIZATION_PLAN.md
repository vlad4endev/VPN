# План комплексной оптимизации VPN-сервиса

> Безопасная поэтапная оптимизация без изменения бизнес-логики и авторизации.

---

## 1. Аудит: найденные узкие места

### 1.1 Backend (n8n-webhook-proxy.js)

| Узкое место | Описание | Оценка read/write | Приоритет |
|-------------|----------|-------------------|-----------|
| Нет gzip/deflate | Ответы JSON без сжатия | — | Высокий |
| ensureAdmin — до 6+ Firestore reads | Проверка по appIds + поиск по email | 2–6 reads/запрос | Высокий |
| Повторная загрузка settings | settings загружаются многократно за запрос | 1+ read/endpoint | Высокий |
| verifyDoc после updateUser | adminService.updateUser делает лишний getDoc после setDoc | +1 read/update | Средний |
| send-reminders — загрузка всех users | `users_v4.get()` без фильтра | N reads (все пользователи) | Средний |
| Telegram: поиск по tgId без кэша | handleMiniAppData, webhook — каждый раз Firestore | 1 read/сообщение | Средний |
| initData middleware | Вызывается на каждом запросе с initData; validateTelegramInitDataWithReasonAsync вызывает getTelegramToken → settings read | 0–1 read (если initData) | Низкий |

### 1.2 Firebase (Firestore)

| Узкое место | Описание | Решение |
|-------------|----------|---------|
| Отсутствуют индексы | tgId, login, email, telegramSessionToken, orderId, eventId, userId+status | Добавить в firestore.indexes.json |
| Security rules: isAdminFromFirestore | get() пользователя при каждом запросе | Предпочитать custom claim `admin` |
| loadUsers: getDocs всей коллекции | Админка загружает всех пользователей без limit | Оставить (требуется для списка), но кэшировать |
| Список пользователей без пагинации | adminService.loadUsers() — все документы | Добавить пагинацию (этап 2) |

### 1.3 Frontend

| Узкое место | Описание | Решение |
|-------------|----------|---------|
| Нет lazy loading | AdminPanel, Dashboard, SupportView — статический импорт | React.lazy + Suspense |
| adminService.updateUser: verify read | Лишний getDoc после setDoc | Убрать или сделать опциональным |
| React Query staleTime | 5 мин — разумно | Увеличить для settings/tariffs до 10–15 мин |
| Отсутствует HTTP caching | API ответы без Cache-Control | Добавить заголовки для редко меняющихся данных |

### 1.4 Telegram-бот

| Узкое место | Описание | Решение |
|-------------|----------|---------|
| Поиск пользователя по tgId | Каждое сообщение/web_app_data → Firestore | In-memory кэш tgId → userId (TTL 5–10 мин) |
| Webhook: res.status(200).send() до обработки | Ответ сразу, обработка async — хорошо | — |
| send-reminders | Загрузка всех users | Фильтр на сервере или Cloud Function с where |

### 1.5 Инфраструктура

| Узкое место | Описание | Решение |
|-------------|----------|---------|
| Nginx: gzip | В example нет явного gzip | Добавить в nginx.conf.example |
| Docker | Multi-stage есть, слои можно улучшить | Объединить RUN, .dockerignore |
| Логирование медленных запросов | Нет | Middleware с замером времени |

---

## 2. Приоритетный план оптимизации

### Этап 1 — Быстрые победы (1–2 дня)

1. **Backend: compression** — `compression` middleware для gzip. Ожидание: −40–70% размер JSON.
2. **Backend: settings cache** — in-memory кэш `artifacts/…/settings` (TTL 60 с). Ожидание: −80%+ read settings.
3. **Backend: admin cache** — кэш `uid → isAdmin` (TTL 5 мин). Ожидание: −70%+ Firestore reads в ensureAdmin.
4. **Firebase: индексы** — добавить составные индексы для частых запросов. Ожидание: ускорение запросов.
5. **adminService.updateUser** — убрать лишний verify getDoc после setDoc. Ожидание: −1 read на каждое обновление пользователя.
6. **Nginx gzip** — добавить в example. Ожидание: −40–70% трафика статики.

### Этап 2 — Средний приоритет (3–5 дней)

7. **Frontend: lazy loading** — React.lazy для AdminPanel, Dashboard, SupportView. Ожидание: −30–50% initial bundle.
8. **React Query** — увеличить staleTime для settings/tariffs, настроить Cache-Control для API.
9. **Telegram: кэш tgId→userId** — in-memory, TTL 5 мин. Ожидание: −90%+ Firestore при частых сообщениях.
10. **send-reminders** — использовать `where('tgId', '!=', null)` и `where('expiresAt', '<=', inSevenDays)` (составной индекс). Ожидание: −95% read вместо полной загрузки users.

### Этап 3 — Масштабирование (1–2 недели)

11. **Мониторинг** — middleware для логирования медленных запросов (>500 ms).
12. **Redis (опционально)** — для shared cache при нескольких инстансах.
13. **Пагинация users** — в админке загружать порциями.
14. **CDN** — для статики (JS/CSS).

---

## 3. Конкретные изменения кода

### 3.1 Backend: compression (gzip)

```javascript
// server/n8n-webhook-proxy.js
import compression from 'compression'
// ...
app.use(compression())
```

Установка: `npm install compression --save` в server/.

### 3.2 Backend: settings cache

```javascript
let settingsCache = { data: null, expiresAt: 0 }
const SETTINGS_CACHE_TTL_MS = 60 * 1000

async function getSettingsCached() {
  if (settingsCache.data && Date.now() < settingsCache.expiresAt)
    return settingsCache.data
  const snap = await db.doc(`artifacts/${APP_ID}/public/settings`).get()
  const data = snap.exists ? snap.data() : {}
  settingsCache = { data, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS }
  return data
}
```

Использовать в getTelegramToken, loadSettings для платежей и т.д.

### 3.3 Backend: admin cache

```javascript
const adminCache = new Map() // uid -> { ok: boolean, expiresAt: number }
const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000

// В ensureAdmin: перед циклами проверять adminCache.get(uid)
// При успешной проверке: adminCache.set(uid, { ok: true, expiresAt: Date.now() + ADMIN_CACHE_TTL_MS })
// При неудаче не кэшировать (безопасность)
```

### 3.4 Firebase: индексы (firestore.indexes.json)

```json
{
  "indexes": [
    {"collectionGroup": "users_v4", "queryScope": "COLLECTION", "fields": [{"fieldPath": "tgId", "order": "ASCENDING"}]},
    {"collectionGroup": "users_v4", "queryScope": "COLLECTION", "fields": [{"fieldPath": "login", "order": "ASCENDING"}]},
    {"collectionGroup": "users_v4", "queryScope": "COLLECTION", "fields": [{"fieldPath": "email", "order": "ASCENDING"}]},
    {"collectionGroup": "users_v4", "queryScope": "COLLECTION", "fields": [{"fieldPath": "telegramSessionToken", "order": "ASCENDING"}]},
    {"collectionGroup": "payments", "queryScope": "COLLECTION", "fields": [{"fieldPath": "orderId", "order": "ASCENDING"}]},
    {"collectionGroup": "processed_events", "queryScope": "COLLECTION", "fields": [{"fieldPath": "eventId", "order": "ASCENDING"}]},
    {"collectionGroup": "subscriptions", "queryScope": "COLLECTION", "fields": [{"fieldPath": "userId", "order": "ASCENDING"}, {"fieldPath": "status", "order": "ASCENDING"}]},
    {"collectionGroup": "users_v4", "queryScope": "COLLECTION", "fields": [{"fieldPath": "tgId", "order": "ASCENDING"}, {"fieldPath": "expiresAt", "order": "ASCENDING"}]
  ]
}
```

*Примечание: для send-reminders нужен составной индекс tgId+expiresAt; Firestore автоматически создаёт single-field индексы для простых where, составные — явно.*

### 3.5 adminService: убрать verify read

Удалить блок после `setDoc(..., { merge: true })`:
```javascript
// УДАЛИТЬ:
const verifyDoc = await getDoc(userDoc)
if (verifyDoc.exists()) { ... }
```

### 3.6 Frontend: lazy loading

```javascript
const AdminPanel = React.lazy(() => import('../features/admin/components/AdminPanel.jsx'))
const Dashboard = React.lazy(() => import('../features/dashboard/components/Dashboard.jsx'))
const SupportView = React.lazy(() => import('../features/support/components/SupportView.jsx'))
// В рендере:
<Suspense fallback={<div className="flex items-center justify-center p-8"><Loader2 className="animate-spin" /></div>}>
  {view === 'admin' && <AdminPanel ... />}
  ...
</Suspense>
```

### 3.7 Nginx: gzip

```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_comp_level 5;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
```

---

## 4. Оценка экономии Firebase read/write

| Операция | До | После (этап 1) | Экономия |
|----------|-----|----------------|----------|
| ensureAdmin на 1 admin-запрос | 2–6 reads | 0–1 read (cache hit) | ~80% |
| settings за 1 мин (10 эндпоинтов) | 10 reads | 1 read | ~90% |
| updateUser (админка) | 2 writes + 2 reads | 2 writes + 1 read | −1 read |
| send-reminders (1000 users, 50 с tgId) | 1000 reads | ~50 reads (с where) | ~95% |

**Итого по этапу 1:** порядка 50–70% снижение Firestore reads для типичного сценария.

---

## 5. Метрики «до / после»

| Метрика | До | После (этап 1) | Цель |
|---------|-----|----------------|------|
| Размер JSON ответа /api/admin/users | ~50 KB | ~15 KB (gzip) | −70% |
| Время ensureAdmin (cold) | 50–150 ms | 50–150 ms | — |
| Время ensureAdmin (warm cache) | 50–150 ms | &lt;1 ms | −99% |
| Firestore reads/день (оценка) | 10000 | 3000–5000 | −50–70% |
| Initial JS bundle (frontend) | ~230 KB gzip | ~150 KB (lazy) | −35% |
| LCP (оценочно) | 2.5 s | 1.8 s | −30% |

---

## 5.1 Развёртывание индексов Firestore

После изменения `firestore.indexes.json` выполните:
```bash
firebase deploy --only firestore:indexes
```
Индексы создаются асинхронно; статус можно проверить в Firebase Console → Firestore → Indexes.

---

## 6. Rollback-стратегия

- Все изменения изолированы и обратимы через git revert.
- Кэши (settings, admin) — при сбое fallback на прямой Firestore read.
- Индексы Firestore — добавление новых не ломает старые запросы.
- Lazy loading — при ошибке загрузки chunk можно показать retry.

---

## 7. Рекомендации по масштабированию

1. **Горизонтальное масштабирование** — при нескольких инстансах заменить in-memory кэш на Redis.
2. **CDN** — Cloudflare/CloudFront для статики и API (с осторожностью для авторизованных запросов).
3. **Firebase** — при росте рассмотреть разделение на несколько проектов или миграцию горячих коллекций.
4. **Мониторинг** — Prometheus + Grafana для latency, error rate, Firestore read/write.
5. **Rate limiting** — уже есть в Telegram bot; расширить на API при необходимости.
