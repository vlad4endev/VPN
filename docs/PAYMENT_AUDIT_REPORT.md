# Отчёт аудита платёжной системы

## 1. АУДИТ ЛОГИКИ URL / ПАРАМЕТРОВ

### 1.1 Текущая реализация

| Аспект | Platega | YooMoney (server/paymentService.js) |
|--------|---------|-------------------------------------|
| **Формирование URL** | API REST (POST) — URL возвращает провайдер | API request-payment — URL из ответа |
| **URL-encoding** | `encodeURIComponent(orderId)` в returnUrl/failedUrl — корректно | Form-urlencoded через `encodeURIComponent` — корректно |
| **Порядок параметров** | Нет (JSON body) | Нет (form body) |
| **Тип суммы** | `Number(amount)` — рубли (float) | `amount.toString()` — рубли (строка) |

### 1.2 Выявленные риски

1. **Сумма (float vs копейки)**  
   - Platega и YooMoney ожидают рубли. Использование `Number(amount)` может приводить к ошибкам округления (например, 19.9 + 0.1 = 20.000000000000004).  
   - **Рекомендация**: нормализовать сумму до 2 знаков и передавать как число/строку в формате `"X.XX"`.

2. **orderId**  
   - `vpn_${Date.now()}` даёт коллизии при одновременных запросах.  
   - **Рекомендация**: использовать `crypto.randomUUID()` или `Date.now() + randomBytes`.

3. **returnUrl / failedUrl**  
   - Двойной trailing slash при `baseUrl` с `/` — возможны дубли `//`.  
   - Уже есть `.replace(/\/+$/, '')` — поведение корректное.

---

## 2. БЕЗОПАСНОСТЬ

### 2.1 Критическая уязвимость: секреты в Firestore `public/settings`

**Проблема**: `plategaSecretKey` и `plategaMerchantId` хранятся в `artifacts/{appId}/public/settings`.  
Правило Firestore: `allow read: if request.auth != null` — любой аутентифицированный пользователь может читать весь документ, включая секреты.

**Влияние**: Утечка платёжных ключей любому залогиненному пользователю.

**Рекомендация**:
- Не хранить `plategaSecretKey` в Firestore `public/settings`.
- Хранить только в `server/data/platega-settings.json` или в переменных окружения `PLATEGA_MERCHANT_ID`, `PLATEGA_SECRET_KEY`.
- Клиент не должен загружать и не передавать секреты в запросе `generate-link`.

### 2.2 Текущее использование секретов

| Источник | Platega | YooMoney |
|----------|---------|----------|
| Backend | local file → env → Firestore | Firestore (для n8n webhook) |
| Client  | Firestore public/settings ❌ | Не используется |
| Webhook | Не требуется (callback от Platega) | `yoomoneySecretKey` для SHA1 |

### 2.3 Проверка подписей

- **YooMoney webhook**: SHA1 (документация) — проверка выполняется в n8n.
- **Platega**: callback без подписи в теле; авторизация через заголовки `X-MerchantId`, `X-Secret`.

---

## 3. РЕКОМЕНДУЕМАЯ АРХИТЕКТУРА (Clean Architecture)

```
server/payment/
├── index.js              # PaymentService (фасад)
├── PaymentService.js     # Оркестратор
├── providers/
│   └── PlategaProvider.js # Логика Platega
├── utils/
│   ├── amount.js         # Нормализация суммы
│   └── orderId.js       # Генерация orderId
└── webhook/
    └── handlers.js      # Обработчики webhook (опционально)
```

Интерфейс провайдера: `generatePaymentLink(orderData) -> { paymentUrl, orderId, transactionId? }`

---

## 4. DEBUG-ИНСТРУМЕНТЫ

Добавить логирование (без секретов):

- Строка для подписи (маска: `***` вместо ключа).
- Финальный payload перед отправкой (без полей secret/key).
- Нормализованная сумма и orderId.

**Реализация:** Установите `PAYMENT_DEBUG=true` в .env. Логи появятся в консоли:
- `[Platega DEBUG]` — payload перед отправкой (без секретов)
- `[YooMoney Webhook DEBUG]` — строка для хеша (secret заменён на `<secret>`), computedHash vs receivedHash
