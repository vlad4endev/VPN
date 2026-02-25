# Отчёт: платёжная система VPN-проекта

## 1. Обзор

Платёжная система построена на **ЮMoney (YooMoney)** и связке **n8n + n8n-webhook-proxy**. Проверка факта оплаты выполняется **только в n8n**; бэкенд не проверяет оплату по своей базе, а доверяет ответу n8n и затем активирует подписку и обновляет данные.

---

## 2. Компоненты

| Компонент | Назначение |
|-----------|------------|
| **ЮMoney API** | Приём платежей (request-payment, label = orderId). |
| **n8n** | Генерация ссылки на оплату (generateLink), проверка уведомлений (processNotification), поиск заказа по `label` и возврат данных (orderId, userId, statuspay и т.д.). |
| **n8n-webhook-proxy** (порт 3001) | Единая точка входа: `/api/payment/*`, проксирование в n8n, идемпотентность, активация подписки после успешного ответа n8n. |
| **payment-server.js** (порт 3002) | Отдельный сервис: создание платежа через ЮMoney API и in-memory storage. В основном потоке оплаты **не используется**; основной поток идёт через n8n. |
| **Firestore** | Хранение: заказы/платежи (`payments`), подписки (`subscriptions`), пользователи (`users_v4`). Не используется для проверки оплаты. |
| **Клиент (React)** | Выбор тарифа → инициация оплаты → открытие paymentUrl → опрос статуса (verify) / ожидание webhook. |

---

## 3. Поток оплаты (основной сценарий)

### 3.1 Инициация оплаты

1. Пользователь выбирает тариф и нажимает «Оплатить».
2. **dashboardService.createSubscription()** при `paymentMode === 'pay_now'` и сумме > 0:
   - считает сумму (тариф, устройства, период, скидка);
   - вызывает **initiatePayment()** и **не** создаёт подписку.
3. **initiatePayment()** (клиент):
   - при необходимости загружает настройки платежей из Firestore (`yoomoneyWallet`, `yoomoneySecretKey`);
   - вызывает **PaymentService.generatePaymentLink()** → `POST /api/payment/generate-link` с телом: `userId`, `amount`, `tariffId`, `paymentSettings`, `userData` (uuid, email, inboundId).
4. **n8n-webhook-proxy** (`POST /api/payment/generate-link`):
   - при отсутствии/неполноте `paymentSettings` подгружает их из Firestore;
   - при отсутствии `userData` в запросе подтягивает пользователя из `users_v4`;
   - вызывает n8n webhook с `mode: 'generateLink'`, те же данные и настройки ЮMoney.
5. **n8n workflow** (вне репозитория):
   - генерирует `orderId` (например, `order_<timestamp>`);
   - формирует ссылку на оплату ЮMoney (QuickPay или API) с `label=orderId`;
   - возвращает в ответе `paymentUrl`, `orderId`, при необходимости `amount` и т.д.
6. Прокси возвращает клиенту `{ success, paymentUrl, orderId, amount, status }`.
7. **Клиент** после успешного ответа:
   - создаёт документ в Firestore `artifacts/{APP_ID}/public/data/payments` со статусом `pending` (userId, orderId, tariffId, amount, devices, periodMonths, discount, promocodeId и т.д.);
   - открывает `paymentUrl` в новом окне и показывает модальное окно ожидания оплаты.

Файлы:  
`src/features/dashboard/services/dashboardService.js` (createSubscription, initiatePayment),  
`src/features/payment/services/paymentService.js` (generatePaymentLink),  
`server/n8n-webhook-proxy.js` (POST /api/payment/generate-link).

### 3.2 Оплата и webhook

1. Пользователь завершает оплату на стороне ЮMoney.
2. ЮMoney отправляет webhook на `POST /api/payment/webhook` (URL настраивается в личном кабинете ЮMoney).
3. **n8n-webhook-proxy** (`POST /api/payment/webhook`):
   - проверяет заголовок `X-N8N-Webhook-Secret` и при необходимости IP (`WEBHOOK_ALLOWED_IPS`);
   - проверяет идемпотентность по `operation_id` (коллекция обработанных событий);
   - подгружает настройки платежей;
   - отправляет в n8n данные с `mode: 'processNotification'` и телом от ЮMoney (в т.ч. `label`, `operation_id` и т.д.).
4. **n8n**:
   - проверяет подпись/данные ЮMoney;
   - находит заказ по `label` (orderId) в своей БД;
   - при успехе возвращает объект с полями вроде: `orderid`, `statuspay: 'ОПЛАЧЕНО'`, `uuid` (userId), `tariffid`, `sum`, `devices`, `periodmonths` и т.д.
5. Прокси:
   - сохраняет событие по `operation_id` для идемпотентности;
   - считает платёж успешным при `statuspay === 'оплачено'` (и аналогах) или `result.status === 'success'` и т.п.;
   - при успехе формирует **paymentData** только из ответа n8n (userId, orderId, tariffId, amount, devices, periodMonths, discount, email, uuid);
   - вызывает **activateSubscriptionAfterPayment(paymentData)**.

Файлы:  
`server/n8n-webhook-proxy.js` (POST /api/payment/webhook, формирование paymentData, вызов activateSubscriptionAfterPayment).

### 3.3 Активация подписки после оплаты

**activateSubscriptionAfterPayment(paymentData)** в n8n-webhook-proxy:

1. **Блокировка по orderId** в коллекции `activation_locks` (TTL 5 мин), чтобы избежать гонок.
2. Проверка наличия активной подписки у пользователя (идемпотентность).
3. Загрузка пользователя из `users_v4` и тарифа из `tariffs`.
4. Расчёт даты окончания подписки (продление от текущей даты окончания или от «сейчас»).
5. Создание/обновление документа в коллекции **subscriptions** (status `activating`, затем `active` или `failed`).
6. Обновление документа пользователя в **users_v4**: subscriptionId, plan, expiresAt, tariffId, tariffName, devices, periodMonths, paymentStatus: `'paid'` и т.д.
7. Создание/обновление клиента в **3x-ui** (XUI): через **activateClientIn3XUI** (retry до 3 попыток). При отсутствии uuid он генерируется и записывается в пользователя.
8. По результату активации в 3x-ui подписка переводится в статус `active` или `failed`, отправляются уведомления (in-app, Web Push, Telegram при наличии tgId).
9. Снятие блокировки.

Запись в коллекцию **payments** в этом потоке не создаётся: документ платежа уже создан на клиенте при инициации. Обновление существующей записи платежа на `completed` выполняется в другом endpoint (см. ниже).

Файл:  
`server/n8n-webhook-proxy.js` (activateSubscriptionAfterPayment, activateClientIn3XUI).

---

## 4. Дополнительные API и сценарии

### 4.1 Проверка статуса платежа (клиент)

- **GET /api/payment/status/:orderId**  
  Возвращает документ платежа из Firestore `artifacts/{APP_ID}/public/data/payments` по `orderId`. Используется только для отображения/истории, не для принятия решения об активации.

- **POST /api/payment/verify**  
  Принимает `orderId`, пересылает запрос в n8n; n8n ищет заказ по orderId в своей БД и возвращает статус/данные. Клиент использует это для опроса «оплачено ли» после открытия окна оплаты (например, в Dashboard при проверке после webhook).

### 4.2 Альтернативный сценарий: n8n сам подтверждает оплату

- **POST /api/payment/n8n-payment-confirmed**  
  Вызывается из n8n, когда n8n уже получил/обновил запись (статус «ОПЛАЧЕНО»). Тело: массив или объект с полями вроде `orderid`, `statuspay`, `uuid`, `tariffid`, `sum` и т.д.  
  Прокси:
  - проверяет секрет и IP;
  - собирает paymentData и вызывает активацию подписки;
  - в Firestore ищет платёж по `orderId` в `artifacts/{APP_ID}/public/data/payments` и при статусе `pending` обновляет его на `completed`, при наличии промокода инкрементирует использование и записывает `usedBy`.

Таким образом, обновление платежа в Firestore на `completed` происходит либо в этом endpoint, либо в другом месте при том же сценарии «n8n подтвердил оплату».

### 4.3 Создание записи платежа

- **Клиент** создаёт запись при инициации оплаты: после успешного ответа `generate-link` в **dashboardService.initiatePayment()** вызывается `addDoc` в коллекцию `artifacts/{APP_ID}/public/data/payments` (поля: userId, orderId, tariffId, tariffName, amount, status: `pending`, devices, periodMonths, promocodeId и т.д.).
- **Импорт из NocoDB** (n8n-webhook-proxy): при создании пользователей может создаваться запись в `payments` со `source: 'nocodb_import'`.

---

## 5. Хранение данных

### 5.1 Firestore

- **Коллекция платежей:**  
  `artifacts/{APP_ID}/public/data/payments`  
  Поля: orderId, userId, amount, status (`pending` | `completed`), tariffId, tariffName, devices, periodMonths, discount, promocodeId, createdAt, completedAt, operationId и др.  
  Правила: чтение/запись только свой userId или админ.

- **Подписки:**  
  `artifacts/{APP_ID}/public/data/subscriptions`  
  Статусы: `activating` → `active` или `failed`. Связь с пользователем через subscriptionId в users_v4.

- **Настройки платежей:**  
  В документе настроек (например, `artifacts/{APP_ID}/public/settings`) или отдельно хранятся `yoomoneyWallet`, `yoomoneySecretKey`. Подгружаются прокси при generate-link и webhook, при отсутствии в теле запроса.

### 5.2 payment-server.js (альтернативный контур)

- Отдельный Express-сервер на порту 3002.
- **POST /create-payment**: создаёт платёж через ЮMoney API (paymentService.createPayment), сохраняет в **in-memory storage** (server/storage.js).
- **GET /payment/:orderId**, **GET /payments**: чтение из памяти.
- Проверка оплаты в этом контуре не реализована в коде проекта; в комментариях указано, что проверка должна выполняться в n8n (operation-history по label). В основном потоке оплаты этот сервер не задействован.

---

## 6. Клиентский UI и логика

- **Тарифы и кнопка оплаты:** выбор тарифа → вызов createSubscription (pay_now) → при возврате `requiresPayment` и `paymentUrl` открывается окно оплаты и показывается модальное окно (PaymentProcessingModal).
- **После возврата с оплаты:** в Dashboard при наличии данных об успешном платеже (например, из verify или из состояния) вызывается createSubscription с `paymentMode: 'paid'` и параметрами платежа (devices, periodMonths, discount), чтобы создать подписку уже без редиректа на оплату.
- **Страница результата оплаты:** PaymentResultPage отображает результат по orderId (из query), запрашивает GET /api/payment/status/:orderId для отображения деталей.
- **История платежей:** в кабинете данные берутся из Firestore `artifacts/{APP_ID}/public/data/payments` по userId (App.jsx, dashboardService). В админке — adminService.loadAllPayments() по той же коллекции.

---

## 7. Безопасность

- Webhook: проверка заголовка `X-N8N-Webhook-Secret` и опционально списка IP (`WEBHOOK_ALLOWED_IPS`), без CORS для webhook endpoint.
- Идемпотентность: по `operation_id` от ЮMoney сохраняется результат обработки и повторные запросы с тем же operation_id не приводят к повторной активации.
- Активация: блокировка по orderId в `activation_locks` уменьшает риск гонок при двойных вызовах.
- Секреты ЮMoney не отдаются на клиент; на клиент уходят только paymentUrl и orderId.

---

## 8. Замечания и рекомендации

1. **usePayments.js** обращается к коллекции `artifacts/${APP_ID}/payments`, тогда как везде в проекте используется `artifacts/${APP_ID}/public/data/payments`. Стоит привести хук к единому пути, иначе история платежей в местах использования хука может быть пустой или из другой коллекции.

2. **payment-server.js и storage.js** образуют отдельный контур (in-memory). Если он не используется, можно явно пометить как устаревший или удалить; иначе при переходе на него нужно продумать персистентное хранилище и контур проверки оплаты.

3. **checkPaymentStatus** в клиентском paymentService.js помечен как TODO и возвращает заглушку; фактическая проверка идёт через POST /api/payment/verify и GET /api/payment/status/:orderId.

4. Создание документа платежа в Firestore выполняется на клиенте после generate-link. Если n8n в своём workflow тоже создаёт запись (например, в своей БД или в Firestore), возможны дубли или расхождения — имеет смысл согласовать единственное место создания (например, только клиент или только n8n при generateLink).

5. Документация (PAYMENT_INTEGRATION_PLAN.md, YOOMONEY_WEBHOOK_SETUP.md, PAYMENT_SETUP.md) в целом соответствует архитектуре; полезно держать в них актуальный URL webhook и перечень env (YOOMONEY_ACCESS_TOKEN, YOOMONEY_WALLET, WEBHOOK_SECRET, APP_ID и т.д.).

---

## 9. Краткая схема потока

```
[Клиент] → createSubscription(pay_now) → initiatePayment()
    → POST /api/payment/generate-link (userId, amount, tariffId, paymentSettings, userData)
    → [n8n-webhook-proxy] → n8n (mode: generateLink)
    → n8n возвращает paymentUrl, orderId
    → Клиент: addDoc(payments, { orderId, userId, ..., status: 'pending' })
    → Открытие paymentUrl в новом окне

[ЮMoney] → POST /api/payment/webhook (operation_id, label, ...)
    → [n8n-webhook-proxy]: проверка secret/IP, идемпотентность operation_id
    → n8n (mode: processNotification) → проверка оплаты, поиск по label
    → n8n возвращает orderid, statuspay, uuid, tariffid, sum, ...
    → Прокси: при statuspay === 'оплачено' → activateSubscriptionAfterPayment(paymentData)
    → Блокировка по orderId → подписка в subscriptions → обновление users_v4 → 3x-ui (add/update client)
    → Статус подписки active, уведомления

[Клиент] опционально: POST /api/payment/verify (orderId) или GET /api/payment/status/:orderId
    → при успехе: createSubscription(..., paymentMode: 'paid') для финального создания подписки на клиенте/синхронизации
```

Готово.
