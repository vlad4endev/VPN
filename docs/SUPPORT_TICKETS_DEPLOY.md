# Деплой правил Firestore для тикетов поддержки

Ошибка **«Missing or insufficient permissions»** в разделе «Тех. поддержка» возникает, если правила Firestore с тикетами не задеплоены в ваш проект Firebase.

## Что сделать

1. Установите Firebase CLI (если ещё не установлен):
   ```bash
   npm install -g firebase-tools
   ```

2. Войдите в аккаунт (если ещё не вошли):
   ```bash
   firebase login
   ```

3. Задеплойте только правила Firestore:
   ```bash
   cd /путь/к/проекту/VPN
   firebase deploy --only firestore:rules
   ```

После успешного деплоя правила из файла `firestore.rules` (включая блоки для `tickets` и `messages`) начнут применяться, и тикеты должны заработать.

## Проверка

- Откройте [Firebase Console](https://console.firebase.google.com) → ваш проект → Firestore Database → Rules.
- Убедитесь, что в правилах есть блоки `match /artifacts/{appId}/public/data/tickets/...` и `.../tickets/{ticketId}/messages/...`.
