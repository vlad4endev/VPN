# План интеграции платежной системы YooMoney

## Анализ скрипта n8n

Скрипт n8n реализует два основных режима работы:

### 1. Режим `generateLink` - Генерация ссылки на оплату
- Извлекает сумму из различных источников (data, callback_query, message, body, sum)
- Генерирует уникальный `orderId` на основе timestamp
- Создает URL для оплаты через YooMoney QuickPay
- Возвращает `paymentUrl`, `amount`, `orderId`, `userId`

### 2. Режим `processNotification` - Обработка уведомлений от YooMoney
- Проверяет наличие всех обязательных полей
- Вычисляет SHA1 хеш для проверки подлинности уведомления
- Сравнивает вычисленный хеш с полученным `sha1_hash`
- Возвращает данные об успешной оплате: `orderId`, `paidAmount`, `currency`, `operation`, `datetime`

## Архитектура интеграции

### Компоненты системы

1. **Серверная часть** (`server/payment-handler.js`)
   - Endpoint для генерации ссылки на оплату
   - Endpoint для обработки webhook от YooMoney
   - SHA1 функция для проверки подлинности
   - Интеграция с Firestore для обновления пользователей
   - Интеграция с 3x-ui для создания клиентов

2. **Клиентская часть** (Frontend)
   - UI для инициации оплаты
   - Отображение статуса платежа
   - Редирект на страницу оплаты YooMoney

3. **Firestore структура**
   - Коллекция `payments` - история платежей
   - Коллекция `users` - обновление подписок после оплаты
   - Поле `orderId` в платежах для связи с уведомлениями

## Пошаговый план реализации

### Шаг 1: Создание серверного модуля для платежей

**Файл:** `server/payment-handler.js`

**Функционал:**
- SHA1 функция (скопировать из n8n скрипта)
- Функция `generatePaymentLink(userId, amount, tariffId)` 
  - Генерирует `orderId` в формате `order_{timestamp}`
  - Создает URL для YooMoney QuickPay
  - Сохраняет заказ в Firestore (статус `pending`)
  - Возвращает `paymentUrl` и `orderId`
  
- Функция `processPaymentNotification(notificationData)`
  - Проверяет обязательные поля
  - Вычисляет и проверяет SHA1 хеш
  - Находит заказ по `label` (orderId)
  - Обновляет статус платежа на `completed`
  - Обновляет подписку пользователя
  - Создает/обновляет клиента в 3x-ui

**Переменные окружения:**
- `YOOMONEY_WALLET` - номер кошелька (410017383938322)
- `YOOMONEY_SECRET_KEY` - секретный ключ (VK+sJ7uqS1HoYf8AY1ZBJnDQ)

### Шаг 2: Добавление API endpoints в n8n-webhook-proxy.js

**Новые endpoints:**

1. **POST /api/payment/generate-link**
   - Принимает: `{ userId, amount, tariffId }`
   - Вызывает `generatePaymentLink()`
   - Возвращает: `{ paymentUrl, orderId, amount }`

2. **POST /api/payment/webhook**
   - Принимает данные от YooMoney (form-data или JSON)
   - Вызывает `processPaymentNotification()`
   - Возвращает: `{ status: 'success' }` или ошибку

### Шаг 3: Обновление структуры данных в Firestore

**Коллекция `payments`:**
```javascript
{
  id: string,
  userId: string,
  orderId: string,        // order_{timestamp}
  amount: number,
  currency: string,       // 'RUB'
  tariffId: string,
  tariffName: string,
  status: 'pending' | 'completed' | 'failed',
  createdAt: timestamp,
  completedAt: timestamp,
  operationId: string,    // от YooMoney
  yoomoneyData: object    // полные данные от YooMoney
}
```

**Коллекция `orders` (опционально, для связи):**
```javascript
{
  id: string,              // orderId
  userId: string,
  amount: number,
  tariffId: string,
  status: 'pending' | 'completed' | 'failed',
  createdAt: timestamp,
  paymentUrl: string
}
```

### Шаг 4: Интеграция с существующей системой подписок

**Обновление `dashboardService.js`:**

1. Добавить функцию `initiatePayment(user, tariff, amount)`
   - Вызывает `/api/payment/generate-link`
   - Сохраняет заказ в Firestore
   - Возвращает `paymentUrl` для редиректа

2. Модифицировать `createSubscription()`:
   - Если `paymentMode === 'pay_now'` и `amount > 0`:
     - Вызывать `initiatePayment()` вместо прямого создания подписки
     - Создавать подписку только после успешной оплаты (через webhook)

### Шаг 5: Создание клиентского компонента для оплаты

**Файл:** `src/features/payment/components/PaymentButton.jsx`

**Функционал:**
- Кнопка "Оплатить" в модальном окне выбора тарифа
- При клике:
  - Вызывает API для генерации ссылки
  - Открывает новое окно с платежной формой YooMoney
  - Показывает статус ожидания оплаты
  - Проверяет статус платежа через polling или WebSocket

**Файл:** `src/features/payment/services/paymentService.js`

**Функционал:**
- `generatePaymentLink(userId, amount, tariffId)` - запрос к API
- `checkPaymentStatus(orderId)` - проверка статуса платежа
- `handlePaymentSuccess(orderId)` - обработка успешной оплаты

### Шаг 6: Обработка webhook от YooMoney

**В `processPaymentNotification()`:**

1. После проверки SHA1 хеша:
   - Найти пользователя по `orderId` из коллекции `orders`
   - Найти тариф по `tariffId` из заказа
   - Обновить пользователя:
     - Установить `tariffId`, `tariffName`, `plan`
     - Вычислить `expiresAt` на основе `durationDays` тарифа
     - Установить `paymentStatus: 'paid'`
   
2. Создать/обновить клиента в 3x-ui:
   - Если у пользователя нет `uuid` - сгенерировать
   - Вызвать `xuiService.addClient()` или `ThreeXUI.addClient()`
   - Обновить `uuid` в Firestore

3. Создать запись в `payments`:
   - Статус `completed`
   - Сохранить все данные от YooMoney

4. Логирование:
   - Успешная оплата
   - Ошибки при обновлении подписки
   - Ошибки при создании клиента в 3x-ui

### Шаг 7: Обработка ошибок и edge cases

**Сценарии:**
1. Двойная оплата (один orderId оплачен дважды)
   - Проверять статус заказа перед обработкой
   - Игнорировать повторные уведомления

2. Несоответствие суммы
   - Сравнивать `amount` из уведомления с суммой заказа
   - Логировать несоответствия

3. Пользователь не найден
   - Логировать ошибку
   - Сохранять уведомление для ручной обработки

4. Ошибка создания клиента в 3x-ui
   - Логировать ошибку
   - Помечать заказ как требующий ручной обработки
   - Пользователь получает подписку, но без VPN доступа

### Шаг 8: UI/UX улучшения

1. **Страница ожидания оплаты:**
   - Показывать `orderId`
   - Таймер обратного отсчета
   - Кнопка "Проверить статус"
   - Автоматическая проверка статуса каждые 5 секунд

2. **Уведомления:**
   - Успешная оплата → редирект в личный кабинет
   - Ошибка оплаты → показать сообщение с возможностью повторить

3. **История платежей:**
   - Уже реализована в Dashboard
   - Добавить фильтрацию по статусу
   - Показать `orderId` для каждого платежа

### Шаг 9: Тестирование

**Тестовые сценарии:**
1. Генерация ссылки на оплату
2. Симуляция webhook от YooMoney (с правильным SHA1)
3. Симуляция webhook с неправильным SHA1 (должен отклонить)
4. Двойная обработка одного платежа
5. Обработка платежа для нового пользователя (создание в 3x-ui)
6. Обработка платежа для существующего пользователя (обновление подписки)

### Шаг 10: Безопасность

1. **Валидация webhook:**
   - Обязательная проверка SHA1 хеша
   - Проверка IP адресов YooMoney (опционально)
   - Rate limiting для webhook endpoint

2. **Хранение секретов:**
   - `YOOMONEY_SECRET_KEY` только в переменных окружения
   - Никогда не передавать в клиентский код

3. **Логирование:**
   - Логировать все попытки оплаты
   - Логировать отклоненные webhook (неправильный хеш)
   - Не логировать секретные ключи

## Порядок реализации

1. ✅ Создать `server/payment-handler.js` с SHA1 и базовыми функциями
2. ✅ Добавить endpoints в `n8n-webhook-proxy.js`
3. ✅ Обновить структуру Firestore (добавить поля в payments)
4. ✅ Создать `paymentService.js` на клиенте
5. ✅ Интегрировать с `dashboardService.createSubscription()`
6. ✅ Создать UI компоненты для оплаты
7. ✅ Реализовать обработку webhook с полной логикой
8. ✅ Добавить обработку ошибок
9. ✅ Тестирование
10. ✅ Документация

## Зависимости

**Сервер:**
- `crypto` (встроенный в Node.js) - для SHA1
- `firebase-admin` или доступ к Firestore через существующий сервис
- `axios` - уже установлен

**Клиент:**
- Существующие зависимости достаточны

## Конфигурация

**Переменные окружения (.env):**
```env
YOOMONEY_WALLET=410017383938322
YOOMONEY_SECRET_KEY=VK+sJ7uqS1HoYf8AY1ZBJnDQ
YOOMONEY_WEBHOOK_URL=https://your-domain.com/api/payment/webhook
```

## Вопросы для уточнения

1. Нужна ли интеграция с n8n или полностью на сервере?
2. Как обрабатывать частичные оплаты?
3. Нужна ли поддержка возвратов (refunds)?
4. Какой формат уведомлений от YooMoney (form-data или JSON)?
5. Нужна ли поддержка других платежных систем в будущем?
