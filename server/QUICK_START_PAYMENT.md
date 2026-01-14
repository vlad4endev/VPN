# 🚀 Быстрый старт Payment Server

## 1. Настройка переменных окружения

Добавьте в `.env` файл (или создайте новый):

```env
YOOMONEY_ACCESS_TOKEN=your_token_here
YOOMONEY_WALLET=410017383938322
PAYMENT_SERVER_PORT=3002
```

## 2. Запуск сервера

```bash
cd server
npm run payment:dev
```

Сервер запустится на `http://localhost:3002`

## 3. Тестовый запрос

```bash
curl -X POST http://localhost:3002/create-payment \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "order_test_123",
    "amount": 150
  }'
```

## 4. Что дальше?

- Backend создаст платеж и вернет `paymentURL`
- Пользователь откроет `paymentURL` и оплатит
- **n8n будет опрашивать operation-history по label (orderId)**
- После успешной оплаты n8n обновит статус и активирует подписку

## 📚 Подробная документация

См. `PAYMENT_SERVER_README.md`
